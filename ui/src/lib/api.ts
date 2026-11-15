import type { RespuestaCosecha, RespuestaDiff, Turno } from "./tipos";

/** El proyecto que se está mirando: el `?p=` de la página. Sin él, el del arranque del servidor. */
export const proyectoActivo = (): string | null => new URLSearchParams(window.location.search).get("p");

/**
 * Una ruta del servidor con el proyecto de la página: todo lo que lee o
 * escribe datos lo lleva, o se mezclarían las cosechas de dos repos.
 */
export function conProyecto(ruta: string): string {
  const p = proyectoActivo();
  if (!p) return ruta;
  const corte = ruta.indexOf("#");
  const base = corte >= 0 ? ruta.slice(0, corte) : ruta;
  const hash = corte >= 0 ? ruta.slice(corte) : "";
  return `${base}${base.includes("?") ? "&" : "?"}p=${encodeURIComponent(p)}${hash}`;
}

/**
 * El servidor contestó, y contestó que no: el porqué en sus palabras y el
 * código. Es lo que separa «no contesta» (un error de red, que es otra
 * clase) de «contestó que eso no está»: antes los dos decían que se cayó.
 */
export class RespuestaMala extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** El cuerpo, leído una sola vez: el JSON si lo es, y el texto para el porqué si no. */
async function cuerpoDe(respuesta: Response): Promise<{ datos: unknown; texto: string }> {
  const texto = await respuesta.text().catch(() => "");
  try {
    return { datos: JSON.parse(texto) as unknown, texto };
  } catch {
    return { datos: undefined, texto };
  }
}

function porQueDe({ datos, texto }: { datos: unknown; texto: string }, sino: string): string {
  const porQue = (datos as { porQue?: unknown } | null | undefined)?.porQue;
  if (typeof porQue === "string" && porQue.trim() !== "") return porQue;
  // Un texto corto (el 403 de un origen ajeno, un 503) dice más que el código; una página HTML, no.
  const limpio = texto.trim();
  return datos === undefined && limpio !== "" && limpio.length <= 300 && !limpio.startsWith("<") ? limpio : sino;
}

/** Un pedido al servidor de dolphin. Si contesta mal, el error trae su porqué. */
async function traer<T>(ruta: string): Promise<T> {
  const respuesta = await fetch(conProyecto(ruta));
  if (!respuesta.ok) {
    throw new RespuestaMala(respuesta.status, porQueDe(await cuerpoDe(respuesta), `${ruta} contestó ${respuesta.status}`));
  }
  return (await respuesta.json()) as T;
}

/**
 * Un POST con el pase que el servidor metió en la página. Todo lo que
 * escribe pasa por acá: si dice que no, el error trae su porqué.
 */
async function postConsola<T = unknown>(ruta: string, cuerpo: unknown, delProyecto = true, senal?: AbortSignal): Promise<T> {
  const token = document.querySelector<HTMLMetaElement>('meta[name="dolphin-token"]')?.content ?? "";
  const respuesta = await fetch(delProyecto ? conProyecto(ruta) : ruta, {
    method: "POST",
    headers: { "content-type": "application/json", "x-dolphin-token": token },
    body: JSON.stringify(cuerpo),
    ...(senal ? { signal: senal } : {}),
  });
  const leido = await cuerpoDe(respuesta);
  if (!respuesta.ok) throw new RespuestaMala(respuesta.status, porQueDe(leido, `el servidor contestó ${respuesta.status}`));
  return leido.datos as T;
}

export const traerHistorial = () => traer<{ cosechas: Turno[] }>("/api/historial");

