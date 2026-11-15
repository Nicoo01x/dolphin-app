import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Lo que se acumula en `.dolphin/` sin que nadie lo mire: los videos de lo
 * que falló y las capturas de cada veredicto de Vision. No se podaban nunca,
 * y en un repo con muchas siembras eran gigas. Se deja lo más nuevo: hasta
 * `cuantas` entradas y nada de más de `dias` días. Lo que no se puede borrar
 * (un video abierto en el reproductor) se intenta la próxima vez.
 */
export async function podar(
  carpeta: string,
  { cuantas, dias, salvo = [] }: { readonly cuantas: number; readonly dias: number; readonly salvo?: readonly string[] },
): Promise<number> {
  const nombres = await readdir(carpeta).catch(() => [] as string[]);
  const entradas = await Promise.all(
    nombres
      .filter((n) => !salvo.includes(n))
      .map(async (nombre) => ({ nombre, cuando: (await stat(join(carpeta, nombre)).catch(() => undefined))?.mtimeMs ?? 0 })),
  );
  const limite = Date.now() - dias * 86_400_000;
  const ordenadas = entradas.sort((a, b) => b.cuando - a.cuando);
  const sobran = ordenadas.filter((e, i) => i >= cuantas || e.cuando < limite);
  let podadas = 0;
  for (const e of sobran) {
    await rm(join(carpeta, e.nombre), { recursive: true, force: true }).then(
      () => (podadas += 1),
      () => {},
    );
  }
  return podadas;
}
