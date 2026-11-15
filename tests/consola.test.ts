import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { leerDiff } from "../src/nucleo/diff.js";
import { crearServidor } from "../src/servidor.js";
import { primeraLineaUtil } from "../src/nucleo/verificadores.js";
import { guardarCosecha } from "../src/nucleo/archivo.js";
import { escalonesDe, fasesSalteadas, filasDelDiff, portonDe, sinLasSalteadas } from "../ui/src/lib/datos.js";
import { cosechaDeVivo, fasesDe, haciendoDe, reducirVivo, resumenDeVivo, type Vivo } from "../ui/src/lib/vivo.js";
import type { Candidato } from "../src/nucleo/tipos.js";

/**
 * La consola: lo que decide qué cuenta el gráfico, lo que el servidor deja
 * leer y la frase que explica por qué murió un universo. Nada de eso se ve
 * en una captura.
 *
 * (`pantalla.test.ts` es otra cosa: el escalón que mira las páginas con las
 * cinco personas.)
 */

const correr = promisify(execFile);

const pasada = (verificador: string, paso: boolean, costo: "gratis" | "barato" | "caro" = "gratis") =>
  ({ verificador, costo, paso, detalle: `${verificador}: ${paso ? "pasó" : "falló"}`, gastado: 0, ms: 10 }) as const;

const ESCALONES = [
  { nombre: "sintaxis", costo: "gratis" },
  { nombre: "test", costo: "gratis" },
  { nombre: "peso", costo: "gratis" },
];

describe("los escalones salen de todos los candidatos", () => {
  it("no se pierden los que el primer candidato no llegó a ver", () => {
    // u1 muere en sintaxis y no ve ni test ni peso: si los escalones se
    // leyeran del primero, la grilla tendría una sola columna.
    const cosecha = {
      candidatos: [
        { pasadas: [pasada("sintaxis", false)] },
        { pasadas: [pasada("sintaxis", true), pasada("test", true), pasada("peso", true)] },
      ],
    };

    expect(escalonesDe(cosecha).map((e) => e.nombre)).toEqual(["sintaxis", "test", "peso"]);
  });
});

describe("el portón dibujado de una rama", () => {
  it("cada fase con su estado, lo que tardó y lo que dijo, agrupadas por costo en el orden en que corrieron", () => {
    const escalones = [
      { nombre: "configuración", costo: "gratis" as const },
      { nombre: "test", costo: "gratis" as const },
      { nombre: "pantalla", costo: "gratis" as const },
      { nombre: "revisión", costo: "barato" as const },
    ];
    const rama = {
      pasadas: [
        pasada("configuración", true),
        // Rebotó, se corrigió y pasó.
        { ...pasada("test", false), detalle: "test: ✖ suma mal" },
        { ...pasada("test", true), intento: 2 },
        // Una corrección la rompió y se deshizo: no cuenta como vuelta.
        { ...pasada("configuración", false), deshecha: true },
        { ...pasada("pantalla", true), salteada: true, detalle: "pantalla: no hay navegador, se salteó" },
      ],
    };
    const grupos = portonDe(rama, escalones);
    expect(grupos.map((g) => g.map((f) => [f.nombre, f.estado]))).toEqual([
      [
        ["configuración", "paso"],
        ["test", "paso"],
        ["pantalla", "salteada"],
      ],
      [["revisión", "nollego"]],
    ]);
    const [, test, pantalla] = grupos[0]!;
    // El motivo sin la fase ni la cruz: el color ya dice que cortó.
    expect(test).toMatchObject({ vueltas: 2, ms: 20, rebote: "suma mal" });
    expect(pantalla).toMatchObject({ dijo: "no hay navegador, se salteó" });
    // La que corre ahora se dice así, aunque todavía no tenga vueltas.
    expect(portonDe(rama, escalones, "revisión")[1]![0]!.estado).toBe("corriendo");
  });
});