export interface Asunto {
  readonly id: string;
  readonly tipo: "idea" | "error";
  readonly titulo: string;
  readonly detalle: string;
  readonly propuesta?: string;
  readonly fuentes?: readonly { readonly titulo: string; readonly url: string }[];
  readonly pasos?: readonly string[];
  readonly donde?: string;
  readonly evidencia?: string;
  readonly captura?: string;
  readonly video?: string;
  readonly momento?: number;
  readonly origen: string;
  /** «anotado» es el que se mandó al tablero: la decisión se mudó de lugar (ver descubrimientos-al-tablero.ts). */
  readonly estado: "abierto" | "rechazado" | "implementando" | "hecho" | "anotado";
  readonly creado: string;
  readonly vecesVisto?: number;
  readonly resuelto?: string;
  readonly resueltoEn?: string;
  /** Ideas: cuánto vale comparada con las otras (ver src/nucleo/valorar.ts). */
  readonly valoracion?: { readonly valor: number; readonly esfuerzo: number; readonly porQue: string; readonly cuando: string };
  readonly paraLaNoche?: string;
  /** La última vez que se implementó, la siembra se cortó antes de terminar. */
  readonly cortado?: { readonly en: string; readonly porQue: string };
}

export const traerBandeja = () => traer<{ asuntos: Asunto[] }>("/api/bandeja");

/** Una línea de la actividad: el espejo de src/nucleo/actividad.ts. */
export interface Actividad {
  readonly id: string;
  readonly tipo: "siembra" | "pr" | "merge" | "descarte" | "idea" | "error" | "arreglo" | "turno" | "memoria";
  readonly en: string;
  readonly titulo: string;
  readonly sobre?: string;
  readonly nota?: string;
  readonly tono: "neutro" | "bien" | "mal";
  readonly modelo?: string;
  readonly cosecha?: string;
}

export const traerActividad = () => traer<{ actividad: Actividad[]; recortada?: boolean }>("/api/actividad");

/** Lo que dejó Guardian en .dolphin/guardian.json: el espejo de src/nucleo/guardian.ts. */
export interface FaseDeGuardian {
  readonly nombre: string;
  readonly paso: boolean;
  readonly detalle: string;
  readonly ms: number;
  readonly inestable?: boolean;
}

export interface EstadoDeGuardian {
  readonly base?: { readonly sha: string; readonly cuando: string };
  readonly ultima?: { readonly sha: string; readonly cuando: string; readonly fases: readonly FaseDeGuardian[] };
  readonly regresiones: readonly {
    readonly fase: string;
    readonly desde: string;
    readonly vista: string;
    readonly detalle: string;
    readonly culpable?: { readonly sha: string; readonly mensaje: string; readonly autor: string };
  }[];
  readonly inestables: readonly { readonly fase: string; readonly sha: string; readonly cuando: string }[];
}

export const traerGuardian = () => traer<EstadoDeGuardian>("/api/guardian");

/** El informe de rendimiento: el espejo de src/nucleo/rendimiento.ts. */
export interface RendimientoDeModelo {
  readonly modelo: string;
  readonly intentos: number;
  readonly pasaron: number;
  readonly aLaPrimera: number;
  readonly tasa: number;
  /** null: ninguna rama de este modelo informó su costo. */
  readonly costoMedio: number | null;
  /** null: ninguna pasó todavía, o el motor no informa su costo. */
  readonly costoPorAcierto: number | null;
  /** Las ramas que no informaron su costo. */
  readonly sinCosto?: number;
  readonly msMedio: number;
}

export interface FaseDelPorton {
  readonly fase: string;
  readonly costo: "gratis" | "barato" | "caro";
  readonly corridas: number;
  readonly pasaron: number;
  readonly gastado: number;
  readonly msMedio: number;
}

export interface InformeDeRendimiento {
  readonly tipos: readonly { readonly tipo: string; readonly nombre: string; readonly ramas: number }[];
  readonly tipo: string | null;
  readonly modelos: readonly RendimientoDeModelo[];
  readonly fases: readonly FaseDelPorton[];
  readonly minimo: number;
  readonly router?: {
    readonly estrategia: string;
    readonly escribe?: string;
    readonly porDatos?: string;
    readonly explorar?: string;
    readonly fijado: boolean;
    readonly faltan: readonly { readonly modelo: string; readonly tiene: number }[];
  };
}

/** Un proyecto de la lista de la persona (ver src/nucleo/proyectos.ts). */
export interface ProyectoListado {
  readonly id: string;
  readonly nombre: string;
  readonly ruta: string;
  /** La URL del logo del repo, si tiene uno. */
  readonly logo?: string;
  readonly origen?: string;
  readonly ultima?: { readonly cuando: string; readonly tarea: string };
}

