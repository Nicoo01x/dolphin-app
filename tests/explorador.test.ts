import { describe, expect, it } from "vitest";
import {
  explorar,
  invalidar,
  problemaDeReaccion,
  type Cobertura,
  type Elemento,
  type Estado,
  type Medicion,
  type PaginaExplorable,
  type Reaccion,
} from "../src/tester/explorador.js";

/**
 * El explorador contra una app de mentira: recorre como una persona, anota
 * lo que no anda, no toca lo peligroso y —lo que pidió Nico— no revisa
 * dieciocho veces la misma sección.
 */

type ElementoFalso = Elemento & {
  /** Qué pasa al tocarlo. */
  readonly hace?: Partial<Reaccion> & { readonly abre?: string };
};

interface PantallaFalsa {
  readonly firma: string;
  readonly elementos: readonly ElementoFalso[];
  readonly mediciones?: readonly Medicion[];
}

const SIN_NADA: Reaccion = { navego: false, cambio: false, errores: [], fallasDeRed: [] };

/** Una app de mentira: URL → pantalla, y sub-pantallas que abre una pestaña. */
function appFalsa(pantallas: Record<string, PantallaFalsa>) {
  let url = "";
  let sub = "";
  const toques: string[] = [];
  const clave = () => (sub ? `${url}#${sub}` : url);

  const pagina: PaginaExplorable = {
    async ir(destino) {
      url = destino;
      sub = "";
    },
    async estado(): Promise<Estado> {
      const p = pantallas[clave()]!;
      return { ruta: sub ? `${url} · ${sub}` : url, firma: p.firma };
    },
    async elementos() {
      return pantallas[clave()]!.elementos.map(({ hace: _hace, ...e }) => e);
    },
    async tocar(elemento) {
      toques.push(`${clave()}>${elemento.texto}`);
      const e = pantallas[clave()]!.elementos.find((x) => x.texto === elemento.texto && x.n === elemento.n);
      if (!e) return { ...SIN_NADA, noSePudo: "no está" };
      if (e.hace?.abre) {
        sub = e.hace.abre;
        return { ...SIN_NADA, cambio: true };
      }
      return { ...SIN_NADA, ...e.hace };
    },
    async medir() {
      return [...(pantallas[clave()]!.mediciones ?? [])];
    },
    async capturar(nombre) {
      return `${nombre.replace(/\W+/g, "-")}.png`;
    },
  };
  return { pagina, toques };
}

const enlace = (texto: string, destino: string): ElementoFalso => ({ rol: "enlace", texto, n: 0, destino });
const boton = (texto: string, hace?: ElementoFalso["hace"]): ElementoFalso => ({ rol: "boton", texto, n: 0, ...(hace ? { hace } : {}) });

const APP: Record<string, PantallaFalsa> = {
  "/": {
    firma: "home",
    elementos: [enlace("Alta", "/alta"), enlace("Ayuda", "/ayuda"), boton("Ver más", { cambio: true })],
  },
  "/alta": {
    firma: "alta",
    elementos: [
      enlace("Volver al inicio", "/"),
      boton("Guardar"), // muerto: no hace nada
      boton("Exportar", { errores: ["TypeError: cannot read properties of undefined (reading 'filas')"] }),
      boton("Borrar cuenta", { navego: true }), // peligroso: no se toca nunca
    ],
    mediciones: [{ tipo: "desborde", donde: "table.facturas", detalle: "se sale 130 px a la derecha en 360 px de ancho" }],
  },
  "/ayuda": {
    firma: "ayuda",
    elementos: [enlace("Inicio", "/"), enlace("Alta", "/alta")],
  },
};

const vacia = (): Cobertura => ({ estados: {} });

