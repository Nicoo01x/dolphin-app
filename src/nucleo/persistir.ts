/**
 * Perseguir un objetivo hasta lograrlo, sin repetir lo que ya falló. Cada intento que no sale deja su
 * porqué; de ahí sale una FIRMA (el error sin números, rutas ni hashes) y la escalera decide:
 *
 *   un fallo nuevo          → reintentar, con lo que falló como pista (hubo progreso: el error cambió)
 *   el mismo fallo otra vez → escalar al modelo siguiente (más capaz), solo para destrabar
 *   el mismo fallo arriba   → pedir ayuda a una persona, con la evidencia y qué haría por defecto
 *
 * Y antes que nada: si lo que falta es una herramienta (un comando, un módulo), no se reintenta a
 * ciegas; si el presupuesto llegó a su reserva o se agotaron los intentos, se para y se pide ayuda.
 * Es una función pura: quien persigue (la sesión) hace lo que dice.
 */

export interface Intento {
  readonly ok: boolean;
  readonly porQue: string;
  readonly modelo: string;
  /** Lo que costó este intento, en dólares. */
  readonly gastado: number;
}

export type Paso =
  | { readonly accion: "listo" }
  | { readonly accion: "reintentar"; readonly pista: string }
  | { readonly accion: "escalar"; readonly modelo: string; readonly pista: string }
  | { readonly accion: "herramienta"; readonly falta: string; readonly instalar?: { readonly cmd: string; readonly args: readonly string[] } }
  | { readonly accion: "ayuda"; readonly porQue: string };

export interface OpcionesDePersistir {
  /** Los modelos de menos a más capaz; el primero es con el que se arranca. */
  readonly escalera: readonly string[];
  /** Tope de plata de todo el objetivo, en dólares. Se deja el 15 % de reserva para verificar. */
  readonly presupuesto?: number;
  /** Cuántos intentos como mucho. */
  readonly maxIntentos?: number;
  /** Con qué se instalan las dependencias del repo (npm, pnpm…): lo único que se instala solo. */
  readonly gestor?: string;
}

/** El error sin lo que cambia de corrida en corrida: números, rutas, hashes, lo que va entre comillas. */
export function firmaDeFallo(porQue: string): string {
  return porQue
    .toLowerCase()
    .split("\n")[0]!
    .replace(/[a-z]:\\[^\s:]+|\/[^\s:]+\/[^\s:]*/gi, "<ruta>")
    .replace(/\b[0-9a-f]{7,40}\b/g, "<hash>")
    .replace(/«[^»]*»|"[^"]*"|'[^']*'/g, "<x>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Si el fallo es porque falta algo en la máquina: qué falta (un comando o un módulo). */
export function herramientaQueFalta(porQue: string): { falta: string; modulo: boolean } | undefined {
  const modulo = /cannot find (?:module|package) ['"]([^'"]+)['"]|err_module_not_found[^'"]*['"]([^'"]+)['"]/i.exec(porQue);
  // «./x» o «/x» es un archivo del repo que no está, no un paquete que falte: eso lo arregla el agente.
  if (modulo && !/^[./]/.test((modulo[1] ?? modulo[2])!)) return { falta: (modulo[1] ?? modulo[2])!, modulo: true };
  const comando =
    /(?:^|\s|')([\w.-]+)'? (?:is not recognized as an internal or external command|no se reconoce como un comando)/i.exec(porQue) ??
    /(?:command not found:\s*|sh: \d*:?\s*)([\w.-]+)|([\w.-]+): (?:command )?not found/i.exec(porQue) ??
    /no encontré «([^»]+)»/i.exec(porQue);
  if (comando) return { falta: (comando[1] ?? comando[2])!, modulo: false };
  return undefined;
}

export function siguientePaso(intentos: readonly Intento[], opciones: OpcionesDePersistir): Paso {
  const ultimo = intentos.at(-1);
  if (!ultimo) return { accion: "reintentar", pista: "" };
  if (ultimo.ok) return { accion: "listo" };

  const gastado = intentos.reduce((s, i) => s + i.gastado, 0);
  if (opciones.presupuesto !== undefined && gastado >= opciones.presupuesto * 0.85)
    return { accion: "ayuda", porQue: `se gastaron US$ ${gastado.toFixed(2)} de US$ ${opciones.presupuesto.toFixed(2)}: lo que queda es la reserva para verificar` };
  if (intentos.length >= (opciones.maxIntentos ?? 6)) return { accion: "ayuda", porQue: `${intentos.length} intentos y todavía no sale: el último falló por ${ultimo.porQue}` };

  // Lo que falta en la máquina no se arregla reintentando.
  const falta = herramientaQueFalta(ultimo.porQue);
  if (falta) {
    // Ya se instaló y sigue faltando: no es eso, que lo vea una persona.
    const yaLoIntento = intentos.slice(0, -1).some((i) => herramientaQueFalta(i.porQue)?.falta === falta.falta);
    if (yaLoIntento) return { accion: "ayuda", porQue: `sigue faltando «${falta.falta}» después de instalar las dependencias` };
    // Solo se instala solo lo del propio repo (su lockfile), nunca un paquete nuevo ni algo global.
    const instalar = falta.modulo && opciones.gestor ? argsDeInstalar(opciones.gestor) : undefined;
    if (instalar) return { accion: "herramienta", falta: falta.falta, instalar: { cmd: opciones.gestor!, args: instalar } };
    return { accion: "herramienta", falta: falta.falta };
  }

  const firma = firmaDeFallo(ultimo.porQue);
  const anterior = intentos.at(-2);
  const atascado = anterior !== undefined && !anterior.ok && firmaDeFallo(anterior.porQue) === firma;
  if (!atascado) return { accion: "reintentar", pista: ultimo.porQue };

  // El mismo fallo dos veces: un modelo más capaz, si hay; si ya está arriba de todo, una persona.
  const donde = opciones.escalera.indexOf(ultimo.modelo);
  const siguiente = opciones.escalera[donde + 1];
  if (siguiente) return { accion: "escalar", modelo: siguiente, pista: ultimo.porQue };
  return { accion: "ayuda", porQue: `falla siempre igual (${ultimo.porQue}) y ${ultimo.modelo} es el modelo más capaz de la escalera` };
}

/**
 * Cómo se instala lo del repo SIN tocar nada: con el lockfile congelado (no se reescribe, el árbol no
 * queda sucio) y sin scripts de instalación (ni los del repo ni los de sus dependencias corren).
 */
export function argsDeInstalar(gestor: string): string[] | undefined {
  if (gestor === "npm") return ["ci", "--ignore-scripts"];
  if (gestor === "pnpm" || gestor === "yarn" || gestor === "bun") return ["install", "--frozen-lockfile", "--ignore-scripts"];
  return undefined;
}

/** El pedido del intento siguiente: el objetivo y lo que ya falló, para que no se repita. */
export function pedidoConPistas(objetivo: string, intentos: readonly Intento[]): string {
  const fallos = intentos.filter((i) => !i.ok).slice(-3);
  if (fallos.length === 0) return objetivo;
  return `${objetivo}\n\nLos intentos anteriores no salieron:\n${fallos.map((i, n) => `${n + 1}. (${i.modelo}) ${i.porQue}`).join("\n")}\nNo repitas ese camino: pensá por qué falló y probá otro.`;
}