/** La lista de proyectos; `solo` si el servidor trabaja con un solo repo (sin 404: ensucia la consola del navegador). */
export const traerProyectos = () =>
  traer<{ delArranque: string | null; proyectos: ProyectoListado[]; solo?: boolean }>("/api/proyectos");

export type AccionDeProyecto =
  | { accion: "sumar"; ruta: string }
  | { accion: "clonar"; url: string; donde?: string }
  | { accion: "quitar"; id: string };

/** Suma, clona o saca un proyecto con el pase de la consola. Devuelve el proyecto, si hay uno nuevo. */
export async function mandarProyecto(accion: AccionDeProyecto): Promise<ProyectoListado | undefined> {
  // La lista es de la persona, no de un repo: va sin el `?p=`.
  const cuerpo = await postConsola<{ proyecto?: ProyectoListado } | undefined>("/api/proyectos", accion, false);
  return cuerpo?.proyecto;
}

/** Abre otro proyecto en la misma vista: la consola entera se recarga con su `?p=`. */
export function irAlProyecto(id: string, delArranque: string): void {
  const url = new URL(window.location.href);
  if (id === delArranque) url.searchParams.delete("p");
  else url.searchParams.set("p", id);
  window.location.assign(url.toString());
}

/** Vuelve al proyecto con el que arrancó el servidor: la misma vista, sin el `?p=`. */
export function volverAlDelArranque(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("p");
  window.location.assign(url.toString());
}

/** Sin tipo, el servidor abre en el más medido; «todos» es todos. */
export const traerRendimiento = (tipo?: string) =>
  traer<InformeDeRendimiento>(`/api/rendimiento${tipo ? `?tipo=${encodeURIComponent(tipo)}` : ""}`);

export interface TurnoAgendado {
  readonly id: string;
  readonly tareas: readonly string[];
  readonly deLaBandeja?: { readonly tope: number };
  readonly hora?: string;
  readonly cuando: string;
  readonly repetir?: "diario";
  readonly agente: PedidoDeSiembra["agente"];
  readonly modelo?: string;
  readonly estado: "agendado" | "corriendo" | "hecho" | "fallo" | "cancelado";
  readonly corrio?: string;
  readonly porQue?: string;
  /** El parte de la última corrida, para abrir en `/partes/`. */
  readonly parte?: string;
  readonly corridas?: readonly { readonly cuando: string; readonly salio: boolean; readonly porQue?: string; readonly parte?: string }[];
  readonly pausaCupo?: { readonly hasta: string; readonly ventana: "5h" | "semana"; readonly usadoPct: number };
}

export const traerCalendario = () => traer<{ turnos: TurnoAgendado[]; hosts?: string[]; destinos?: Record<string, string> }>("/api/calendario");

/** Agendar o cancelar un turno, con el pase de la consola. */
export async function mandarCalendario(
  cuerpo:
    | { accion: "agendar"; tareas?: string[]; cuando?: string; hora?: string; repetir?: "diario"; agente: PedidoDeSiembra["agente"]; modelo?: string; host?: string; deLaBandeja?: { tope: number } }
    | { accion: "cancelar"; id: string },
): Promise<void> {
  await postConsola("/api/calendario", cuerpo);
}

/**
 * Mergear o descartar la rama elegida de una cosecha, con el pase de la
 * consola. `aprobado` es el sí explícito que pide la política «aprobar».
 */
export async function mandarRama(accion: "mergear" | "descartar" | "pr", id: string | null, aprobado = false): Promise<void> {
  await postConsola("/api/rama", { accion, id, ...(aprobado ? { aprobado: true } : {}) });
}

export interface TareaDeCola {
  readonly id: string;
  readonly tarea: string;
  readonly estado: "esperando" | "trabajando" | "lista" | "no-salio" | "en-conflicto";
  readonly creada: string;
  readonly rama?: string;
  readonly porQue?: string;
  readonly sobre?: string;
  /** Si sale de un plan de Thinking: su título corto y la tarea de la que depende. */
  readonly titulo?: string;
  readonly plan?: string;
  readonly dependeDe?: string;
}

