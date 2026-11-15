import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, enFila, escribirDeUna } from "./escritura.js";
import { nuevoId } from "./ids.js";

/**
 * El tablero: lo que hay que hacer en el proyecto, en cinco columnas fijas. Es el centro de Dolphin
 * (ver docs/idea.md): el equipo, el portón, la revisión y la noche son cosas que le pasan a una
 * tarjeta, no secciones aparte.
 *
 * Un archivo por tarjeta en `.dolphin/tablero/`: dos cambios a tarjetas distintas nunca se pisan, y
 * es lo que después se sincroniza a la rama `dolphin/tablero` para compartirlo con un equipo.
 */

export const COLUMNAS = ["ideas", "para-hacer", "haciendo", "para-revisar", "hecho"] as const;
export type Columna = (typeof COLUMNAS)[number];

export const NOMBRE_DE_COLUMNA: Record<Columna, string> = {
  ideas: "Ideas",
  "para-hacer": "Para hacer",
  haciendo: "Haciendo",
  "para-revisar": "Para revisar",
  hecho: "Hecho",
};

/** Una tarea a secas; un bug arranca por la prueba que falla; una idea espera que alguien la apruebe. */
export type TipoDeTarjeta = "tarea" | "bug" | "idea";

export interface Comentario {
  readonly quien: string;
  readonly texto: string;
  readonly cuando: string;
  /**
   * Si el comentario apunta a una línea del diff, cuál. Es la diferencia entre
   * «le falta el encabezado» y «falta el encabezado en exportar.ts:42»: lo
   * segundo el agente lo puede ir a arreglar sin adivinar dónde.
   */
  readonly donde?: { readonly archivo: string; readonly linea: number };
}

export interface Tarjeta {
  readonly id: string;
  readonly titulo: string;
  /** Qué hay que hacer, con las palabras de quien la anotó. */
  readonly detalle?: string;
  /** Cómo se sabe que está terminada: es lo que el portón tiene que probar. */
  readonly terminado?: string;
  readonly tipo: TipoDeTarjeta;
  readonly columna: Columna;
  /** Quién la toma: una persona, o «agentes». Sin nadie, está libre. */
  readonly quien?: string;
  /** De dónde vino: una persona, la bandeja, un issue, Telegram. */
  readonly origen: string;
  readonly creada: string;
  /** La última vez que cambió de columna: ordena cada columna, lo más nuevo arriba. */
  readonly movida: string;
  /** Cuando un equipo la trabaja: la rama que entrega. */
  readonly rama?: string;
  /**
   * Cómo cruzó esa rama el portón la última vez, fase por fase y en orden. El escritorio lo dibuja
   * como una tira en la tarjeta: qué pasó y dónde rebotó, sin abrir nada.
   */
  readonly porton?: readonly FaseDeLaTarjeta[];
  /** Las tarjetas que tienen que estar en Hecho antes de que esta arranque (ver tarjetas-espera.ts). */
  readonly esperaA?: readonly string[];
  readonly comentarios: readonly Comentario[];
  /** Por qué columnas pasó, y cuándo. */
  readonly historial: readonly { readonly columna: Columna; readonly cuando: string }[];
}

export interface FaseDeLaTarjeta {
  readonly fase: string;
  readonly estado: "paso" | "fallo" | "salteada" | "sin-correr";
}

const ESTADOS_DE_FASE: readonly FaseDeLaTarjeta["estado"][] = ["paso", "fallo", "salteada", "sin-correr"];

/** Las fases que se entienden; una rota se descarta y no se lleva puesta a la tarjeta. */
function portonDe(dato: unknown): readonly FaseDeLaTarjeta[] | undefined {
  if (!Array.isArray(dato)) return undefined;
  const fases = dato.filter(
    (f): f is FaseDeLaTarjeta => !!f && typeof f.fase === "string" && f.fase.trim() !== "" && ESTADOS_DE_FASE.includes(f.estado),
  );
  return fases.length > 0 ? fases.map((f) => ({ fase: f.fase, estado: f.estado })) : undefined;
}

export interface TarjetaNueva {
  readonly titulo: string;
  readonly detalle?: string;
  readonly terminado?: string;
  readonly tipo?: TipoDeTarjeta;
  /** Sin columna: una idea va a Ideas y lo demás a Para hacer. */
  readonly columna?: Columna;
  readonly quien?: string;
  readonly origen?: string;
}

export const carpetaDelTablero = (repo: string) => join(repo, ".dolphin", "tablero");
const rutaDe = (repo: string, id: string) => join(carpetaDelTablero(repo), `${id}.json`);

const esColumna = (x: unknown): x is Columna => typeof x === "string" && (COLUMNAS as readonly string[]).includes(x);

