import { RespuestaMala } from "./api";

/**
 * Dolphin bots, del lado de la consola: el espejo de src/bots/. Los bots no son de un proyecto
 * (viven en ~/.dolphin/bots), así que estas rutas no llevan el `?p=`.
 */

export type Permiso = "preguntar" | "leer" | "carpeta" | "libre";
export type Motor = "claude" | "codex" | "mentira";
export type Plantilla = "vigia" | "parte" | "investigador" | "escritor";

export interface Rutina {
  readonly id: string;
  readonly cuando: { readonly tipo: "diario"; readonly hora: string; readonly tz?: string } | { readonly tipo: "cada"; readonly minutos: number } | { readonly tipo: "evento" };
  readonly tarea: string;
  readonly latido?: boolean;
  readonly ultima?: string;
  readonly proxima: string;
  readonly modelo?: string;
  readonly vueltas?: number;
  readonly habilidades?: readonly string[];
  readonly chequeo?: string;
  readonly confiar?: boolean;
}

export interface BotListado {
  readonly id: string;
  readonly nombre: string;
  readonly motor: Motor;
  readonly permiso: Permiso;
  readonly respaldo?: Exclude<Motor, "mentira">;
  readonly herramientas?: readonly string[];
  readonly carpeta: string;
  readonly rutinas: readonly Rutina[];
  readonly telegram?: { readonly chat: string } | boolean;
  readonly pendiente?: { readonly id: string; readonly quiere: string };
  readonly presupuesto?: { readonly usdPorMes?: number; readonly corridasPorMes?: number };
  readonly gasto?: { readonly mes: string; readonly usd: number; readonly corridasPorMes: number };
  readonly error?: string;
}

export interface Habilidad {
  readonly nombre: string;
  readonly descripcion: string;
  readonly cuerpo?: string;
}

export interface LineaDeHistorial {
  readonly cuando: string;
  readonly quien: "vos" | "bot" | "rutina" | "sistema";
  readonly texto: string;
}

export interface BotEntero {
  readonly bot: BotListado;
  readonly alma: string;
  readonly memoria: readonly string[];
  readonly habilidades: readonly Habilidad[];
  readonly historial: readonly LineaDeHistorial[];
}
export interface EstadoServicio {
  readonly vivo: boolean;
  readonly desde?: string;
}

export interface Respuesta {
  readonly texto: string;
  readonly pidePermiso?: string;
  readonly recordo?: readonly string[];
  readonly habilidades?: readonly string[];
  readonly nada?: boolean;
}

async function pedir<T>(metodo: "GET" | "POST" | "PUT" | "DELETE", ruta: string, cuerpo?: unknown): Promise<T> {
  const token = document.querySelector<HTMLMetaElement>('meta[name="dolphin-token"]')?.content ?? "";
  const respuesta = await fetch(ruta, {
    method: metodo,
    headers: metodo === "GET" ? {} : { "content-type": "application/json", "x-dolphin-token": token },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const texto = await respuesta.text().catch(() => "");
  let datos: unknown;
  try {
    datos = texto ? JSON.parse(texto) : undefined;
  } catch {
    datos = undefined;
  }
  if (!respuesta.ok) {
    const porQue = (datos as { porQue?: unknown; error?: unknown } | undefined)?.porQue ?? (datos as { error?: unknown } | undefined)?.error;
    throw new RespuestaMala(respuesta.status, typeof porQue === "string" && porQue ? porQue : `el servidor contestó ${respuesta.status}`);
  }
  return datos as T;
}

const de = (id: string) => `/api/bots/${encodeURIComponent(id)}`;

export const listarBots = () => pedir<{ bots: BotListado[]; servicio: EstadoServicio }>("GET", "/api/bots");
export const traerBot = (id: string) => pedir<BotEntero>("GET", de(id));
export const crearBot = (datos: { nombre: string; plantilla?: Plantilla; motor?: Motor; carpeta?: string; permiso?: Permiso; respaldo?: Exclude<Motor, "mentira"> }) =>
  pedir<{ bot: BotListado }>("POST", "/api/bots", datos);
export const cambiarBot = (id: string, cambios: { alma?: string; permiso?: Permiso; motor?: Motor; carpeta?: string; respaldo?: Exclude<Motor, "mentira"> | null }) => pedir<unknown>("PUT", de(id), cambios);
export const borrarBot = (id: string) => pedir<unknown>("DELETE", de(id));
export const hablarConBot = (id: string, texto: string) => pedir<Respuesta>("POST", `${de(id)}/hablar`, { texto });
export const darPermiso = (id: string, pendiente?: string) => pedir<Respuesta>("POST", `${de(id)}/dale`, pendiente ? { id: pendiente } : {});
export const agregarRutina = (id: string, rutina: { cuando: Rutina["cuando"]; tarea: string; latido?: boolean; modelo?: string; vueltas?: number; habilidades?: string[]; chequeo?: string; confiar?: boolean }) =>
  pedir<{ ok: true; rutina: Rutina & { secreto?: string } }>("POST", `${de(id)}/rutinas`, rutina);
export const sacarRutina = (id: string, rutina: string) => pedir<unknown>("DELETE", `${de(id)}/rutinas/${encodeURIComponent(rutina)}`);
export const guardarHabilidad = (id: string, h: Habilidad) =>
  pedir<unknown>("PUT", `${de(id)}/habilidades/${encodeURIComponent(h.nombre)}`, { descripcion: h.descripcion, cuerpo: h.cuerpo ?? "" });
export const borrarHabilidad = (id: string, nombre: string) => pedir<unknown>("DELETE", `${de(id)}/habilidades/${encodeURIComponent(nombre)}`);
export const olvidar = (id: string, linea: string) => pedir<unknown>("DELETE", `${de(id)}/memoria`, { linea });
export const deshacerBot = (id: string) => pedir<unknown>("POST", `${de(id)}/deshacer`, { confirmar: true });

export const PLANTILLAS: readonly { readonly id: Plantilla; readonly nombre: string; readonly hace: string }[] = [
  { id: "vigia", nombre: "Vigía", hace: "Mira tus repos cada 30 minutos y solo avisa si algo se rompió." },
  { id: "parte", nombre: "Parte", hace: "Todos los días a las 8 te resume lo que pasó ayer." },
  { id: "investigador", nombre: "Investigador", hace: "Averigua lo que le pidas y te devuelve un informe con fuentes." },
  { id: "escritor", nombre: "Escritor", hace: "Todos los días a las 6 escribe la pieza del día con tu voz." },
];

export const PERMISOS: Readonly<Record<Permiso, string>> = {
  preguntar: "pregunta antes de tocar",
  leer: "solo mira",
  carpeta: "edita solo su carpeta",
  libre: "hace sin preguntar",
};

export function cuandoDice(r: Rutina): string {
  if (r.cuando.tipo === "evento") return "cuando llega un evento";
  if (r.cuando.tipo === "diario") return `todos los días, ${r.cuando.hora}`;
  const m = r.cuando.minutos;
  return m % 60 === 0 ? `cada ${m / 60 === 1 ? "hora" : `${m / 60} horas`}` : `cada ${m} minutos`;
}