describe("el explorador", () => {
  it("recorre la app, anota lo que no anda en voz humana y no toca lo peligroso", async () => {
    const { pagina, toques } = appFalsa(APP);
    const informe = await explorar(pagina, vacia(), { inicio: "/" });

    expect(informe.revisados.map((e) => e.ruta)).toEqual(["/", "/alta", "/ayuda"]);
    expect(toques.some((t) => t.includes("Borrar cuenta"))).toBe(false);

    const titulos = informe.asuntos.map((a) => a.titulo);
    expect(titulos).toContain("Tocar «Guardar» no hace nada");
    expect(titulos).toContain("Al tocar «Exportar» la página tira un error");
    expect(titulos).toContain("Algo se sale de la pantalla: table.facturas");

    const muerto = informe.asuntos.find((a) => a.titulo === "Tocar «Guardar» no hace nada")!;
    expect(muerto.pasos).toEqual(["Abrí /", "Tocá el enlace «Alta»", "Tocá «Guardar»"]);
    expect(muerto.donde).toBe("/alta");
    expect(muerto.captura).toBeDefined();

    const conError = informe.asuntos.find((a) => a.titulo.includes("Exportar"))!;
    expect(conError.evidencia).toContain("reading 'filas'");
  });

  it("no toca lo que no tiene vuelta atrás, ni visita un enlace que lleva a cerrar la sesión", async () => {
    const irreversibles = ["Mergear a main", "Abrir PR", "Emitir factura", "Anular", "Mandar la factura", "Aprobar", "Cancelar suscripción", "Sí", "Invitar"];
    const { pagina, toques } = appFalsa({
      "/": { firma: "home", elementos: [...irreversibles.map((t) => boton(t, { cambio: true })), enlace("Inicio", "/logout"), enlace("Otra app", "https://otro.sitio/x")] },
    });
    const visitadas: string[] = [];
    const ir = pagina.ir.bind(pagina);
    pagina.ir = async (url) => {
      visitadas.push(url);
      return ir(url);
    };
    await explorar(pagina, vacia(), { inicio: "/" });
    expect(toques).toEqual([]);
    expect(visitadas).not.toContain("/logout");
    expect(visitadas).not.toContain("https://otro.sitio/x");
  });

  it("una pantalla que no abre es un hallazgo de esa pantalla, y el recorrido sigue", async () => {
    const { pagina } = appFalsa(APP);
    const ir = pagina.ir.bind(pagina);
    pagina.ir = async (url) => {
      if (url === "/alta") throw new Error("net::ERR_ABORTED");
      return ir(url);
    };
    const informe = await explorar(pagina, vacia(), { inicio: "/" });
    expect(informe.revisados.map((e) => e.ruta)).toEqual(["/", "/ayuda"]);
    expect(informe.asuntos.map((a) => a.titulo)).toContain("Una pantalla no se pudo abrir");
  });

  it("una página que se trabó corta el recorrido con el porqué, sin colgarse", async () => {
    const { pagina } = appFalsa(APP);
    pagina.medir = async () => {
      throw new Error("la página se trabó: dejó de contestar (un bucle que no termina)");
    };
    const informe = await explorar(pagina, vacia(), { inicio: "/" });
    expect(informe.asuntos.map((a) => a.titulo)).toEqual(["La página se trabó: dejó de contestar"]);
  });

  it("las visitas tienen tope: un «Mes siguiente» infinito no recorre 300 páginas", async () => {
    const pantallas: Record<string, PantallaFalsa> = {};
    for (let mes = 0; mes < 400; mes++) pantallas[`/mes/${mes}`] = { firma: `mes-${mes}`, elementos: [enlace("Mes siguiente", `/mes/${mes + 1}`)] };
    const { pagina } = appFalsa(pantallas);
    const informe = await explorar(pagina, vacia(), { inicio: "/mes/0", topeDeAcciones: 6, topeDeVisitas: 10 });
    expect(informe.revisados).toHaveLength(10);
  });

  it("no cae en bucle: tres pantallas que se apuntan entre sí se revisan una vez cada una", async () => {
    const { pagina, toques } = appFalsa(APP);
    const informe = await explorar(pagina, vacia(), { inicio: "/" });
    expect(informe.revisados).toHaveLength(3);
    // Los botones se tocan una vez cada uno; los enlaces no se clickean, se visitan.
    const botones = toques.filter((t) => !t.includes("Alta") && !t.includes("Ayuda") && !t.includes("Inicio"));
    expect(new Set(botones).size).toBe(botones.length);
  });

  it("una sección ya revisada no se vuelve a revisar mientras su código no cambie", async () => {
    const primera = appFalsa(APP);
    const uno = await explorar(primera.pagina, vacia(), { inicio: "/" });

    const segunda = appFalsa(APP);
    const dos = await explorar(segunda.pagina, uno.cobertura, { inicio: "/" });
    expect(dos.revisados).toHaveLength(0);
    expect(dos.salteados).toBe(3);
    expect(dos.acciones).toBe(0);
    expect(segunda.toques).toEqual([]); // ni un botón tocado
  });

  it("lo que el diff toca se vuelve a revisar, y SOLO eso", async () => {
    const uno = await explorar(appFalsa(APP).pagina, vacia(), { inicio: "/" });

    const { cobertura, invalidados } = invalidar(uno.cobertura, { superficies: ["/alta"] });
    expect(invalidados).toBe(1);

    const tres = await explorar(appFalsa(APP).pagina, cobertura, { inicio: "/" });
    expect(tres.revisados.map((e) => e.ruta)).toEqual(["/alta"]);
  });

  it("también invalida por los archivos del diff, por la palabra de la ruta", () => {
    const cobertura: Cobertura = {
      estados: {
        "/alta#a": { ruta: "/alta", firma: "a", revisado: "", acciones: 1, hallazgos: 0 },
        "/ayuda#b": { ruta: "/ayuda", firma: "b", revisado: "", acciones: 1, hallazgos: 0 },
      },
    };
    const { cobertura: nueva, invalidados } = invalidar(cobertura, { archivos: ["src/pantallas/alta/Formulario.tsx"] });
    expect(invalidados).toBe(1);
    expect(nueva.estados["/alta#a"]!.vieja).toBe(true);
    expect(nueva.estados["/ayuda#b"]!.vieja).toBeUndefined();
  });

  it("en una app de una sola página sigue las pestañas con su camino de clics", async () => {
    const spa: Record<string, PantallaFalsa> = {
      "/": {
        firma: "nueva",
        elementos: [{ rol: "pestaña", texto: "Memoria", n: 0, hace: { abre: "memoria" } }],
      },
      "/#memoria": {
        firma: "memoria",
        elementos: [boton("Guardar el perfil")], // muerto adentro de la pestaña
      },
    };
    const { pagina } = appFalsa(spa);
    const informe = await explorar(pagina, vacia(), { inicio: "/" });

    expect(informe.revisados.map((e) => e.ruta)).toEqual(["/", "/ · memoria"]);
    const muerto = informe.asuntos.find((a) => a.titulo.includes("Guardar el perfil"))!;
    expect(muerto.pasos).toEqual(["Abrí /", "Tocá la pestaña «Memoria»", "Tocá «Guardar el perfil»"]);
  });

  it("un botón que solo cambia su propio texto («Copiado») respondió: no es una pantalla nueva", async () => {
    const app: Record<string, PantallaFalsa> = {
      "/": { firma: "x", elementos: [boton("Copiar", { cambio: true, soloElPropio: true })] },
    };
    const informe = await explorar(appFalsa(app).pagina, vacia(), { inicio: "/" });
    expect(informe.asuntos).toEqual([]);
    expect(informe.revisados).toHaveLength(1);
    expect(informe.sanas).toEqual([{ donde: "/", texto: "Copiar" }]);
  });

  it("un desborde se cuenta por su causa: si se sabe qué se sale, «la página scrollea» no suma otro", async () => {
    const app: Record<string, PantallaFalsa> = {
      "/": {
        firma: "x",
        elementos: [],
        mediciones: [
          { tipo: "desborde", donde: "div.tabla", detalle: "se sale 300 px de la pantalla" },
          { tipo: "desborde", donde: "la página", detalle: "scrollea 300 px para el costado" },
        ],
      },
    };
    const informe = await explorar(appFalsa(app).pagina, vacia(), { inicio: "/" });
    expect(informe.asuntos.map((a) => a.titulo)).toEqual(["Algo se sale de la pantalla: div.tabla"]);
  });

  it("respeta el tope de acciones aunque la app sea enorme", async () => {
    const enorme: Record<string, PantallaFalsa> = {
      "/": { firma: "x", elementos: Array.from({ length: 40 }, (_, i) => boton(`Botón ${i}`, { cambio: true })) },
    };
    const informe = await explorar(appFalsa(enorme).pagina, vacia(), { inicio: "/", topeDeAcciones: 5, topePorEstado: 40 });
    expect(informe.acciones).toBe(5);
  });
});