describe("una fase que no corrió, en la pantalla", () => {
  it("se lee de la última vuelta de cada fase y se dice corto, para el chip", () => {
    const rama = {
      pasadas: [pasada("test", true), { ...pasada("pantalla", true), salteada: true }, { ...pasada("revisión", true), salteada: true }],
    };
    expect(fasesSalteadas(rama)).toEqual(["pantalla", "revisión"]);
    expect(sinLasSalteadas(fasesSalteadas(rama))).toBe("sin pantalla ni revisión");
    // Si la vuelta siguiente de la fase corrió, ya no está salteada.
    expect(fasesSalteadas({ pasadas: [{ ...pasada("revisión", true), salteada: true }, pasada("revisión", true)] })).toEqual([]);
  });

  it("la siembra en vivo trae la marca hasta la cosecha que se dibuja", () => {
    const vivo = [
      { t: 1, tipo: "siembra", tarea: "t", universos: 1 },
      { t: 2, tipo: "nace", u: "u1", enfoque: "x" },
      { t: 3, tipo: "escribio", u: "u1", archivos: 1, agregadas: 1, quitadas: 0 },
      { t: 4, tipo: "veredicto", u: "u1", verificador: "revisión", paso: true, salteada: true, detalle: "revisión: se salteó", ms: 10 },
    ] as const;
    const estado = vivo.reduce<Vivo | null>((e, ev) => reducirVivo(e, ev), null)!;
    expect(fasesSalteadas(cosechaDeVivo(estado).candidatos[0]!)).toEqual(["revisión"]);
  });
});

describe("la siembra en vivo, evento a evento", () => {
  const evs = (lista: Parameters<typeof reducirVivo>[1][]) =>
    lista.reduce<Vivo | null>((estado, e) => reducirVivo(estado, e), null);

  it("un intento nace, escribe, entra al testing y se corta donde falló", () => {
    const vivo = evs([
      { t: 1, tipo: "siembra", tarea: "arreglar el IVA", universos: 2 },
      { t: 2, tipo: "nace", u: "u1", enfoque: "mínimo" },
      { t: 3, tipo: "escribio", u: "u1", archivos: 1, agregadas: 9, quitadas: 2, modelo: "haiku" },
      { t: 4, tipo: "verifica", u: "u1", verificador: "test", costo: "gratis" },
      { t: 5, tipo: "veredicto", u: "u1", verificador: "test", paso: false, detalle: "test: ✖ suma mal", ms: 900 },
    ])!;

    const u1 = vivo.intentos[0]!;
    expect(u1.vivo).toBe(false);
    expect(u1.murioEn).toBe("test");
    expect(u1.haciendo).toBeNull();

    // Como cosecha dibujable: la fase «escribe» pasó, el test se cortó.
    const c = cosechaDeVivo(vivo).candidatos[0]!;
    expect(c.pasadas.map((p) => [p.verificador, p.paso])).toEqual([
      ["escribe", true],
      ["test", false],
    ]);
  });

  it("una rama que rebota y se corrige vuelve a estar en juego: no queda «cortada» si después pasa", () => {
    // El orden exacto que emite el portón con el bucle de corrección.
    const vivo = evs([
      { t: 1, tipo: "siembra", tarea: "arreglar el IVA", universos: 1 },
      { t: 2, tipo: "nace", u: "u1", enfoque: "mínimo" },
      { t: 3, tipo: "escribio", u: "u1", archivos: 1, agregadas: 2, quitadas: 1 },
      { t: 4, tipo: "verifica", u: "u1", verificador: "test", costo: "gratis" },
      { t: 5, tipo: "veredicto", u: "u1", verificador: "test", paso: false, detalle: "test: ✖ suma mal", ms: 900 },
      { t: 6, tipo: "corrige", u: "u1", verificador: "test", intento: 2 },
      { t: 7, tipo: "verifica", u: "u1", verificador: "test", costo: "gratis" },
      { t: 8, tipo: "veredicto", u: "u1", verificador: "test", paso: true, detalle: "test: pasó", ms: 700, intento: 2 },
      { t: 9, tipo: "verifica", u: "u1", verificador: "revisión", costo: "barato" },
    ])!;
    const u1 = vivo.intentos[0]!;
    expect(u1).toMatchObject({ vivo: true, haciendo: "revisión" });
    expect(u1.murioEn).toBeUndefined();
    expect(resumenDeVivo(vivo)).not.toContain("se cort");
  });

  it("mientras una fase corre, la celda lo sabe", () => {
    const vivo = evs([
      { t: 1, tipo: "siembra", tarea: "t", universos: 1 },
      { t: 2, tipo: "nace", u: "u1", enfoque: "x" },
      { t: 3, tipo: "escribio", u: "u1", archivos: 1, agregadas: 1, quitadas: 0 },
      { t: 4, tipo: "verifica", u: "u1", verificador: "sintaxis", costo: "gratis" },
    ])!;

    expect(haciendoDe(vivo)).toEqual({ u1: "sintaxis" });
    // Las fases arrancan por «escribe» aunque nadie haya terminado ninguna.
    expect(fasesDe(vivo).map((f) => f.nombre)).toEqual(["escribe", "sintaxis"]);
  });

  it("sin el evento siembra no hay vivo: la historia suelta no inventa pantalla", () => {
    expect(reducirVivo(null, { t: 1, tipo: "nace", u: "u1", enfoque: "x" })).toBeNull();
  });

  it("el evento cosecha lo marca terminado", () => {
    const vivo = evs([
      { t: 1, tipo: "siembra", tarea: "t", universos: 1 },
      { t: 2, tipo: "cosecha" },
    ])!;
    expect(vivo.termino).toBe(true);
  });
});