export const traerCola = () => traer<{ tareas: TareaDeCola[] }>("/api/cola");

/** Varias tareas a la vez, cada una en su rama, con el pase de la consola. */
export async function pedirCola(pedido: { tareas: string[]; agente: PedidoDeSiembra["agente"]; modelo?: string }): Promise<void> {
  await postConsola("/api/cola", pedido);
}

/** Una tarea del plan de Thinking, como la muestra (y deja editar) la consola. */
export interface TareaDelPlan {
  readonly id: string;
  readonly titulo: string;
  readonly tarea: string;
  readonly tipo: string;
  readonly escalon: "barato" | "medio" | "caro";
  /** Tope de gasto, en dólares. */
  readonly presupuesto: number;
  readonly dependeDe?: string;
  readonly porQue: string;
}

export interface Plan {
  readonly id: string;
  readonly objetivo: string;
  readonly creado: string;
  readonly resumen: string;
  readonly tareas: readonly TareaDelPlan[];
  readonly costoDelPlan: number;
  readonly aprobado?: string;
}

/** Que Dolphin piense un objetivo: lee el repo y lo parte en tareas. No escribe nada. */
export function pedirPlan(objetivo: string): Promise<{ plan: Plan; costoMaximo: number; suscripcion?: boolean }> {
  return postConsola("/api/plan", { objetivo });
}

/** Aprobar el plan tal como quedó en la consola: se encola y la cola arranca. */
export function aprobarPlan(plan: Plan, agente: PedidoDeSiembra["agente"]): Promise<{ tareas: string[]; costoMaximo: number }> {
  return postConsola("/api/plan/aprobar", { plan, agente });
}

/** Qué se puede decidir sobre un asunto de la bandeja. «anotar» lo manda al tablero como idea. */
export type AccionDeAsunto = "rechazar" | "reabrir" | "implementar" | "anotar" | "noche" | "sacar-de-la-noche";

/** Decidir sobre un asunto de la bandeja, con el pase de la consola. */
export async function mandarBandeja(accion: AccionDeAsunto, id: string): Promise<void> {
  await postConsola("/api/bandeja", { accion, id });
}

/** Que un juez compare las ideas abiertas entre sí: cuánto vale cada una (tarda y gasta). */
export const valorarIdeas = () => postConsola<{ ok: boolean; valoradas: number; gastado: number }>("/api/bandeja", { accion: "valorar" });

export const traerCosecha = (id: string | null) =>
  traer<RespuestaCosecha>(id ? `/api/cosecha?id=${encodeURIComponent(id)}` : "/api/cosecha");

export const traerDiff = (universo: string, turnoId: string | null) =>
  traer<RespuestaDiff>(
    `/api/diff?u=${encodeURIComponent(universo)}${turnoId ? `&id=${encodeURIComponent(turnoId)}` : ""}`,
  );

export interface PedidoDeSiembra {
  readonly tarea: string;
  readonly n: number;
  readonly agente: "claude" | "antigravity" | "codex" | "mentira";
  readonly modelo?: string;
  /** Que no se borre el código de las ramas que no se eligen. */
  readonly guardarTodas?: boolean;
}

/** Pide una siembra con el pase que el servidor metió en esta página. */
export async function pedirSiembra(pedido: PedidoDeSiembra): Promise<void> {
  await postConsola("/api/sembrar", pedido);
}

/** De dónde salió algo de la memoria (ver src/nucleo/notas.ts). */
export type Origen = "owner" | "agente" | "sistema" | "sesion" | "untrusted";

export interface Recuerdo {
  readonly id: string;
  readonly dicho: string;
  readonly patron?: string;
  readonly tipo?: "regla" | "error" | "decision" | "nota";
  readonly creado: string;
  readonly activo: boolean;
  readonly origen?: Origen;
  /** Por qué entró, si no lo dijo una persona: lo que cuenta DREAMS.md. */
  readonly porQue?: string;
  readonly candidato?: boolean;
  readonly conflictoCon?: string;
  readonly usos?: number;
  readonly ultimoUso?: string;
  readonly sinUso?: boolean;
}