describe("qué cuenta como error al tocar algo", () => {
  const guardar: Elemento = { rol: "boton", texto: "Guardar", n: 0 };

  it("si navegó o cambió algo, anduvo", () => {
    expect(problemaDeReaccion({ ...SIN_NADA, navego: true }, guardar)).toBeNull();
    expect(problemaDeReaccion({ ...SIN_NADA, cambio: true }, guardar)).toBeNull();
  });

  it("un texto de error en pantalla es un error aunque algo haya cambiado", () => {
    const p = problemaDeReaccion({ ...SIN_NADA, cambio: true, textoDeError: "undefined" }, guardar);
    expect(p?.titulo).toBe("Al tocar «Guardar» aparece «undefined»");
  });

  it("un 404 se cuenta una vez, como pedido fallido, aunque deje su error en la consola", () => {
    const p = problemaDeReaccion(
      { ...SIN_NADA, errores: ["Failed to load resource: the server responded with a status of 404 (File not found)"], fallasDeRed: ["GET /api/pdf/42 → 404"] },
      guardar,
    );
    expect(p?.titulo).toBe("Al tocar «Guardar» falla un pedido al servidor");
  });

  it("un pedido que falla se cuenta con su evidencia", () => {
    const p = problemaDeReaccion({ ...SIN_NADA, cambio: true, fallasDeRed: ["POST /api/alta → 500"] }, guardar);
    expect(p?.evidencia).toBe("POST /api/alta → 500");
  });
});
