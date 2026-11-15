import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Evento } from "./sembrar.js";
import { carpetaDeDolphin } from "./escritura.js";

/**
 * El canal en vivo: la siembra deja caer cada evento como una línea JSON
 * en `.dolphin/en-vivo.jsonl` y el servidor de la pantalla lo va leyendo.
 *
 * Es un archivo y no un socket a propósito: la siembra y la pantalla son
 * procesos distintos que pueden arrancar en cualquier orden, y un archivo
 * en disco sobrevive a los dos. La siembra lo trunca al arrancar; el
 * evento final `cosecha` es el punto y aparte.
 */

export function rutaEnVivo(repo: string): string {
  return join(repo, ".dolphin", "en-vivo.jsonl");
}

/** Lo que viaja por el canal: chico, por id, nunca el objeto entero. */
export type EventoEnVivo =
  | { tipo: "siembra"; tarea: string; universos: number; fases?: string[]; agente?: string }
  | { tipo: "nace"; u: string; enfoque: string }
  | { tipo: "escribio"; u: string; archivos: number; agregadas: number; quitadas: number; modelo?: string }
  | { tipo: "fallo-escribiendo"; u: string; porQue: string }
  | { tipo: "verifica"; u: string; verificador: string; costo: string }
  | { tipo: "veredicto"; u: string; verificador: string; paso: boolean; detalle: string; ms: number; intento?: number; salteada?: boolean }
  | { tipo: "corrige"; u: string; verificador: string; intento: number }
  | { tipo: "cosecha"; elegida?: string; porQue?: string; ms?: number; gastado?: number; suscripcion?: boolean };

export async function abrirEnVivo(repo: string): Promise<(evento: EventoEnVivo) => void> {
  const ruta = rutaEnVivo(repo);
  await carpetaDeDolphin(repo);
  await writeFile(ruta, "");

  // Los appends van en fila: dos eventos del mismo milisegundo no se
  // pisan la línea. Y un disco que falla no voltea la siembra: el canal
  // en vivo es un lujo, la cosecha es lo que importa.
  let cola: Promise<unknown> = Promise.resolve();
  return (evento) => {
    cola = cola.then(() =>
      appendFile(ruta, `${JSON.stringify({ t: Date.now(), ...evento })}\n`).catch(() => {}),
    );
  };
}

/** Reduce un evento de la siembra a lo que viaja por el canal: chico, por id. */
export function reducirEvento(evento: Evento): EventoEnVivo | null {
  switch (evento.tipo) {
    case "nace":
      return { tipo: "nace", u: evento.universo.id, enfoque: evento.enfoque };
    case "escribio":
      return {
        tipo: "escribio",
        u: evento.universo.id,
        archivos: evento.forma.archivos,
        agregadas: evento.forma.agregadas,
        quitadas: evento.forma.quitadas,
        ...(evento.modelo ? { modelo: evento.modelo } : {}),
      };
    case "fallo-escribiendo":
      return { tipo: "fallo-escribiendo", u: evento.universo.id, porQue: evento.porQue };
    case "verifica":
      return { tipo: "verifica", u: evento.universo.id, verificador: evento.verificador, costo: evento.costo };
    case "veredicto":
      return {
        tipo: "veredicto",
        u: evento.universo.id,
        verificador: evento.verificador,
        paso: evento.paso,
        detalle: evento.detalle,
        ms: evento.ms,
        ...(evento.intento !== undefined ? { intento: evento.intento } : {}),
        ...(evento.salteada ? { salteada: true } : {}),
      };
    case "corrige":
      return { tipo: "corrige", u: evento.universo.id, verificador: evento.verificador, intento: evento.intento };
    default:
      return null;
  }
}
