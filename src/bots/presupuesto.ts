import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { enFila, escribirDeUna } from "../nucleo/escritura.js";
import { carpetaDeBots } from "./almacen-rutas.js";
import type { Bot } from "./almacen.js";

export interface GastoMensual {
  readonly mes: string;
  readonly usd: number;
  readonly corridasPorMes: number;
  readonly avisoEnviado?: boolean;
  readonly avisoUmbralEnviado?: boolean;
  readonly avisoAceptado?: boolean;
}
export interface ResultadoDePresupuesto {
  readonly puede: boolean;
  readonly gasto: GastoMensual;
  readonly motivo?: string;
  readonly requiereConfirmacion?: boolean;
}

export function validaPresupuesto(dato: unknown): boolean {
  if (!dato || typeof dato !== "object") return false;
  const d = dato as { usdPorMes?: unknown; corridasPorMes?: unknown; avisoUsd?: unknown; avisoCorridasPorMes?: unknown };
  return (d.usdPorMes === undefined || (typeof d.usdPorMes === "number" && Number.isFinite(d.usdPorMes) && d.usdPorMes > 0)) && (d.corridasPorMes === undefined || (Number.isInteger(d.corridasPorMes) && Number(d.corridasPorMes) > 0)) && (d.avisoUsd === undefined || (typeof d.avisoUsd === "number" && Number.isFinite(d.avisoUsd) && d.avisoUsd > 0)) && (d.avisoCorridasPorMes === undefined || (Number.isInteger(d.avisoCorridasPorMes) && Number(d.avisoCorridasPorMes) > 0));
}

const archivo = (id: string) => join(carpetaDeBots(), id, "gasto.json");

export async function leerGasto(id: string, ahora = new Date()): Promise<GastoMensual> {
  const mes = ahora.toISOString().slice(0, 7);
  try {
    const dato = JSON.parse(await readFile(archivo(id), "utf8")) as Partial<GastoMensual>;
    if (dato.mes !== mes) return { mes, usd: 0, corridasPorMes: 0 };
    return {
      mes,
      usd: typeof dato.usd === "number" && Number.isFinite(dato.usd) ? Math.max(0, dato.usd) : 0,
      corridasPorMes: typeof dato.corridasPorMes === "number" && Number.isFinite(dato.corridasPorMes) ? Math.max(0, dato.corridasPorMes) : 0,
      ...(dato.avisoEnviado === true ? { avisoEnviado: true } : {}),
      ...(dato.avisoUmbralEnviado === true ? { avisoUmbralEnviado: true } : {}),
      ...(dato.avisoAceptado === true ? { avisoAceptado: true } : {}),
    };
  } catch {
    return { mes, usd: 0, corridasPorMes: 0 };
  }
}

export async function puedeCorrer(bot: Bot, ahora = new Date()): Promise<ResultadoDePresupuesto> {
  const gasto = await leerGasto(bot.id, ahora);
  const tope = bot.presupuesto;
  if (!tope) return { puede: true, gasto };
  const porPlata = tope.usdPorMes !== undefined && gasto.usd >= tope.usdPorMes;
  const porCorridas = tope.corridasPorMes !== undefined && gasto.corridasPorMes >= tope.corridasPorMes;
  const avisoPlata = tope.avisoUsd !== undefined && gasto.usd >= tope.avisoUsd && !gasto.avisoAceptado;
  const avisoCorridas = tope.avisoCorridasPorMes !== undefined && gasto.corridasPorMes >= tope.avisoCorridasPorMes && !gasto.avisoAceptado;
  if ((avisoPlata || avisoCorridas) && !porPlata && !porCorridas)
    return { puede: false, gasto, motivo: avisoPlata ? `cruzó el aviso de US$ ${tope.avisoUsd}` : `cruzó el aviso de ${tope.avisoCorridasPorMes} corridas`, requiereConfirmacion: true };
  if (!porPlata && !porCorridas) return { puede: true, gasto };
  return { puede: false, gasto, motivo: porPlata ? `llegó al tope de US$ ${tope.usdPorMes}` : `llegó al tope de ${tope.corridasPorMes} corridas` };
}