describe("el diff como lo lee una persona", () => {
  it("una fila por archivo con lo que sumó y sacó, sin lo que es para git, y cada línea con su número", () => {
    const diff = [
      "diff --git a/src/plata.js b/src/plata.js",
      "index 3b18e51..a2c4f0d 100644",
      "--- a/src/plata.js",
      "+++ b/src/plata.js",
      "@@ -10,3 +10,3 @@ export function conIva(neto, alicuota) {",
      " const iva = 21;",
      "-  return neto + alicuota;",
      "+  return neto * (1 + alicuota);",
      "--- un comentario de SQL que se sacó",
      " }",
      "diff --git a/LEEME.md b/LEEME.md",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/LEEME.md",
      "@@ -0,0 +1 @@",
      "+--- una línea de markdown que empieza como un encabezado de git",
      "\\ No newline at end of file",
      "",
    ].join("\n");
    expect(filasDelDiff(diff)).toEqual([
      { tipo: "archivo", ruta: "src/plata.js", agregadas: 1, quitadas: 2 },
      { tipo: "trozo", texto: "export function conIva(neto, alicuota) {" },
      { tipo: "linea", clase: "ctx", numero: 10, texto: "const iva = 21;" },
      { tipo: "linea", clase: "menos", numero: 11, texto: "  return neto + alicuota;" },
      { tipo: "linea", clase: "mas", numero: 11, texto: "  return neto * (1 + alicuota);" },
      // Adentro de un trozo, «--- …» es una línea quitada que empezaba con «-- », no una cabecera.
      { tipo: "linea", clase: "menos", numero: 12, texto: "-- un comentario de SQL que se sacó" },
      { tipo: "linea", clase: "ctx", numero: 12, texto: "}" },
      { tipo: "archivo", ruta: "LEEME.md", agregadas: 1, quitadas: 0 },
      { tipo: "trozo", texto: "" },
      // Adentro de un trozo, una línea que empieza con «---» es contenido, no un encabezado.
      { tipo: "linea", clase: "mas", numero: 1, texto: "--- una línea de markdown que empieza como un encabezado de git" },
    ]);
  });
});

describe("leer el diff de un universo", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-diff-"));
    await writeFile(join(repo, "a.js"), "export const a = 1;\n");
    await correr("git", ["init", "-q"], { cwd: repo });
    await correr("git", ["add", "-A"], { cwd: repo });
    await correr("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: repo });
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("ve un archivo NUEVO, igual que al medir la forma", async () => {
    await writeFile(join(repo, "b.test.js"), "export const b = 2;\n");

    const diff = await leerDiff(repo);
    expect(diff.hay).toBe(true);
    expect(diff.texto).toContain("b.test.js");
  });

  it("un worktree ya limpiado no es un error: explica cómo conservarlos", async () => {
    const diff = await leerDiff(join(repo, "no-existe"));
    expect(diff.hay).toBe(false);
    expect(diff.porQue).toContain("--sucio");
  });

  it("sin cambios lo dice, en vez de mostrar una pantalla en blanco", async () => {
    const diff = await leerDiff(repo);
    expect(diff.hay).toBe(false);
    expect(diff.porQue).toContain("ningún cambio");
  });
});

