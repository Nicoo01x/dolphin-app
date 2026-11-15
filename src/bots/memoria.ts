import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeBots, leerHistorial, type EntradaDeHistorial } from "./almacen.js";

export const TOPE_DE_MEMORIA = 2_200;

const palabras = (texto: string): string[] =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g) ?? [];

export interface FragmentoDeMemoria {
  readonly fecha: string;
  readonly texto: string;
  readonly puntaje: number;
}

const fragmentoDeHistorial = (entrada: EntradaDeHistorial): FragmentoDeMemoria => ({
  fecha: entrada.cuando.slice(0, 10),
  texto: `${entrada.quien}: ${entrada.texto}`,
  puntaje: 0,
});

export async function buscarEnBot(id: string, consulta: string): Promise<FragmentoDeMemoria[]> {
  const buscadas = new Set(palabras(consulta));
  if (!buscadas.size) return [];
  const historial = await leerHistorial(id, Number.MAX_SAFE_INTEGER);
  const partesDir = join(carpetaDeBots(), id, "partes");
  const nombres = (await readdir(partesDir).catch(() => [] as string[])).filter((nombre) => nombre.endsWith(".md"));
  const partes = await Promise.all(
    nombres.map(async (nombre) => ({
      fecha: nombre.slice(0, 10),
      texto: await readFile(join(partesDir, nombre), "utf8").catch(() => ""),
    })),
  );
  const candidatos = [
    ...historial.map(fragmentoDeHistorial),
    ...partes.map((parte) => ({ ...parte, puntaje: 0 })),
  ];
  return candidatos
    .map((fragmento) => {
      const texto = new Set(palabras(fragmento.texto));
      return { ...fragmento, puntaje: [...buscadas].filter((palabra) => texto.has(palabra)).length };
    })
    .filter((fragmento) => fragmento.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje || b.fecha.localeCompare(a.fecha))
    .slice(0, 5);
}

export function textoDeBusqueda(consulta: string, resultados: readonly FragmentoDeMemoria[]): string {
  if (!resultados.length) return `No encontré recuerdos para «${consulta}».`;
  return [
    `Resultados para «${consulta}»:`,
    ...resultados.map((resultado) => `- ${resultado.fecha}: ${resultado.texto.trim().slice(0, 500)}`),
  ].join("\n");
}