export interface PendienteDePresupuesto {
  readonly mensaje: string;
  readonly creado: string;
}
const archivoPendiente = (id: string) => join(carpetaDeBots(), id, "presupuesto-pendiente.json");

export async function guardarPendienteDePresupuesto(bot: Bot, mensaje: string, ahora = new Date()): Promise<void> {
  await escribirDeUna(archivoPendiente(bot.id), `${JSON.stringify({ mensaje, creado: ahora.toISOString() })}\n`);
}
export async function leerPendienteDePresupuesto(bot: Bot, ahora = new Date()): Promise<PendienteDePresupuesto | undefined> {
  try {
    const dato = JSON.parse(await readFile(archivoPendiente(bot.id), "utf8")) as Partial<PendienteDePresupuesto>;
    if (typeof dato.mensaje !== "string" || typeof dato.creado !== "string") return undefined;
    // Uno de otro mes ya no espera nada: el gasto arrancó de cero, y un «seguí» marcaría aceptado el aviso del mes nuevo.
    if (dato.creado.slice(0, 7) !== ahora.toISOString().slice(0, 7)) {
      await rm(archivoPendiente(bot.id), { force: true });
      return undefined;
    }
    return { mensaje: dato.mensaje, creado: dato.creado };
  } catch {
    return undefined;
  }
}
/** Saca el pedido pausado solo si es éste: un disparo pausado vuelve a su cola, no se repite con «seguí». */
export async function descartarPendienteDePresupuesto(bot: Bot, mensaje: string): Promise<void> {
  if ((await leerPendienteDePresupuesto(bot))?.mensaje === mensaje) await rm(archivoPendiente(bot.id), { force: true });
}
export async function confirmarPresupuesto(bot: Bot, ahora = new Date()): Promise<void> {
  const ruta = archivo(bot.id);
  await enFila(ruta, async () => {
    const actual = await leerGasto(bot.id, ahora);
    await escribirDeUna(ruta, `${JSON.stringify({ ...actual, avisoAceptado: true, avisoUmbralEnviado: true }, null, 2)}\n`);
  });
  await rm(archivoPendiente(bot.id), { force: true });
}

export async function marcarAvisoDeUmbral(bot: Bot, ahora = new Date()): Promise<boolean> {
  const ruta = archivo(bot.id);
  return enFila(ruta, async () => {
    const actual = await leerGasto(bot.id, ahora);
    if (actual.avisoUmbralEnviado) return false;
    await escribirDeUna(ruta, `${JSON.stringify({ ...actual, avisoUmbralEnviado: true }, null, 2)}\n`);
    return true;
  });
}

/** Una corrida sin total_cost_usd cuenta como corrida de suscripción. */
export async function registrarCorrida(bot: Bot, costo: number | undefined, ahora = new Date()): Promise<GastoMensual> {
  const ruta = archivo(bot.id);
  return enFila(ruta, async () => {
    const actual = await leerGasto(bot.id, ahora);
    const nuevo: GastoMensual = {
      mes: actual.mes,
      usd: actual.usd + (typeof costo === "number" && Number.isFinite(costo) ? Math.max(0, costo) : 0),
      corridasPorMes: actual.corridasPorMes + 1,
      ...(actual.avisoEnviado ? { avisoEnviado: true } : {}),
      ...(actual.avisoUmbralEnviado ? { avisoUmbralEnviado: true } : {}),
      ...(actual.avisoAceptado ? { avisoAceptado: true } : {}),
    };
    await escribirDeUna(ruta, `${JSON.stringify(nuevo, null, 2)}\n`);
    return nuevo;
  });
}

export async function marcarAvisoDePresupuesto(bot: Bot, ahora = new Date()): Promise<boolean> {
  const ruta = archivo(bot.id);
  return enFila(ruta, async () => {
    const actual = await leerGasto(bot.id, ahora);
    if (actual.avisoEnviado) return false;
    await escribirDeUna(ruta, `${JSON.stringify({ ...actual, avisoEnviado: true }, null, 2)}\n`);
    return true;
  });
}
