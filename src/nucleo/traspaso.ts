import { limpiarSecretos } from "./secretos.js";
import type { Falla } from "./tipos.js";

/**
 * Pasarle a otro motor lo que el primero ya entendió.
 *
 * Cuando una rama rebota y la retoma otro motor, hoy el segundo empieza de cero: vuelve a leer el
 * repo, vuelve a probar lo que el primero ya probó y vuelve a pagar por entender lo mismo. Esto
 * arma el traspaso —qué se pidió, por qué rebotó, qué ya se intentó, qué tocó— para que arranque
 * donde el otro dejó. La idea es de T3 Code (docs/user/portable-handoffs.md).
 *
 * **No es un resumen escrito por un modelo**, y eso es a propósito por dos razones: resumir cuesta
 * una llamada más justo cuando estamos tratando de gastar menos, y un resumen inventa. Acá se
 * SELECCIONA texto que ya existe, con un presupuesto, y lo que no entra se dice que no entró.
 *
 * **El pedido original nunca se recorta.** Es lo único que no se puede reconstruir leyendo el
 * repo: si llega cortado, el segundo motor trabaja sobre otra tarea.
 *
 * **Todo sale por `limpiarSecretos`** (ver secretos.ts). Esto cruza de una empresa a otra: lleva
 * salidas de comandos y mensajes de error, y una salida de test que imprime un token se lo
 * mandaría al proveedor del motor que entra sin que nadie lo decida.
 *
 * No confundir con `src/traspaso.ts`, que traspasa una SESIÓN interactiva de Claude Code a Codex
 * leyendo su .jsonl. Acá no hay sesión: hay una rama y lo que sabemos de ella.
 */

/** Cuántas letras entran en el traspaso. Un prompt de más de esto ya cuesta como el trabajo. */
export const PRESUPUESTO = 6000;

export interface LoQuePaso {
  /** El pedido, tal cual se lo dieron al primero. Entra entero, siempre. */
  readonly tarea: string;
  readonly rama: string;
  /** Quién venía trabajando: se nombra para que el que entra sepa que hereda, no que empieza. */
  readonly motorAnterior: string;
  /**
   * Por qué se fue el anterior, cuando se fue a mitad de camino y no por un rebote del portón
   * (se quedó sin cupo, se le venció la sesión: ver relevo.ts). Va en el encabezado y fuera del
   * presupuesto porque cambia cómo trabaja el que entra: lo que hay en el worktree está a medio
   * hacer y no es un error suyo.
   */
  readonly seFue?: string;
  /** Lo que lo rebotó. Es lo más valioso del traspaso: dice exactamente qué falta. */
  readonly falla?: Falla;
  /** Las fases que SÍ pasó: lo que el que entra no tiene que volver a tocar. */
  readonly yaPasaron?: readonly string[];
  /** Lo que ya se intentó y no anduvo, del más viejo al más nuevo. */
  readonly intentos?: readonly string[];
  /** Los archivos que la rama tocó. */
  readonly archivos?: readonly string[];
  /** Lo último que dijo el motor anterior. */
  readonly ultimo?: string;
  /** Lo que se corrió de verdad sobre la rama (ver bitacora.ts). */
  readonly corrido?: readonly { readonly comando: string; readonly codigo: number | null; readonly salida?: string }[];
}

export interface PiezaDelTraspaso {
  readonly nombre: string;
  readonly letras: number;
  /** Entró, pero cortada. */
  readonly recortada: boolean;
}

export interface Traspaso {
  /** Lo que se le pega al pedido del motor que entra. */
  readonly texto: string;
  readonly letras: number;
  readonly piezas: readonly PiezaDelTraspaso[];
  /** Lo que no entró en el presupuesto, por nombre. */
  readonly afuera: readonly string[];
}

const limpio = (texto: string) => limpiarSecretos(texto.replace(/\r\n/g, "\n")).trim();

/** Recorta por el final dejando dicho cuánto se perdió: un corte mudo se lee como si eso fuera todo. */
function recortar(texto: string, tope: number): { texto: string; recortada: boolean } {
  const t = limpio(texto);
  if (t.length <= tope) return { texto: t, recortada: false };
  const aviso = (faltan: number) => `\n[…recortado, faltan ${faltan} letras]`;
  const margen = aviso(t.length).length;
  const corte = Math.max(0, tope - margen);
  return { texto: `${t.slice(0, corte).trimEnd()}${aviso(t.length - corte)}`, recortada: true };
}

