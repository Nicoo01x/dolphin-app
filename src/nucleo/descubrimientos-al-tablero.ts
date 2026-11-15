import { cambiarEstado, leerBandeja, type Asunto } from "./bandeja.js";
import { parecidasA, yaEstaAnotada, type Parecida } from "./parecidas.js";
import { crearTarjeta, leerTablero, type Tarjeta } from "./tarjetas.js";

/**
 * Un descubrimiento de la bandeja, anotado en el tablero.
 *
 * Hasta acá un hallazgo tenía dos salidas: tirarlo («rechazar», y no vuelve nunca) o hacerlo YA
 * («implementar», que siembra una rama y gasta). Faltaba la del medio, que es la que uno usa
 * noventa veces de cada cien: «está bueno, pero ahora no». Sin eso, la bandeja se llenaba de cosas
 * que nadie se animaba a rechazar ni quería pagar, y dejaba de mirarse.
 *
 * Anotar no gasta un token: copia lo que el explorador o el scout ya averiguaron a una tarjeta en
 * Ideas, y saca el asunto de la bandeja. La decisión de hacerlo sigue siendo de una persona, pero
 * ahora se toma donde se toman las demás.
 */

/** Hasta dónde se copia el detalle del asunto: una tarjeta es para decidir, no para leer un informe. */
const DETALLE = 1200;
const PASOS = 6;

export interface Anotado {
  readonly tarjeta: Tarjeta;
  readonly asunto: Asunto;
  /** Tarjetas que se le parecen, por si es lo mismo dicho de otra manera. */
  readonly parecidas: readonly { readonly id: string; readonly titulo: string }[];
}

export type PorQueNo = "no-esta" | "no-esta-abierto" | "ya-estaba";

export interface NoAnotado {
  readonly porQue: PorQueNo;
  /** Con «ya-estaba», cuál es la tarjeta que ya dice lo mismo. */
  readonly tarjeta?: Tarjeta;
}

const recortar = (texto: string, tope: number) => (texto.length <= tope ? texto : `${texto.slice(0, tope).trimEnd()}…`);

/**
 * El cuerpo de la tarjeta: lo que ya averiguó quien lo encontró, en el orden en que sirve para
 * decidir. Lo que no se copia (la captura, el video) sigue en la bandeja, y por eso se deja dicho
 * de dónde salió.
 */
export function detalleDeLaTarjeta(asunto: Asunto): string {
  const partes: string[] = [asunto.detalle.trim()];
  if (asunto.propuesta?.trim()) {
    partes.push(`Cómo se haría acá: ${asunto.propuesta.trim()}`);
  }
  if (asunto.donde?.trim()) {
    partes.push(`Dónde: ${asunto.donde.trim()}`);
  }
  if (asunto.pasos && asunto.pasos.length > 0) {
    partes.push(["Pasos:", ...asunto.pasos.slice(0, PASOS).map((p, i) => `${i + 1}. ${p}`)].join("\n"));
  }
  if (asunto.evidencia?.trim()) {
    partes.push(`Lo que dijo la máquina: ${asunto.evidencia.trim()}`);
  }
  if (asunto.fuentes && asunto.fuentes.length > 0) {
    partes.push(`Visto en: ${asunto.fuentes.map((f) => `${f.titulo} (${f.url})`).join(" · ")}`);
  }
  // La captura y el video no se copian: viven en .dolphin/bandeja y se ven desde el asunto.
  partes.push(`De la bandeja (${asunto.origen}), asunto ${asunto.id}.`);
  return recortar(partes.filter((p) => p !== "").join("\n\n"), DETALLE);
}

/** Cómo se sabría que está resuelta: en un error, que deje de pasar lo que pasaba. */
function terminadoDe(asunto: Asunto): string | undefined {
  if (asunto.tipo !== "error") return undefined;
  return asunto.donde?.trim() ? `${asunto.donde.trim()}: deja de pasar lo que dice el detalle` : "deja de pasar lo que dice el detalle";
}

const comoSeLlama = (p: Parecida) => ({ id: p.tarjeta.id, titulo: p.tarjeta.titulo });

/**
 * Pasa un asunto abierto de la bandeja al tablero, como idea.
 *
 * Solo uno **abierto**: uno que ya se está implementando tiene una rama en camino, y anotarlo
 * duplicaría el trabajo en dos lugares.
 */
export async function anotarDescubrimiento(repo: string, id: string): Promise<Anotado | NoAnotado> {
  const asunto = (await leerBandeja(repo)).asuntos.find((a) => a.id === id);
  if (!asunto) return { porQue: "no-esta" };
  if (asunto.estado !== "abierto") return { porQue: "no-esta-abierto" };

  const tablero = await leerTablero(repo);
  const misma = yaEstaAnotada(tablero, asunto.titulo);
  if (misma) {
    // Ya está en el tablero: igual se saca de la bandeja, porque la decisión ya se mudó de lugar.
    const quedo = await cambiarEstado(repo, id, "anotado");
    return { porQue: "ya-estaba", tarjeta: misma, ...(quedo ? {} : {}) };
  }

  const terminado = terminadoDe(asunto);
  const tarjeta = await crearTarjeta(repo, {
    titulo: asunto.titulo,
    detalle: detalleDeLaTarjeta(asunto),
    ...(terminado ? { terminado } : {}),
    tipo: asunto.tipo === "error" ? "bug" : "idea",
    // En Ideas aunque sea un bug: lo encontró un robot, lo aprueba una persona.
    columna: "ideas",
    origen: `bandeja/${asunto.origen}`,
  });
  const quedo = await cambiarEstado(repo, id, "anotado");
  return { tarjeta, asunto: quedo ?? asunto, parecidas: parecidasA(tablero, asunto.titulo).map(comoSeLlama) };
}

export const seAnoto = (resultado: Anotado | NoAnotado): resultado is Anotado => "tarjeta" in resultado && "asunto" in resultado;