/** Lo que se lee de disco se valida: una tarjeta rota no tumba el tablero entero. */
function comoTarjeta(dato: unknown): Tarjeta | undefined {
  const d = dato as Partial<Tarjeta> | null;
  if (!d || typeof d.id !== "string" || typeof d.titulo !== "string" || !esColumna(d.columna)) return undefined;
  const texto = (x: unknown) => (typeof x === "string" && x.trim() ? x : undefined);
  const creada = texto(d.creada) ?? new Date(0).toISOString();
  return {
    id: d.id,
    titulo: d.titulo,
    ...(texto(d.detalle) ? { detalle: d.detalle! } : {}),
    ...(texto(d.terminado) ? { terminado: d.terminado! } : {}),
    tipo: d.tipo === "bug" || d.tipo === "idea" ? d.tipo : "tarea",
    columna: d.columna,
    ...(texto(d.quien) ? { quien: d.quien! } : {}),
    origen: texto(d.origen) ?? "?",
    creada,
    movida: texto(d.movida) ?? creada,
    ...(texto(d.rama) ? { rama: d.rama! } : {}),
    ...(portonDe(d.porton) ? { porton: portonDe(d.porton)! } : {}),
    ...(Array.isArray(d.esperaA) && d.esperaA.some((x) => typeof x === "string") ? { esperaA: d.esperaA.filter((x): x is string => typeof x === "string") } : {}),
    comentarios: Array.isArray(d.comentarios)
      ? d.comentarios.filter((c) => c && typeof c.texto === "string").map(sanearComentario)
      : [],
    historial: Array.isArray(d.historial) ? d.historial.filter((h) => h && esColumna(h.columna)) : [],
  };
}

async function leerUna(repo: string, id: string): Promise<Tarjeta | undefined> {
  try {
    return comoTarjeta(JSON.parse(await readFile(rutaDe(repo, id), "utf8")));
  } catch {
    return undefined;
  }
}

async function guardar(repo: string, t: Tarjeta): Promise<void> {
  await carpetaDeDolphin(repo, "tablero");
  await escribirDeUna(rutaDe(repo, t.id), `${JSON.stringify(t, null, 2)}\n`);
}