/** Una nota del corto plazo, como la muestra la consola. */
export interface NotaEnObservacion {
  readonly id: string;
  readonly texto: string;
  readonly origen: Origen;
  readonly puntaje: number;
  readonly vistas: number;
  readonly tareas: number;
  /** Cuántas tareas distintas le faltan para que el sueño la considere. */
  readonly faltan: number;
  readonly alcanza: boolean;
  readonly ultima?: string;
}

export const traerMemoria = () =>
  traer<{
    recuerdos: Recuerdo[];
    perfil: string;
    enObservacion?: NotaEnObservacion[];
    esperando?: NotaEnObservacion[];
    umbrales?: { minTareas: number; minPuntaje: number };
    /** Las últimas entradas de DREAMS.md, de la más nueva a la más vieja. */
    suenos?: string[];
  }>("/api/memoria");

export type AccionDeMemoria =
  | { accion: "crear"; dicho: string; patron?: string }
  | { accion: "candidato" | "crear-candidata"; dicho: string; porQue: string; patron?: string }
  | { accion: "editar"; id: string; dicho: string }
  | { accion: "aprobar-candidato" | "aprobar-candidata"; id: string; dicho?: string }
  | { accion: "editar-dicho"; id: string; dicho: string }
  | { accion: "prender" | "apagar" | "olvidar" | "descartar-candidato" | "descartar-candidata" | "aprobar-nota" | "descartar-nota"; id: string }
  | { accion: "sonar" }
  | { accion: "perfil"; perfil: string };

/** Escribe en la memoria con el pase de la consola. */
/** Lo que contesta la revisión de la memoria (acción `sonar`). */
export interface ResultadoDeRevisar {
  readonly promovidas: number;
  readonly esperando: number;
  readonly olvidadas: number;
}

export async function mandarMemoria(accion: AccionDeMemoria): Promise<Partial<ResultadoDeRevisar>> {
  return (await postConsola<Partial<ResultadoDeRevisar> | null>("/api/memoria", accion)) ?? {};
}

/** De qué herramienta es una memoria que trajo el entrenamiento: el espejo de src/nucleo/buscar-memorias.ts. */
export type HerramientaDeMemoria =
  | "claude" | "agents" | "gemini" | "codex" | "cursor" | "copilot" | "windsurf" | "aider"
  | "cline" | "roo" | "kiro" | "continue" | "junie" | "trae" | "zed" | "augment";

export interface FuenteDeMemoria {
  readonly herramienta: HerramientaDeMemoria;
  readonly tipo: "instrucciones" | "memoria" | "conversaciones";
  readonly alcance: "proyecto" | "global" | "otro-proyecto";
  readonly nombre: string;
  readonly ruta: string;
  readonly archivos: number;
  /** Líneas con algo; en las conversaciones, los mensajes de la persona. */
  readonly lineas: number;
  /** En la memoria de otro proyecto: cuál. */
  readonly proyecto?: string;
}

export interface Aprendido {
  readonly texto: string;
  readonly fuente: string;
}

export interface Entrenamiento {
  readonly cuando: string;
  readonly fuentes: readonly FuenteDeMemoria[];
  readonly aprendido?: readonly Aprendido[];
  readonly destilado?: { readonly cuando: string; readonly gastado: number };
}

/** Lo que trajo el último entrenamiento; null si este proyecto nunca se entrenó. */
export const traerEntrenamiento = () => traer<{ entrenamiento: Entrenamiento | null }>("/api/entrenamiento");

/** Buscar: encuentra las memorias de otros modelos (rápido, no gasta). */
export const buscarMemorias = () => postConsola<{ entrenamiento: Entrenamiento }>("/api/entrenamiento", { accion: "buscar" });

/** Destilar: un modelo lee lo encontrado y saca las verdades del proyecto (tarda y gasta). */
/** Con `senal`: cortar el pedido hace que el servidor mate el proceso del modelo (deja de gastar cupo). */
export const destilarMemorias = (senal?: AbortSignal) =>
  postConsola<{ entrenamiento: Entrenamiento }>("/api/entrenamiento", { accion: "destilar" }, true, senal);

/** Tachar una verdad aprendida que no va. */
export const olvidarAprendido = (texto: string) =>
  postConsola<{ entrenamiento: Entrenamiento | null }>("/api/entrenamiento", { accion: "olvidar", texto });

