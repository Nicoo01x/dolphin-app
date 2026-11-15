import { createServer, type Server } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { explorar } from "../src/tester/explorador.js";
import { abrirNavegadorExplorable } from "../src/tester/explorador-playwright.js";

/**
 * Lo primero que hace alguien que no sabe qué completar es tocar «Guardar»
 * a ver qué pasa: el formulario tiene que avisar qué falta. Se prueba en un
 * Chrome de verdad, porque el aviso del navegador («completá este campo»)
 * no está en la página: sin Chrome ni Edge, se saltea.
 */

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Formularios</title></head><body>
<h1>Formularios</h1>
<form id="cuenta"><label>Email <input name="email" required></label><button>Crear cuenta</button></form>
<form id="nota" novalidate><label>Nota <input name="nota"></label><p class="msg"></p><button type="submit">Guardar nota</button></form>
<form id="consulta"><label>Consulta <input name="consulta"></label><button>Mandar consulta</button></form>
<form id="lista"><label>Producto <input name="producto"></label><button>Agregar</button></form>
<form id="avisos"><label>Tu email <input type="email" name="correo" required></label><button>Avisame</button></form>
<form role="search"><input type="search" name="q" aria-label="Buscar"><button>Buscar</button></form>
<script>
document.getElementById("nota").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!e.target.nota.value) e.target.querySelector(".msg").textContent = "Escribí algo primero";
});
document.getElementById("consulta").addEventListener("submit", (e) => {
  e.preventDefault();
  fetch("/guardar", { method: "POST", body: new FormData(e.target) });
});
document.getElementById("lista").addEventListener("submit", (e) => e.preventDefault());
</script></body></html>`;

let servidor: Server;
let url = "";
let capturas = "";
const disponible = await abrirNavegadorExplorable({ carpetaCapturas: join(tmpdir(), "dolphin-sonda-formularios") }).then(async (n) => {
  if (!n) return false;
  await n.cerrar();
  return true;
});

describe.skipIf(!disponible)("formularios mandados vacíos, en un Chrome de verdad", () => {
  beforeAll(async () => {
    capturas = await mkdtemp(join(tmpdir(), "dolphin-formularios-"));
    servidor = createServer((pedido, respuesta) => {
      if (pedido.method === "POST") {
        respuesta.writeHead(200, { "content-type": "application/json" });
        return respuesta.end("{}");
      }
      respuesta.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      respuesta.end(PAGINA);
    });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const direccion = servidor.address();
    url = `http://127.0.0.1:${typeof direccion === "object" && direccion ? direccion.port : 0}/`;
  });

  afterAll(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(capturas);
  });

  it("avisa: bien; se manda vacío o no dice nada: hallazgo; y el de búsqueda no se toca", async () => {
    const navegador = (await abrirNavegadorExplorable({ carpetaCapturas: capturas }))!;
    try {
      const pagina = navegador.pagina;
      await pagina.ir(url);
      const formularios = await pagina.formularios!();
      expect(formularios.map((f) => f.nombre)).toEqual(["Crear cuenta", "Guardar nota", "Mandar consulta", "Agregar", "Avisame"]);
      // El email se reconoce por su tipo o por cómo se llama el campo.
      expect(formularios.filter((f) => f.email).map((f) => f.nombre)).toEqual(["Crear cuenta", "Avisame"]);
      // Los botones que mandan formularios quedan marcados: no se prueban como botones sueltos.
      const elementos = await pagina.elementos();
      expect(elementos.filter((e) => e.envia).map((e) => e.texto)).toEqual(["Crear cuenta", "Guardar nota", "Mandar consulta", "Agregar", "Avisame"]);
      expect(elementos.find((e) => e.texto === "Buscar")?.envia).toBeUndefined();

      // El «required» del navegador avisa aunque su globito no esté en la página.
      expect(await pagina.enviarVacio!({ nombre: "Crear cuenta", n: 0, campos: 1 })).toMatchObject({ aviso: true, seMando: false });
      await pagina.ir(url);
      expect(await pagina.enviarVacio!({ nombre: "Guardar nota", n: 0, campos: 1 })).toMatchObject({ aviso: true, seMando: false });
      await pagina.ir(url);
      expect(await pagina.enviarVacio!({ nombre: "Mandar consulta", n: 0, campos: 1 })).toMatchObject({ aviso: false, seMando: true });
      await pagina.ir(url);
      expect(await pagina.enviarVacio!({ nombre: "Agregar", n: 0, campos: 1 })).toMatchObject({ aviso: false, seMando: false });
      // Con «hola» en el email: el type="email" del navegador avisa; un campo que solo se llama email, no.
      await pagina.ir(url);
      expect(await pagina.enviarConEmailMalo!({ nombre: "Avisame", n: 0, campos: 1, email: true })).toMatchObject({ aviso: true, seMando: false });
      await pagina.ir(url);
      expect(await pagina.enviarConEmailMalo!({ nombre: "Crear cuenta", n: 0, campos: 1, email: true })).toMatchObject({ aviso: false, seMando: true });

      // Explorando: dos hallazgos, en voz humana, y ningún «no hace nada» falso por el «required».
      const informe = await explorar(pagina, { estados: {} }, { inicio: url });
      expect(informe.asuntos.map((a) => a.titulo).sort()).toEqual([
        "Mandar «Agregar» vacío no avisa qué falta",
        "«Crear cuenta» acepta un email mal escrito",
        "«Mandar consulta» se manda vacío",
      ]);
      // Y lo que anduvo queda dicho: es la evidencia a favor que ve el juez de Vision.
      expect(informe.comprobado).toEqual(
        expect.arrayContaining([
          "Mandé «Crear cuenta» sin completar nada y avisó qué faltaba (/)",
          "Mandé «Avisame» sin completar nada y avisó qué faltaba (/)",
          "Mandé «Avisame» con un email mal escrito («hola») y avisó que estaba mal (/)",
        ]),
      );
      const consulta = informe.asuntos.find((a) => a.titulo.startsWith("«Mandar consulta»"))!;
      expect(consulta.pasos?.at(-1)).toBe("Sin completar ningún campo, tocá «Mandar consulta»");
      expect(consulta.captura).toMatch(/\.png$/);
    } finally {
      await navegador.cerrar();
    }
  }, 60_000);
});
