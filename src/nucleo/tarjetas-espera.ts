import { buscarTarjeta, cambiarTarjeta, leerTablero, type Tarjeta } from "./tarjetas.js";

/**
 * Una tarjeta que espera a otra (ver docs/idea.md): «los tests de la exportación» no arrancan hasta
 * que «la exportación» esté en Hecho. Con eso el tablero sabe qué se puede hacer ya, y la noche (o
 * el equipo) no toma algo que se va a romper porque le falta lo de abajo.
 *
 * Se guarda en la tarjeta que espera (`esperaA`, los ids de las otras). Una tarjeta que ya no está no
 * bloquea a nadie: borrar una tarjeta no puede dejar a otra trabada para siempre.
 */

/** Las tarjetas que todavía la frenan: las que espera y no están en Hecho. */
export function laFrenan(t: Pick<Tarjeta, "esperaA">, tablero: readonly Tarjeta[]): Tarjeta[] {
  if (!t.esperaA?.length) return [];
  const porId = new Map(tablero.map((x) => [x.id, x] as const));
  return t.esperaA.map((id) => porId.get(id)).filter((x): x is Tarjeta => x !== undefined && x.columna !== "hecho");
}

/** Las que la esperan a ella: lo que se destraba cuando esta llega a Hecho. */
export function laEsperan(t: Pick<Tarjeta, "id">, tablero: readonly Tarjeta[]): Tarjeta[] {
  return tablero.filter((x) => x.esperaA?.includes(t.id));
}

/**
 * Lo que se puede hacer ya: Para hacer y sin nada que la frene, en el orden del tablero (lo que se
 * movió último, arriba). Es lo que toma quien trabaja solo.
 */
export function listasParaHacer(tablero: readonly Tarjeta[]): Tarjeta[] {
  return tablero.filter((t) => t.columna === "para-hacer" && laFrenan(t, tablero).length === 0);
}

/** ¿Llega a `buscada` siguiendo lo que espera `desde`? Es lo que impide un círculo. */
function llegaA(desde: string, buscada: string, tablero: readonly Tarjeta[]): boolean {
  const porId = new Map(tablero.map((x) => [x.id, x] as const));
  const vistas = new Set<string>();
  const pila = [desde];
  while (pila.length > 0) {
    const id = pila.pop()!;
    if (id === buscada) return true;
    if (vistas.has(id)) continue;
    vistas.add(id);
    pila.push(...(porId.get(id)?.esperaA ?? []));
  }
  return false;
}

/**
 * Que `id` espere a `otra` (las dos se pueden abreviar, como un hash). No se puede esperar a sí misma
 * ni armar un círculo: si `otra` ya espera, directa o indirectamente, a `id`, no arrancaría ninguna.
 */
export async function esperar(repo: string, id: string, otra: string): Promise<Tarjeta> {
  const [t, o] = [await buscarTarjeta(repo, id), await buscarTarjeta(repo, otra)];
  if (t.id === o.id) throw new Error("una tarjeta no se puede esperar a sí misma");
  if (llegaA(o.id, t.id, await leerTablero(repo))) throw new Error(`«${o.titulo}» ya espera a «${t.titulo}»: se esperarían para siempre`);
  return cambiarTarjeta(repo, t.id, (x) => (x.esperaA?.includes(o.id) ? x : { ...x, esperaA: [...(x.esperaA ?? []), o.id] }));
}

/** Que deje de esperarla. Esperar a una que ya no está también se puede soltar, por su id entero. */
export async function soltar(repo: string, id: string, otra: string): Promise<Tarjeta> {
  const t = await buscarTarjeta(repo, id);
  const cual = await buscarTarjeta(repo, otra).then(
    (o) => o.id,
    () => otra.trim(),
  );
  return cambiarTarjeta(repo, t.id, (x) => {
    const { esperaA: _e, ...resto } = x;
    const quedan = (x.esperaA ?? []).filter((e) => e !== cual);
    return quedan.length > 0 ? { ...resto, esperaA: quedan } : resto;
  });
}