/** Las dos cosas juntas, para entrenar en silencio a un proyecto con historia. */
export const entrenarAlDelfin = async () => {
  await buscarMemorias();
  return destilarMemorias();
};

// --- El tablero: el espejo de src/nucleo/tarjetas.ts ---

export const COLUMNAS = ["ideas", "para-hacer", "haciendo", "para-revisar", "hecho"] as const;
export type Columna = (typeof COLUMNAS)[number];
export const NOMBRE_DE_COLUMNA: Record<Columna, string> = {
  ideas: "Ideas",
  "para-hacer": "Para hacer",
  haciendo: "Haciendo",
  "para-revisar": "Para revisar",
  hecho: "Hecho",
};
/** El color de cada columna (ver app.css, «color con significado»): siempre el mismo en todas las vistas. */
export const TONO_DE_COLUMNA: Record<Columna, string> = {
  ideas: "var(--idea)",
  "para-hacer": "var(--hacer)",
  haciendo: "var(--corriendo)",
  "para-revisar": "var(--revisar)",
  hecho: "var(--paso)",
};
export type TipoDeTarjeta = "tarea" | "bug" | "idea";

export interface Tarjeta {
  readonly id: string;
  readonly titulo: string;
  readonly detalle?: string;
  readonly terminado?: string;
  readonly tipo: TipoDeTarjeta;
  readonly columna: Columna;
  readonly quien?: string;
  readonly origen: string;
  readonly creada: string;
  readonly movida: string;
  readonly rama?: string;
  /** Las que tienen que estar en Hecho antes de que esta arranque. */
  readonly esperaA?: readonly string[];
  readonly comentarios: readonly {
    readonly quien: string;
    readonly texto: string;
    readonly cuando: string;
    /** Si el comentario apunta a una línea del diff, cuál. */
    readonly donde?: { readonly archivo: string; readonly linea: number };
  }[];
  readonly historial: readonly { readonly columna: Columna; readonly cuando: string }[];
}

/** Las que todavía la frenan: las que espera y no están en Hecho. Una que ya no está no frena (como en el núcleo). */
export function laFrenan(t: Tarjeta, tablero: readonly Tarjeta[]): Tarjeta[] {
  return (t.esperaA ?? []).map((id) => tablero.find((x) => x.id === id)).filter((x): x is Tarjeta => x !== undefined && x.columna !== "hecho");
}

export const traerTablero = () => traer<{ tarjetas: Tarjeta[] }>("/api/tablero");
const deTarjeta = async (pedido: Promise<{ tarjeta: Tarjeta }>) => (await pedido).tarjeta;
export const anotarTarjeta = (nueva: { titulo: string; columna?: Columna; tipo?: TipoDeTarjeta; detalle?: string; terminado?: string }) =>
  deTarjeta(postConsola("/api/tablero", nueva));
export const moverTarjeta = (id: string, columna: Columna) => deTarjeta(postConsola(`/api/tablero/${encodeURIComponent(id)}/mover`, { columna }));
export const editarTarjeta = (id: string, edicion: Partial<Pick<Tarjeta, "titulo" | "detalle" | "terminado" | "quien" | "tipo">>) =>
  deTarjeta(postConsola(`/api/tablero/${encodeURIComponent(id)}/editar`, edicion));
export const comentarTarjeta = (id: string, texto: string) => deTarjeta(postConsola(`/api/tablero/${encodeURIComponent(id)}/comentar`, { texto }));
export const esperarTarjeta = (id: string, otra: string) => deTarjeta(postConsola(`/api/tablero/${encodeURIComponent(id)}/esperar`, { otra }));
export const soltarTarjeta = (id: string, otra: string) => deTarjeta(postConsola(`/api/tablero/${encodeURIComponent(id)}/soltar`, { otra }));

/** Lo que va a costar cada tarea, con lo que costó de verdad en este repo (ver nucleo/estimar.ts). */
export interface EstimacionDelPlan {
  readonly tareas: readonly { readonly id: string; readonly estimado: number; readonly maximo: number; readonly fuente: string }[];
  /** Lo esperable de todo el equipo, con lo que ya costó pensar el plan. */
  readonly estimado: number;
  readonly maximo: number;
  /** Cuántas tareas se estimaron con historial de verdad. */
  readonly conHistorial: number;
}

