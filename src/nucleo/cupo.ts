import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { prepararComando } from "../agentes/ejecutar.js";
import { cuentaAgotada, cuentasDeClaude, cuentaEnUso } from "./cuentas.js";

export type Ventana = "5h" | "semana";
export type AgenteConCupo = "claude" | "codex" | "gemini";

export interface VentanaDeCupo {
  readonly nombre: Ventana;
  readonly usadoPct: number;
  readonly reiniciaEn: string | null;
}
export interface PlanDeUso {
  readonly escritoEn: string;
  readonly agentes: readonly { readonly agente: AgenteConCupo; readonly ventanas: readonly VentanaDeCupo[] }[];
}
export interface BloqueoDeCupo {
  readonly ventana: VentanaDeCupo;
  readonly hasta: Date;
}
export interface ResultadoDeCupo {
  readonly sigue: true;
}
export interface ResultadoSinCupo {
  readonly sigue: false;
  readonly motivo: string;
  readonly hasta: Date;
  readonly alternativa?: "otra-cuenta" | "codex";
}

const QUINCE_MINUTOS = 15 * 60_000;
const DOS_MINUTOS = 2 * 60_000;
const HORA = 60 * 60_000;

/** La casa es inyectable para que los tests nunca miren la cuenta real de la persona. */
export function casaDeCupo(casa?: string): string {
  return casa ?? process.env.DOLPHIN_HOME_DIR ?? process.env.DOLPHIN_CASA_DIR ?? process.env.DOLPHIN_CUPO_DIR ?? homedir();
}

export async function leerPlanDeUso(casa = casaDeCupo(), ahora = new Date()): Promise<PlanDeUso | undefined> {
  try {
    const datos = JSON.parse(await readFile(join(casa, ".dolphin", "plan-uso.json"), "utf8")) as unknown;
    if (!esPlanDeUso(datos)) return undefined;
    const escrito = new Date(datos.escritoEn).getTime();
    const antiguedad = ahora.getTime() - escrito;
    return antiguedad >= 0 && antiguedad < QUINCE_MINUTOS ? datos : undefined;
  } catch {
    return undefined;
  }
}

/** Busca el bloqueo más largo, igual que hacía autopiloto antes de extraer esta lógica. */
export function bloqueoDe(plan: PlanDeUso | undefined, agente: string, tope: number, ahora: Date): BloqueoDeCupo | undefined {
  const datos = plan?.agentes.find((x) => x.agente === agente);
  const bloqueos = datos?.ventanas
    .filter((x) => x.usadoPct >= tope && (x.reiniciaEn === null || new Date(x.reiniciaEn).getTime() + DOS_MINUTOS > ahora.getTime()))
    .map((ventana) => ({ ventana, hasta: ventana.reiniciaEn ? new Date(new Date(ventana.reiniciaEn).getTime() + DOS_MINUTOS) : new Date(ahora.getTime() + HORA) }))
    .filter((x) => !Number.isNaN(x.hasta.getTime()));
  return bloqueos?.sort((a, b) => b.hasta.getTime() - a.hasta.getTime() || b.ventana.usadoPct - a.ventana.usadoPct)[0];
}

export async function antesDeArrancar(opciones: {
  readonly agente: AgenteConCupo | string;
  readonly largo: "corto" | "largo";
  readonly ahora: Date;
  readonly casa?: string;
  readonly codexDisponible?: () => boolean;
}): Promise<ResultadoDeCupo | ResultadoSinCupo> {
  const plan = await leerPlanDeUso(casaDeCupo(opciones.casa), opciones.ahora);
  const tope = opciones.largo === "largo" ? 85 : 95;
  const bloqueo = bloqueoDe(plan, opciones.agente, tope, opciones.ahora);
  if (!bloqueo || bloqueo.ventana.nombre !== "5h") return { sigue: true };
  const alternativa = await alternativaDe(opciones.agente, opciones);
  const porcentaje = bloqueo.ventana.usadoPct;
  const hasta = bloqueo.hasta;
  return {
    sigue: false,
    motivo: `el cupo de ${opciones.agente} está en ${porcentaje} % de las 5 h`,
    hasta,
    ...(alternativa ? { alternativa } : {}),
  };
}

async function alternativaDe(
  agente: string,
  opciones: { readonly casa?: string; readonly codexDisponible?: () => boolean },
): Promise<"otra-cuenta" | "codex" | undefined> {
  if (agente === "claude") {
    const casa = casaDeCupo(opciones.casa);
    const cuentas = await cuentasDeClaude(true, process.env, casa);
    const otra = cuentas.some((cuenta) => cuenta.id !== (cuentaEnUso()?.id ?? "normal") && !cuentaAgotada(cuenta.id));
    if (otra) return "otra-cuenta";
  }
  const disponible = opciones.codexDisponible?.() ?? prepararComando("codex", []) !== undefined;
  return disponible ? "codex" : undefined;
}

function esPlanDeUso(datos: unknown): datos is PlanDeUso {
  if (!datos || typeof datos !== "object") return false;
  const plan = datos as { escritoEn?: unknown; agentes?: unknown };
  if (typeof plan.escritoEn !== "string" || Number.isNaN(new Date(plan.escritoEn).getTime()) || !Array.isArray(plan.agentes)) return false;
  return plan.agentes.every((agente) => {
    if (!agente || typeof agente !== "object") return false;
    const dato = agente as { agente?: unknown; ventanas?: unknown };
    if (!(dato.agente === "claude" || dato.agente === "codex" || dato.agente === "gemini") || !Array.isArray(dato.ventanas)) return false;
    return dato.ventanas.every((ventana) => {
      if (!ventana || typeof ventana !== "object") return false;
      const datoVentana = ventana as { nombre?: unknown; usadoPct?: unknown; reiniciaEn?: unknown };
      return (datoVentana.nombre === "5h" || datoVentana.nombre === "semana") && typeof datoVentana.usadoPct === "number" && Number.isFinite(datoVentana.usadoPct) && datoVentana.usadoPct >= 0 && (datoVentana.reiniciaEn === null || (typeof datoVentana.reiniciaEn === "string" && !Number.isNaN(new Date(datoVentana.reiniciaEn).getTime())));
    });
  });
}

export function textoVentana(ventana: Ventana): string {
  return ventana === "5h" ? "5 h" : "la semana";
}
