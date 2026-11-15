import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, enFila } from "../nucleo/escritura.js";

/**
 * La charla con Dolphin no se pierde al cerrar: cada mensaje (tuyo y suyo) se anota en
 * `.dolphin/charla.jsonl`. Al volver a abrir, lo último vuelve al chat (y el triage lo tiene en
 * cuenta), y `/buscar` encuentra cualquier cosa que se haya dicho en cualquier sesión.
 * Una línea por mensaje: se agrega sin reescribir, y una línea rota no tira las demás.
 */

export interface MensajeGuardado {
  readonly t: number;
  readonly quien: "vos" | "dolphin";
  readonly texto: string;
}

const ruta = (repo: string) => join(repo, ".dolphin", "charla.jsonl");

export async function guardarMensaje(repo: string, m: MensajeGuardado): Promise<void> {
  await carpetaDeDolphin(repo);
  await enFila(ruta(repo), () => appendFile(ruta(repo), `${JSON.stringify({ t: m.t, quien: m.quien, texto: m.texto })}\n`, "utf8"));
}

export async function leerCharla(repo: string): Promise<MensajeGuardado[]> {
  const crudo = await readFile(ruta(repo), "utf8").catch(() => "");
  const mensajes: MensajeGuardado[] = [];
  for (const linea of crudo.split("\n")) {
    if (!linea.trim()) continue;
    try {
      const m = JSON.parse(linea) as Partial<MensajeGuardado>;
      if (typeof m.t === "number" && (m.quien === "vos" || m.quien === "dolphin") && typeof m.texto === "string") mensajes.push({ t: m.t, quien: m.quien, texto: m.texto });
    } catch {
      // una línea cortada (se cerró a mitad de escribir): se saltea
    }
  }
  return mensajes;
}

const normal = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Lo que se dijo con todas las palabras de la consulta, de lo más nuevo a lo más viejo. */
export async function buscarEnCharla(repo: string, consulta: string, tope = 8): Promise<MensajeGuardado[]> {
  const palabras = normal(consulta).split(/\s+/).filter((p) => p.length > 1);
  if (palabras.length === 0) return [];
  return (await leerCharla(repo))
    .filter((m) => {
      const texto = normal(m.texto);
      return palabras.every((p) => texto.includes(p));
    })
    .sort((a, b) => b.t - a.t)
    .slice(0, tope);
}

/** «27/10 14:05»: cuándo se dijo, corto. */
export function cuandoSeDijo(t: number): string {
  const d = new Date(t);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