/** Una línea por comando: el código importa más que la salida, y la salida se corta corta. */
const comoSeCorrio = (c: NonNullable<LoQuePaso["corrido"]>[number]) => {
  const salida = c.salida ? ` · ${limpio(c.salida).split("\n")[0]?.slice(0, 120) ?? ""}` : "";
  return `- ${limpio(c.comando)} → ${c.codigo === null ? "cortado" : `salió ${c.codigo}`}${salida}`;
};

/**
 * Arma el traspaso.
 *
 * El orden de las piezas ES la prioridad: lo que viene primero entra entero y lo último se recorta
 * o se cae. Está ordenado por lo que le ahorra plata al que entra: saber por qué rebotó vale más
 * que leer lo que dijo el que salió.
 */
export function armarTraspaso(lo: LoQuePaso, { presupuesto = PRESUPUESTO }: { presupuesto?: number } = {}): Traspaso {
  const tarea = limpio(lo.tarea);
  const piezas: PiezaDelTraspaso[] = [];
  const afuera: string[] = [];
  const partes: string[] = [];

  // El pedido original va entero y fuera del presupuesto: es lo único que no se puede recuperar
  // leyendo el repo, y un pedido a medias manda al segundo motor a hacer otra cosa.
  const porQueSeFue = lo.seFue
    ? ` Se fue a mitad de camino (${limpio(lo.seFue)}), así que lo que haya en el worktree está a medio hacer: no es un error tuyo.`
    : "";
  partes.push(`Esto es un traspaso: la rama «${lo.rama}» la venía trabajando ${lo.motorAnterior} y ahora seguís vos.${porQueSeFue}`);
  partes.push(`LO QUE SE PIDIÓ (completo, no lo reinterpretes):\n${tarea}`);
  piezas.push({ nombre: "pedido", letras: tarea.length, recortada: false });

  let queda = Math.max(0, presupuesto);
  const sumar = (nombre: string, titulo: string, cuerpo: string, minimo = 80) => {
    const texto = limpio(cuerpo);
    if (!texto) return;
    if (queda < minimo) {
      afuera.push(nombre);
      return;
    }
    const { texto: puesto, recortada } = recortar(texto, queda);
    partes.push(`${titulo}\n${puesto}`);
    piezas.push({ nombre, letras: puesto.length, recortada });
    queda -= puesto.length;
  };

  if (lo.falla) {
    const evidencia = lo.falla.evidencia ? `\n${lo.falla.evidencia}` : "";
    sumar("rebote", `POR QUÉ REBOTÓ (fase «${lo.falla.verificador}»):`, `${lo.falla.detalle}${evidencia}`);
  }
  if (lo.yaPasaron && lo.yaPasaron.length > 0) {
    sumar("ya-pasaron", "LO QUE YA PASA (no lo rompas):", lo.yaPasaron.join(", "));
  }
  if (lo.intentos && lo.intentos.length > 0) {
    // Del más nuevo al más viejo: si hay que recortar, que se pierda lo más lejano.
    sumar("intentos", "LO QUE YA SE PROBÓ Y NO ANDUVO:", [...lo.intentos].reverse().map((i) => `- ${i}`).join("\n"));
  }
  if (lo.archivos && lo.archivos.length > 0) {
    sumar("archivos", "ARCHIVOS QUE TOCÓ LA RAMA:", lo.archivos.join("\n"));
  }
  if (lo.corrido && lo.corrido.length > 0) {
    sumar("corrido", "LO QUE SE CORRIÓ:", lo.corrido.map(comoSeCorrio).join("\n"));
  }
  if (lo.ultimo) {
    sumar("ultimo", `LO ÚLTIMO QUE DIJO ${lo.motorAnterior.toUpperCase()}:`, lo.ultimo);
  }

  partes.push("El worktree está como lo dejó: no empieces de cero, seguí desde ahí.");
  const texto = partes.join("\n\n");
  return { texto, letras: texto.length, piezas, afuera };
}

/** Si el traspaso dejó algo afuera, se dice en una línea para el parte y para la consola. */
export function comoSeCuentaElTraspaso(t: Traspaso): string {
  const recortadas = t.piezas.filter((p) => p.recortada).map((p) => p.nombre);
  const partes = [`${t.letras} letras`];
  if (recortadas.length > 0) partes.push(`recortado: ${recortadas.join(", ")}`);
  if (t.afuera.length > 0) partes.push(`afuera: ${t.afuera.join(", ")}`);
  return partes.join(" · ");
}