/** El líder parte la tarjeta y dice cuánto cuesta. No escribe código. */
export const pensarTarjeta = (id: string, agente: PedidoDeSiembra["agente"]) =>
  postConsola<{ plan: Plan; costoMaximo: number; estimacion: EstimacionDelPlan; suscripcion?: boolean }>(`/api/tablero/${encodeURIComponent(id)}/plan`, { agente });
/** El «dale»: el plan como quedó; la tarjeta pasa a Haciendo y el equipo arranca. */
export const darDale = (id: string, plan: Plan, agente: PedidoDeSiembra["agente"]) => deTarjeta(postConsola(`/api/tablero/${encodeURIComponent(id)}/dale`, { plan, agente }));

// ── Master Prompt ────────────────────────────────────────────────────────────

/**
 * Sube una captura (PNG en base64) y devuelve dónde quedó guardada: el prompt la nombra por esa ruta.
 * Con `marcaDe` (la ruta de una captura de este prompt) sube la versión con los puntos dibujados encima.
 */
export async function subirCaptura(id: string, png: string, marcaDe?: string): Promise<string> {
  const r = await postConsola<{ ruta: string }>("/api/prompt/captura", { id, png, ...(marcaDe ? { marcaDe } : {}) });
  return r.ruta;
}

/** Para mostrar una captura ya guardada. */
export const urlDeCaptura = (ruta: string): string => conProyecto(`/api/prompt/captura?ruta=${encodeURIComponent(ruta)}`);

/** Un punto marcado sobre una captura: dónde (en % del ancho y del alto) y qué pasa ahí. */
export interface PinDelPrompt {
  readonly x: number;
  readonly y: number;
  readonly nota: string;
}

export interface BorradorDePrompt {
  readonly pedido: string;
  readonly capturas: readonly { readonly ruta: string; readonly nota: string; readonly pines?: readonly PinDelPrompt[]; readonly marcada?: string }[];
}

/** El prompt para mandarle a Claude: mejorado por un modelo, o armado tal cual (no gasta). */
export function prepararPrompt(borrador: BorradorDePrompt, mejorar: boolean, senal?: AbortSignal): Promise<{ texto: string; gastado: number }> {
  return postConsola(mejorar ? "/api/prompt/mejorar" : "/api/prompt/armar", borrador, true, senal);
}

// ── La rama de una tarjeta, adentro de la tarjeta ────────────────────────────

/** Un comando que se corrió sobre la rama, como lo anotó quien lo ejecutó (ver nucleo/bitacora.ts). */
export interface ComandoCorrido {
  readonly cuando: string;
  /** La fase del portón que lo pidió, cuando viene de una. */
  readonly fase?: string;
  readonly cmd: string;
  readonly args: readonly string[];
  /** Cómo se corrió de verdad, cuando no es lo mismo: envuelto en cmd.exe, o adentro de la caja. */
  readonly corrioComo?: string;
  /** Dónde corrió, relativo al repo. */
  readonly donde?: string;
  /** `null`: no terminó solo, lo cortó el tope. */
  readonly codigo: number | null;
  readonly ms: number;
  readonly salida: string;
  /** Si se le cortó la salida, cuántos caracteres tenía. */
  readonly salidaEntera?: number;
}

export interface CambiosDeLaRama {
  readonly rama: string;
  readonly estado: "probada" | "mergeada" | "descartada";
  readonly commits: number;
  readonly archivos: readonly { readonly archivo: string; readonly agregadas: number; readonly quitadas: number }[];
  readonly diff: string;
  readonly recortado: boolean;
  /** Lo que se corrió de verdad sobre la rama: el diff dice qué quedó escrito, esto qué se ejecutó. */
  readonly corrido: readonly ComandoCorrido[];
}

/** Qué cambió la rama de una tarjeta. `null` si la rama ya no está en el repo. */
export async function traerCambiosDeTarjeta(id: string): Promise<{ cambios: CambiosDeLaRama | null; porQue?: string }> {
  return traer(`/api/tablero/${encodeURIComponent(id)}/rama`);
}

