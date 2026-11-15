/**
 * Cómo se nombra el elemento que alguien tocó en el preview.
 *
 * El inspector corre adentro del iframe y junta del DOM lo que ve: etiqueta, id, clases, `data-*`,
 * texto y posición entre hermanos. Convertir eso en un selector es lógica pura, así que vive acá y
 * se prueba sin navegador —el mismo reparto que el explorador: un solo archivo sabe de DOM.
 *
 * El selector no es para un test eterno: es para que el agente encuentre el elemento en el código.
 * Por eso el orden de preferencia va de lo que el repo escribió a propósito a lo que el navegador
 * armó solo:
 *
 * 1. `data-testid` y compañía: alguien lo puso justo para esto.
 * 2. El id, si no parece generado. Los de React (`:r3:`) y Radix (`radix-:r1:`) cambian en cada
 *    render: un selector con eso adentro no sirve ni para volver a encontrarlo.
 * 3. Etiqueta + clases propias + posición, colgado del ancestro más cercano que SÍ se pueda
 *    nombrar. Sin el ancla, un `button:nth-of-type(2)` suelto apunta a cualquier parte.
 *
 * Las clases de utilidades con corchetes o dos puntos (`md:flex`, `w-[32px]`) se dejan afuera: en
 * un selector hay que escaparlas y, escapadas, son ilegibles para quien tiene que leer el pedido.
 * Las de CSS-in-JS (`css-1x2y3z`, `sc-aBcDeF`) también: cambian con cada build.
 */

export interface NodoVisto {
  readonly etiqueta: string;
  readonly id?: string;
  readonly clases?: readonly string[];
  /** El `data-*` que el inspector eligió, si el elemento tiene uno de los que se usan para esto. */
  readonly marca?: { readonly atributo: string; readonly valor: string };
  /** Qué número es entre los hermanos de su MISMA etiqueta, empezando en 1. */
  readonly posicion?: number;
  /** Cuántos hermanos de la misma etiqueta hay. Con 1, la posición no hace falta. */
  readonly hermanosIguales?: number;
}

/** Ids que el framework inventó: iguales hoy, distintos en el próximo render. */
const ID_GENERADO = [
  /^:/, // los `useId` de React: «:r3:»
  /^(?:radix|headlessui|mui|reach|ember|ng|rc)[-_]/i,
  /^[a-f0-9]{16,}$/i,
  /^[0-9]/, // un id que arranca con número no es un selector válido sin escapar
  /^(?:react|_)/i,
];

/** Clases que no sirven en un selector: las que hay que escapar y las que cambian con el build. */
const CLASE_INSERVIBLE = [
  /[^\w-]/, // corchetes, dos puntos, barras, puntos: `md:flex`, `w-[32px]`, `p-1.5`
  /^css-[a-z0-9]{4,}$/i,
  /^sc-[a-z0-9]{5,}$/i,
  /^jsx-\d+$/,
  /^[a-z][\w-]*?[-_][a-f0-9]{6,}$/i, // `boton-9f3c1a`, los módulos de CSS
];

const idUsable = (id: string | undefined): boolean => id !== undefined && id.trim() !== "" && !ID_GENERADO.some((p) => p.test(id));

const clasesUsables = (clases: readonly string[] | undefined): readonly string[] =>
  (clases ?? []).filter((c) => c.trim() !== "" && !CLASE_INSERVIBLE.some((p) => p.test(c))).slice(0, 2);

/** Cómo se nombra UN nodo, sin mirar a su familia. `undefined` = con esto solo no se lo encuentra. */
function nombreDe(nodo: NodoVisto): { selector: string; unico: boolean } | undefined {
  if (nodo.marca) return { selector: `[${nodo.marca.atributo}="${nodo.marca.valor}"]`, unico: true };
  if (idUsable(nodo.id)) return { selector: `#${nodo.id}`, unico: true };
  const clases = clasesUsables(nodo.clases);
  const etiqueta = nodo.etiqueta.toLowerCase();
  const base = `${etiqueta}${clases.map((c) => `.${c}`).join("")}`;
  // La posición solo cuando hay con quién confundirse: un `:nth-of-type(1)` que sobra hace creer
  // que al lado hay otros iguales.
  const conPosicion = (nodo.hermanosIguales ?? 1) > 1 && nodo.posicion !== undefined ? `${base}:nth-of-type(${nodo.posicion})` : base;
  return { selector: conPosicion, unico: false };
}

/**
 * El selector del primer nodo del camino.
 *
 * `camino` va del elemento hacia arriba: `[elemento, padre, abuelo, …]`. Es el orden en que lo
 * junta el inspector subiendo por `parentElement`, y así el que llama no tiene que darlo vuelta.
 */
export function selectorDe(camino: readonly NodoVisto[]): string {
  const elemento = camino[0];
  if (!elemento) return "";
  const suyo = nombreDe(elemento)!;
  if (suyo.unico) return suyo.selector;

  // Se cuelga del ancestro más cercano que se pueda nombrar solo; si no hay ninguno en tres
  // niveles, se usan esos tres igual: acorta la búsqueda aunque no sea único.
  const partes = [suyo.selector];
  for (const ancestro of camino.slice(1, 4)) {
    const nombre = nombreDe(ancestro)!;
    partes.unshift(nombre.selector);
    if (nombre.unico) break;
  }
  return partes.join(" > ");
}

/** Qué `data-*` de un elemento sirve como marca, en orden de preferencia. */
export const ATRIBUTOS_DE_MARCA: readonly string[] = ["data-testid", "data-test-id", "data-test", "data-cy", "data-qa", "data-dolphin"];

/**
 * Lo que se le dice a la persona de lo que tocó, en una línea.
 *
 * El selector solo no se entiende de un vistazo; el texto del botón sí. Van los dos, porque el
 * selector es lo que el agente usa para buscarlo en el código.
 */
export function comoSeLlama(camino: readonly NodoVisto[], texto?: string): string {
  const selector = selectorDe(camino);
  const dice = (texto ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return dice === "" ? selector : `«${dice}» · ${selector}`;
}