describe("el servidor de la pantalla", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";

  const candidato = (id: string): Candidato => ({
    universo: { id, rama: "x", ruta: join(tmpdir(), "no-existe", id), nacido: 0 },
    vivo: true,
    pasadas: [],
  });

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-serv-"));
    await guardarCosecha(
      { tarea: "t", candidatos: [candidato("u1")], ganador: candidato("u1"), gastado: 0, muertosGratis: 0, ms: 1 },
      repo,
    );

    servidor = crearServidor({ repo });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const dir = servidor.address() as { port: number };
    base = `http://127.0.0.1:${dir.port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  it("el id del turno NO puede salirse de las cosechas del repo", async () => {
    // Sin la validación, `?id=../../algo` sería leer cualquier archivo de
    // la máquina por HTTP. El id se acepta sólo si ya está en el historial.
    const afuera = await fetch(`${base}/api/cosecha?id=${encodeURIComponent("../../../../etc/passwd")}`);
    expect(afuera.status).toBe(200);
    expect(await afuera.json()).toMatchObject({ cosecha: null });
  });

  it("el diff se pide por id de universo, nunca por ruta", async () => {
    // El navegador manda «u1», no una carpeta: la ruta la pone el núcleo.
    const ajeno = await fetch(`${base}/api/diff?u=${encodeURIComponent("../../secreto")}`);
    expect(ajeno.status).toBe(404);

    const propio = await fetch(`${base}/api/diff?u=u1`);
    expect(propio.status).toBe(200);
  });

  it("el historial trae el id con el que se pide cada turno", async () => {
    const { cosechas } = (await (await fetch(`${base}/api/historial`)).json()) as {
      cosechas: { id: string }[];
    };
    expect(cosechas).toHaveLength(1);
    expect(cosechas[0]!.id).toMatch(/\.json$/);

    const uno = await fetch(`${base}/api/cosecha?id=${encodeURIComponent(cosechas[0]!.id)}`);
    expect((await uno.json()).cosecha).toMatchObject({ tarea: "t" });
  });

  it("sembrar desde la consola exige el pase que viaja en la página", async () => {
    const pedidos: unknown[] = [];
    const conSembrador = crearServidor({ repo, sembrar: (p) => pedidos.push(p) });
    await new Promise<void>((listo) => conSembrador.listen(0, "127.0.0.1", listo));
    const puerto = (conSembrador.address() as { port: number }).port;
    const baseS = `http://127.0.0.1:${puerto}`;

    try {
      // Sin token: 403. Es lo que frena a cualquier otro sitio del navegador.
      const sinToken = await fetch(`${baseS}/api/sembrar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tarea: "x" }),
      });
      expect(sinToken.status).toBe(403);
      expect(pedidos).toHaveLength(0);

      // El pase sale de la página que sirve ESTE servidor.
      const respuestaPagina = await fetch(`${baseS}/`);
      const pagina = await respuestaPagina.text();
      const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(pagina)?.[1];

      if (token) {
        // Y esa página no se guarda: una copia vieja mandaría el pase de la corrida anterior.
        expect(respuestaPagina.headers.get("cache-control")).toBe("no-store");
        const conToken = await fetch(`${baseS}/api/sembrar`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-dolphin-token": token },
          body: JSON.stringify({ tarea: "arreglar algo", n: 3, agente: "mentira" }),
        });
        expect(conToken.status).toBe(202);
        expect(pedidos).toMatchObject([{ tarea: "arreglar algo", n: 3, agente: "mentira" }]);
        expect(pedidos[0]).not.toHaveProperty("guardarTodas");

        // Guardar el código de todas las ramas viaja solo si se pidió, y solo como true.
        for (const guardarTodas of [true, "si"]) {
          await fetch(`${baseS}/api/sembrar`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-dolphin-token": token },
            body: JSON.stringify({ tarea: "otra", n: 1, agente: "mentira", guardarTodas }),
          });
        }
        expect(pedidos[1]).toMatchObject({ tarea: "otra", guardarTodas: true });
        expect(pedidos[2]).not.toHaveProperty("guardarTodas");
      } else {
        // Sin la consola construida no hay página que lleve el pase: el
        // endpoint queda cerrado, que es exactamente lo que se quiere.
        expect(pagina).not.toContain("dolphin-token");
      }
    } finally {
      await new Promise((listo) => conSembrador.close(listo));
    }
  });

  it("las fuentes se sirven como fuentes, o el navegador las descarta", async () => {
    const r = await fetch(`${base}/fuentes/inter-latin.woff2`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("font/woff2");
  });

  it("no se sale de la carpeta de la UI", async () => {
    const r = await fetch(`${base}/../package.json`, { redirect: "manual" });
    expect(r.status).not.toBe(200);
  });
});

describe("la consola no pide nada a internet", () => {
  it("ni una URL externa en el código fuente de la consola", async () => {
    const { readFile, readdir } = await import("node:fs/promises");
    const raiz = new URL("../ui/src/", import.meta.url);

    const archivos: URL[] = [new URL("../ui/index.html", import.meta.url)];
    const recorrer = async (dir: URL) => {
      for (const entrada of await readdir(dir, { withFileTypes: true })) {
        const url = new URL(entrada.name + (entrada.isDirectory() ? "/" : ""), dir);
        if (entrada.isDirectory()) await recorrer(url);
        // Los tests quedan afuera: no se empaquetan ni se sirven, y una URL de GitHub como dato
        // de prueba (la de un issue, sin ir a ningún lado) no es la consola pidiendo nada. Lo que
        // de verdad se sirve lo vigila el test de abajo, sobre el build.
        else if (/\.(tsx?|css|html)$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) archivos.push(url);
      }
    };
    await recorrer(raiz);

    for (const archivo of archivos) {
      const texto = await readFile(archivo, "utf8");
      // Una herramienta local que se cuelga de tres CDNs se ve rota en un
      // VPS sin salida: los íconos se dibujan como la palabra «waves».
      expect(texto, `${archivo.pathname} pide algo de afuera`).not.toMatch(
        /https?:\/\/(?!127\.0\.0\.1|localhost)/,
      );
    }
  });

  it("tampoco el build, si está construido", async () => {
    const { readFile, readdir } = await import("node:fs/promises");
    const dir = new URL("../ui/dist/assets/", import.meta.url);
    const archivos = await readdir(dir).catch(() => [] as string[]);

    for (const archivo of archivos.filter((a) => /\.(js|css)$/.test(a))) {
      const texto = await readFile(new URL(archivo, dir), "utf8");
      // Las librerías meten URLs en comentarios y mensajes de error; lo que
      // importa es que nada se CARGUE de afuera: import(), fetch, src/href.
      expect(texto, `${archivo} carga algo de afuera`).not.toMatch(
        /(?:import\(|fetch\(|src=|href=|url\()["'`]https?:\/\//,
      );
    }
  });
});