/** Una fase del portón, como la cuenta la prueba de una rama. */
export interface FaseProbada {
  readonly nombre: string;
  readonly paso: boolean;
  readonly detalle: string;
  readonly ms: number;
  readonly salteada?: boolean;
}

export interface RamaProbada {
  readonly rama: string;
  readonly paso: boolean;
  readonly fases: readonly FaseProbada[];
  readonly rebote?: { readonly fase: string; readonly porQue: string };
  readonly sinCorrer: readonly string[];
  /** Las que existen pero piden plata, y por eso no corrieron. */
  readonly sinCorrerPorqueCuestan?: readonly string[];
}

/**
 * Cruza la rama de la tarjeta por el portón, antes de integrarla. Corre en un worktree aparte y
 * solo las fases gratis: no toca tu árbol de trabajo y no gasta.
 */
export async function probarRamaDeTarjeta(id: string): Promise<RamaProbada> {
  return await postConsola<RamaProbada>(`/api/tablero/${encodeURIComponent(id)}/probar`, {});
}

/** Un preview abierto: la app de una rama servida por el origen de la consola. */
export interface PreviewAbierto {
  readonly id: string;
  readonly rama: string;
  /** Lo que va en el `src` del iframe. */
  readonly enLaConsola: string;
  readonly desde: number;
}

/** Lo que el inspector vio del elemento que tocaste adentro del preview. */
export interface ElementoTocado {
  readonly url?: string;
  readonly selector?: string;
  readonly texto?: string;
  readonly html?: string;
  readonly estilos?: Readonly<Record<string, string>>;
}

/**
 * Levanta la app de una rama para verla adentro de la consola. Uno por rama: pedirlo dos veces
 * devuelve el mismo, así que recargar la consola no deja dos dev servers prendidos.
 */
export async function abrirPreview(rama: string): Promise<PreviewAbierto> {
  const r = await postConsola<{ preview: PreviewAbierto }>("/api/preview", { rama });
  return r.preview;
}

/** Apaga la app y devuelve su worktree. */
export async function cerrarPreview(id: string): Promise<void> {
  await postConsola("/api/preview/cerrar", { id });
}

export const traerPreviews = () => traer<{ previews: PreviewAbierto[] }>("/api/previews");

/**
 * Pide un cambio sobre el elemento que tocaste: siembra una rama con ese pedido y el elemento tal
 * como estaba. Es el mismo camino del modo en vivo del escritorio, no un segundo.
 */
export async function pedirSobreElElemento(pedido: string, elemento: ElementoTocado): Promise<{ tarea: string }> {
  return await postConsola<{ tarea: string }>("/api/live", { pedido, elemento });
}

/** La mergea en la rama base y la tarjeta pasa a Hecho. Toca el repo de verdad. */
export async function integrarTarjeta(id: string): Promise<Tarjeta> {
  const r = await postConsola<{ tarjeta: Tarjeta }>(`/api/tablero/${encodeURIComponent(id)}/integrar`, {});
  return r.tarjeta;
}

/** Tira la rama y la tarjeta vuelve a Para hacer con el porqué, que es lo que va a leer quien la retome. */
/** Una marca sobre una línea del diff de la rama de una tarjeta. Con patrón, queda propuesta a la memoria. */
export async function marcarLineaDeTarjeta(
  id: string,
  marca: { archivo: string; linea: number; texto: string; patron?: string },
): Promise<{ tarjeta: Tarjeta; candidata?: { dicho: string }; porQueNoLaRegla?: string }> {
  return await postConsola<{ tarjeta: Tarjeta; candidata?: { dicho: string }; porQueNoLaRegla?: string }>(
    `/api/tablero/${encodeURIComponent(id)}/comentario`,
    marca,
  );
}

export async function devolverTarjeta(id: string, porQue: string): Promise<Tarjeta> {
  const r = await postConsola<{ tarjeta: Tarjeta }>(`/api/tablero/${encodeURIComponent(id)}/devolver`, { porQue });
  return r.tarjeta;
}
