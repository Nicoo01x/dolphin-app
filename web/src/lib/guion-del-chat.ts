/**
 * Lo que Dolphin hace cuando le pedís algo, paso por paso.
 *
 * Es el guion de la demo de la home: la misma conversación que se ve en la app —el pedido, las
 * herramientas con su marca, los compañeros que se abren cuando el trabajo se parte, el portón
 * cruzando sus fases y la rama que queda— reproducida en el sitio. Acá no corre ningún agente y la
 * demo lo dice: es una grabación, y todo lo que muestra son cosas que el producto hace.
 *
 * Lo que entra en el guion es lo mejor que tiene la app, que es lo que Nico pidió ver (09/11/2026:
 * «con las mejores cosas de UX que hemos logrado»): la marca en círculo que se cierra cuando la
 * herramienta termina, el reparto en compañeros con un modelo cada uno, y las ocho fases del
 * portón corriendo de lo gratis a lo caro.
 *
 * `tests/guion-del-chat.test.ts` vigila lo que no se puede aflojar: que los tiempos sólo avancen,
 * que todo guion termine entregando una rama, y que ninguna fila invente una herramienta que la
 * app no tiene.
 */

/** Las herramientas que la app muestra de verdad en una fila del chat. */
export const HERRAMIENTAS = ["Leyó", "Buscó", "Editó", "Corrió", "Escribió", "Miró"] as const;
export type Herramienta = (typeof HERRAMIENTAS)[number];

/** Las ocho fases del portón, en el orden en que corren: de lo gratis a lo caro. */
export const FASES = [
  "configuración",
  "política",
  "seguridad",
  "memoria",
  "tus scripts",
  "pantalla",
  "visión",
  "revisión",
] as const;
export type Fase = (typeof FASES)[number];

export type Companero = {
  readonly nombre: string;
  readonly modelo: string;
  readonly tarea: string;
};

export type Paso =
  /** Lo que escribiste vos, en su burbuja. */
  | { readonly t: number; readonly tipo: "pide"; readonly texto: string }
  /** El agente pensando, antes de la primera herramienta. */
  | { readonly t: number; readonly tipo: "piensa"; readonly texto: string }
  /** Una fila de herramienta: la marca en círculo y lo que tocó. */
  | { readonly t: number; readonly tipo: "hace"; readonly que: Herramienta; readonly sobre: string }
  /** Lo que el agente dice con palabras. */
  | { readonly t: number; readonly tipo: "dice"; readonly texto: string }
  /** El trabajo repartido: un compañero por parte, cada uno con su modelo. */
  | { readonly t: number; readonly tipo: "orquesta"; readonly companeros: readonly Companero[] }
  /** El portón corriendo: hasta qué fase llegó y si alguna rebotó. */
  | { readonly t: number; readonly tipo: "porton"; readonly hasta: number; readonly reboto?: Fase }
  /** La rama terminada, con su forma. */
  | {
      readonly t: number;
      readonly tipo: "entrega";
      readonly rama: string;
      readonly archivos: number;
      readonly mas: number;
      readonly menos: number;
      readonly segundos: number;
    };

export interface GuionDelChat {
  readonly id: string;
  /** Lo que dice el botón que lo elige. */
  readonly boton: string;
  /** La pestaña y la rama de arriba de la ventana. */
  readonly rama: string;
  /** Lo que dice el encabezado del agente mientras corre. */
  readonly estado: string;
  readonly pasos: readonly Paso[];
}

const ARREGLAR: GuionDelChat = {
  id: "arreglar",
  boton: "Arreglá algo que falla",
  rama: "dolphin/arregla-el-iva",
  estado: "99 % de la semana · 71k de contexto",
  pasos: [
    { t: 200, tipo: "pide", texto: "conIva suma la alícuota en vez de aplicarla. Arreglalo y dejá la prueba." },
    { t: 900, tipo: "piensa", texto: "Buscando dónde se calcula el IVA" },
    { t: 2000, tipo: "hace", que: "Buscó", sobre: "conIva en 412 archivos" },
    { t: 3000, tipo: "hace", que: "Leyó", sobre: "src/facturacion/importes.ts" },
    { t: 3900, tipo: "dice", texto: "Está sumando 21 en vez de multiplicar por 1,21. Lo reproduzco con un test antes de tocarlo." },
    { t: 4900, tipo: "hace", que: "Escribió", sobre: "tests/importes.test.ts · el caso que falla" },
    { t: 5800, tipo: "hace", que: "Corrió", sobre: "vitest · 1 falla, como esperaba" },
    { t: 6700, tipo: "hace", que: "Editó", sobre: "src/facturacion/importes.ts" },
    { t: 7600, tipo: "porton", hasta: 8 },
    { t: 9400, tipo: "entrega", rama: "dolphin/arregla-el-iva", archivos: 2, mas: 14, menos: 3, segundos: 96 },
  ],
};