/** Todas las tarjetas: por columna en su orden, y adentro de cada una lo que se movió último arriba. */
export async function leerTablero(repo: string): Promise<Tarjeta[]> {
  const nombres = (await readdir(carpetaDelTablero(repo)).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
  const tarjetas = (await Promise.all(nombres.map((n) => leerUna(repo, n.slice(0, -5))))).filter((t): t is Tarjeta => t !== undefined);
  return tarjetas.sort((a, b) => COLUMNAS.indexOf(a.columna) - COLUMNAS.indexOf(b.columna) || b.movida.localeCompare(a.movida));
}

export async function crearTarjeta(repo: string, nueva: TarjetaNueva, ahora = new Date()): Promise<Tarjeta> {
  const titulo = nueva.titulo.trim();
  if (!titulo) throw new Error("una tarjeta necesita un título");
  const tipo = nueva.tipo ?? "tarea";
  const columna = nueva.columna ?? (tipo === "idea" ? "ideas" : "para-hacer");
  const cuando = ahora.toISOString();
  const tarjeta: Tarjeta = {
    id: nuevoId("t", ahora.getTime()),
    titulo,
    ...(nueva.detalle?.trim() ? { detalle: nueva.detalle.trim() } : {}),
    ...(nueva.terminado?.trim() ? { terminado: nueva.terminado.trim() } : {}),
    tipo,
    columna,
    ...(nueva.quien?.trim() ? { quien: nueva.quien.trim() } : {}),
    origen: nueva.origen?.trim() || "vos",
    creada: cuando,
    movida: cuando,
    comentarios: [],
    historial: [{ columna, cuando }],
  };
  await guardar(repo, tarjeta);
  return tarjeta;
}

/**
 * Una tarjeta por su id, o por el principio del id si no hay otra que empiece igual (como un hash de
 * git). Sin ninguna, o con varias, se dice cuál es el problema.
 */
export async function buscarTarjeta(repo: string, id: string): Promise<Tarjeta> {
  const buscado = id.trim();
  const todas = await leerTablero(repo);
  const exacta = todas.find((t) => t.id === buscado);
  if (exacta) return exacta;
  const candidatas = buscado ? todas.filter((t) => t.id.startsWith(buscado)) : [];
  if (candidatas.length === 1) return candidatas[0]!;
  throw new Error(candidatas.length === 0 ? `no hay una tarjeta «${buscado}»` : `«${buscado}» es el principio de ${candidatas.length} tarjetas: escribí más del id`);
}

/** Cambiar una tarjeta: se relee, se cambia y se guarda en fila, así dos cambios seguidos no se pisan. */
export function cambiarTarjeta(repo: string, id: string, cambio: (t: Tarjeta) => Tarjeta): Promise<Tarjeta> {
  return enFila(rutaDe(repo, id), async () => {
    const actual = await leerUna(repo, id);
    if (!actual) throw new Error(`no hay una tarjeta «${id}»`);
    const nueva = cambio(actual);
    await guardar(repo, nueva);
    return nueva;
  });
}

export function moverTarjeta(repo: string, id: string, columna: Columna, ahora = new Date()): Promise<Tarjeta> {
  return cambiarTarjeta(repo, id, (t) =>
    t.columna === columna ? t : { ...t, columna, movida: ahora.toISOString(), historial: [...t.historial, { columna, cuando: ahora.toISOString() }] },
  );
}

/** Lo que se escribe de una tarjeta: un campo vacío se borra (menos el título, que no puede faltar). */
export type EdicionDeTarjeta = Partial<Pick<Tarjeta, "titulo" | "detalle" | "terminado" | "quien" | "tipo">>;

export function editarTarjeta(repo: string, id: string, edicion: EdicionDeTarjeta): Promise<Tarjeta> {
  return cambiarTarjeta(repo, id, (t) => {
    const titulo = edicion.titulo === undefined ? t.titulo : edicion.titulo.trim();
    if (!titulo) throw new Error("una tarjeta necesita un título");
    const { detalle: _d, terminado: _t, quien: _q, ...base } = t;
    const campo = (nuevo: string | undefined, viejo: string | undefined) => (nuevo === undefined ? viejo : nuevo.trim() || undefined);
    const detalle = campo(edicion.detalle, t.detalle);
    const terminado = campo(edicion.terminado, t.terminado);
    const quien = campo(edicion.quien, t.quien);
    return {
      ...base,
      titulo,
      ...(edicion.tipo ? { tipo: edicion.tipo } : {}),
      ...(detalle ? { detalle } : {}),
      ...(terminado ? { terminado } : {}),
      ...(quien ? { quien } : {}),
    };
  });
}

/** El ancla de un comentario leído del disco, solo si viene completa. */
function sanearComentario(c: Comentario): Comentario {
  const donde = c.donde;
  const sirve = donde && typeof donde.archivo === "string" && donde.archivo !== "" && Number.isInteger(donde.linea) && donde.linea > 0;
  return sirve ? c : ({ quien: c.quien, texto: c.texto, cuando: c.cuando } as Comentario);
}

export interface ComentarioDeLinea {
  readonly archivo: string;
  readonly linea: number;
  readonly texto: string;
  readonly quien?: string;
  readonly ahora?: Date;
}

/**
 * Un comentario sobre una línea del diff. Se dejan varios y después se
 * devuelve la tarjeta una sola vez: así se revisa de corrido, como se revisa
 * un PR, en vez de rebotar la rama en el primer renglón que no gustó.
 */
export function comentarLineaDeTarjeta(repo: string, id: string, c: ComentarioDeLinea): Promise<Tarjeta> {
  const texto = c.texto.trim();
  if (!texto) return Promise.reject(new Error("el comentario está vacío"));
  const archivo = c.archivo.trim();
  if (!archivo) return Promise.reject(new Error("el comentario de una línea necesita el archivo"));
  if (!Number.isInteger(c.linea) || c.linea <= 0) return Promise.reject(new Error("el comentario de una línea necesita la línea"));
  const comentario: Comentario = {
    quien: c.quien ?? "vos",
    texto,
    cuando: (c.ahora ?? new Date()).toISOString(),
    donde: { archivo, linea: c.linea },
  };
  return cambiarTarjeta(repo, id, (t) => ({ ...t, comentarios: [...t.comentarios, comentario] }));
}

export function comentarTarjeta(repo: string, id: string, texto: string, quien = "vos", ahora = new Date()): Promise<Tarjeta> {
  const limpio = texto.trim();
  if (!limpio) return Promise.reject(new Error("el comentario está vacío"));
  return cambiarTarjeta(repo, id, (t) => ({ ...t, comentarios: [...t.comentarios, { quien, texto: limpio, cuando: ahora.toISOString() }] }));
}

/** Lo que se escribe a mano («hacer», «revisar», «Para revisar»): la columna que quiso decir. */
export function columnaDe(texto: string): Columna | undefined {
  const t = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s_]+/g, "-")
    .trim();
  if (esColumna(t)) return t;
  const atajos: Record<string, Columna> = { idea: "ideas", hacer: "para-hacer", pendiente: "para-hacer", revisar: "para-revisar", revision: "para-revisar", listo: "hecho", hecha: "hecho" };
  return atajos[t];
}
