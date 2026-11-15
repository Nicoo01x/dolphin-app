import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { escribirDeUna } from "../nucleo/escritura.js";
import { carpetaDelBot } from "./almacen-rutas.js";

export interface Habilidad {
  readonly nombre: string;
  readonly descripcion: string;
  readonly cuerpo: string;
}
const nombreHabilidad = (nombre: string): string => {
  if (!nombre.trim()) throw new Error("nombre de habilidad inválido");
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "habilidad";
};

export async function listarHabilidades(id: string): Promise<Habilidad[]> {
  const dir = join(carpetaDelBot(id), "habilidades");
  const nombres = await readdir(dir).catch(() => [] as string[]);
  const salidas: Habilidad[] = [];
  for (const nombre of nombres.filter((x) => x.endsWith(".md")).sort()) {
    const h = await leerHabilidad(id, nombre.slice(0, -3)).catch(() => undefined);
    if (h) salidas.push(h);
  }
  return salidas;
}
export async function leerHabilidad(id: string, nombre: string): Promise<Habilidad> {
  const texto = await readFile(join(carpetaDelBot(id), "habilidades", `${nombreHabilidad(nombre)}.md`), "utf8");
  const match = /^---\s*\nname:\s*(.+)\ndescription:\s*(.+)\n---\s*\n([\s\S]*)$/.exec(texto);
  if (!match) throw new Error("habilidad sin frontmatter válido");
  return { nombre: match[1]!.trim(), descripcion: match[2]!.trim(), cuerpo: match[3]!.trim() };
}
export async function guardarHabilidad(id: string, nombre: string, descripcion: string, cuerpo: string): Promise<Habilidad> {
  const n = nombreHabilidad(nombre);
  const habilidad = { nombre: n, descripcion: descripcion.trim(), cuerpo: cuerpo.trim() };
  if (!habilidad.descripcion) throw new Error("la habilidad necesita descripción");
  if (/[\r\n]/.test(descripcion)) throw new Error("la descripción de una habilidad debe ocupar un solo renglón");
  await mkdir(join(carpetaDelBot(id), "habilidades"), { recursive: true });
  await escribirDeUna(join(carpetaDelBot(id), "habilidades", `${n}.md`), `---\nname: ${n}\ndescription: ${habilidad.descripcion}\n---\n${habilidad.cuerpo}\n`);
  return habilidad;
}
export async function borrarHabilidad(id: string, nombre: string): Promise<void> {
  await rm(join(carpetaDelBot(id), "habilidades", `${nombreHabilidad(nombre)}.md`), { force: true });
}