describe("por qué murió un universo, en una línea que sirva", () => {
  it("el nombre del test roto le gana al contador del resumen", () => {
    // Es exactamente lo que escupe `node --test`: el contador sale antes.
    const salida = [
      "ℹ tests 2",
      "ℹ suites 0",
      "ℹ pass 1",
      "ℹ fail 1",
      "✖ failing tests:",
      "✖ conIva con 0 (0.6798ms)",
      "  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:",
    ].join("\n");

    expect(primeraLineaUtil(salida)).toBe("✖ conIva con 0");
  });

  it("no se queda con «# fail 2» ni con «Tests: 3 failed»", () => {
    expect(primeraLineaUtil("# fail 2\nnot ok 3 - suma mal")).not.toContain("fail 2");
    expect(primeraLineaUtil("Tests: 3 failed, 1 passed\n  ● el carrito no suma")).toContain("carrito");
  });

  it("si no hay nada jugoso, devuelve la primera línea igual", () => {
    expect(primeraLineaUtil("algo salió distinto\notra línea")).toBe("algo salió distinto");
  });
});

describe("el eco de npm no es un motivo", () => {
  it("un verificador que falla sin decir «error» reporta lo que midió", () => {
    // `npm run peso` abre con dos líneas de eco; la que importa es la tercera.
    const salida = [
      "> demo@1.0.0 peso",
      "> node scripts/peso.js",
      "",
      "plata.js pesa 412 bytes y el tope es 320",
    ].join("\n");

    expect(primeraLineaUtil(salida)).toBe("plata.js pesa 412 bytes y el tope es 320");
  });
});