const REVISAR: GuionDelChat = {
  id: "revisar",
  boton: "Revisá lo que hay",
  rama: "dolphin/revision-cobros",
  estado: "sin tocar tu código",
  pasos: [
    { t: 200, tipo: "pide", texto: "Revisá el módulo de cobros. Qué está mal y qué conviene tocar primero." },
    { t: 900, tipo: "piensa", texto: "Leyendo el módulo entero antes de opinar" },
    { t: 2000, tipo: "hace", que: "Leyó", sobre: "src/cobros/ · 23 archivos" },
    { t: 3100, tipo: "hace", que: "Miró", sobre: "el historial de los últimos 6 meses" },
    { t: 4200, tipo: "hace", que: "Corrió", sobre: "la cobertura · 61 %" },
    {
      t: 5200,
      tipo: "dice",
      texto:
        "Tres cosas, por orden de lo que te va a doler: el webhook no es idempotente, el reintento no tiene tope y hay un precio escrito a mano en dos lugares.",
    },
    { t: 6600, tipo: "hace", que: "Escribió", sobre: "REVISION.md · con el archivo y la línea de cada una" },
    { t: 7700, tipo: "entrega", rama: "dolphin/revision-cobros", archivos: 1, mas: 86, menos: 0, segundos: 74 },
  ],
};

const HACER: GuionDelChat = {
  id: "hacer",
  boton: "Hacelo de punta a punta",
  rama: "dolphin/exportar-a-csv",
  estado: "3 compañeros trabajando",
  pasos: [
    { t: 200, tipo: "pide", texto: "Quiero exportar los pedidos a CSV desde el panel." },
    { t: 900, tipo: "piensa", texto: "Viendo si conviene partirlo" },
    { t: 1900, tipo: "dice", texto: "Son tres partes que no se pisan. Abro una por compañero y las sigo desde acá." },
    {
      t: 2700,
      tipo: "orquesta",
      companeros: [
        { nombre: "el que arma el CSV", modelo: "Opus 5.5", tarea: "src/export/csv.ts + su test" },
        { nombre: "el de la ruta", modelo: "Sonnet 5.5", tarea: "GET /api/pedidos.csv" },
        { nombre: "el del botón", modelo: "Haiku 5.5", tarea: "el botón en el panel" },
      ],
    },
    { t: 4300, tipo: "hace", que: "Escribió", sobre: "src/export/csv.ts · y sus 9 tests" },
    { t: 5200, tipo: "hace", que: "Escribió", sobre: "src/rutas/export.ts" },
    { t: 6100, tipo: "hace", que: "Editó", sobre: "panel/Pedidos.tsx · el botón" },
    { t: 7000, tipo: "dice", texto: "Las tres volvieron. Las junto en una rama y la mando al portón." },
    { t: 8000, tipo: "porton", hasta: 8 },
    { t: 9800, tipo: "entrega", rama: "dolphin/exportar-a-csv", archivos: 5, mas: 212, menos: 4, segundos: 184 },
  ],
};

export const GUIONES: readonly GuionDelChat[] = [ARREGLAR, REVISAR, HACER];

/** Cuánto dura un guion: el último paso manda. */
export function duracionDe(guion: GuionDelChat): number {
  return (guion.pasos.at(-1)?.t ?? 0) + 1400;
}

/** Los pasos que ya pasaron en el instante `t`. */
export function pasosHasta(guion: GuionDelChat, t: number): readonly Paso[] {
  return guion.pasos.filter((paso) => paso.t <= t);
}

/**
 * Si la última fila todavía está corriendo: se dibuja con el círculo vacío hasta que entra la
 * siguiente. Sin esto, cada fila nace con el tilde puesto y nunca se ve a nadie trabajando, que es
 * justamente lo que esta demo tiene que mostrar.
 */
export function corriendoEn(guion: GuionDelChat, t: number): boolean {
  const pasados = pasosHasta(guion, t);
  const ultimo = pasados.at(-1);
  return ultimo !== undefined && pasados.length < guion.pasos.length && ultimo.tipo !== "entrega";
}

/**
 * Cuántas fases del portón mostrar encendidas en el instante `t`.
 *
 * El portón no es instantáneo: la gracia es ver cómo cada escalón corre sólo si pasó el anterior,
 * así que las fases se encienden de a una en el tiempo que el paso declara.
 */
export function fasesEncendidas(paso: Paso, t: number): number {
  if (paso.tipo !== "porton") {
    return 0;
  }
  const porFase = 180;
  return Math.max(0, Math.min(paso.hasta, Math.floor((t - paso.t) / porFase)));
}
