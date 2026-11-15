/**
 * Dónde va un bloque de código que el chat propuso.
 *
 * Es la mitad difícil de «Aplicar»: el agente te tira un pedazo y hay que encontrar a qué parte
 * del archivo reemplaza. Cursor lo resuelve con un modelo, y para los casos raros no hay otra. Pero
 * la mayoría de las veces el bloque trae sus propias anclas —la primera y la última línea son
 * líneas que ya existen en el archivo— y eso se ubica con certeza, al instante y gratis.
 *
 * La regla de oro acá es no adivinar: si el bloque no se puede ubicar sin dudas, esto devuelve
 * `null` o `'ambiguo'` y que decida otro. Aplicar en el lugar equivocado es peor que no aplicar:
 * la persona aprieta un botón que dice «Aplicar» y le queda el archivo roto en otro lado.
 */

export type Tramo = { desde: number; hasta: number }

/** Lo que el bloque dice de sí mismo cuando no se puede ubicar. */
export type Ubicacion = Tramo | null | 'ambiguo'

/** Las marcas con las que un agente dice «y acá sigue igual». */
const ELISION = /^\s*(?:\/\/|#|--|\/\*|\*)?\s*\.{3,}\s*(?:\*\/)?\s*$/

export function esElision(linea: string): boolean {
  return ELISION.test(linea)
}

function lineasUtiles(bloque: string): string[] {
  return bloque.split('\n').filter((linea) => linea.trim() !== '' && !esElision(linea))
}

/** Dónde empieza cada aparición de una línea, comparada sin los espacios de los costados. */
function aparicionesDeLinea(lineasDelTexto: string[], buscada: string): number[] {
  const objetivo = buscada.trim()
  const donde: number[] = []
  for (const [indice, linea] of lineasDelTexto.entries()) {
    if (linea.trim() === objetivo) {
      donde.push(indice)
    }
  }
  return donde
}

/** El desplazamiento en caracteres donde arranca la línea `indice`. */
function arranqueDeLinea(lineas: string[], indice: number): number {
  let total = 0
  for (let i = 0; i < indice; i += 1) {
    total += lineas[i]!.length + 1
  }
  return total
}

/**
 * El tramo del archivo que el bloque reemplaza.
 *
 * Tres intentos, de más seguro a menos:
 *
 * 1. El bloque entero ya está en el archivo, tal cual: entonces reemplaza eso (es el caso de
 *    «mismo código con un cambio adentro»).
 * 2. La primera línea útil del bloque aparece **una sola vez** en el archivo: ahí arranca. La
 *    última se busca desde ahí para abajo y vale la primera que aparezca. Esto es lo que resuelve
 *    el bloque con `// ...` en el medio.
 * 3. Nada de eso: no se ubica.
 *
 * Por qué sólo el arranque tiene que ser único: la última línea de un bloque de código casi
 * siempre es `}`, y `}` está en todos lados — exigirle unicidad dejaba «ambiguo» a casi todo y la
 * función no servía para nada. El riesgo que queda es cerrar en una llave interna y abarcar de
 * menos, y eso se ve: Aplicar muestra el diff antes de escribir. Equivocar el ARRANQUE, en cambio,
 * mete el cambio en otra parte del archivo y eso no se ve, por eso ahí no se admite duda.
 *
 * La comparación ignora los espacios de los costados porque el agente casi nunca devuelve la
 * sangría original, pero NO ignora el contenido: una línea distinta es otra línea.
 */
export function ubicarBloque(texto: string, bloque: string): Ubicacion {
  const utiles = lineasUtiles(bloque)
  if (utiles.length === 0) {
    return null
  }
  const lineas = texto.split('\n')

  const exacto = texto.indexOf(bloque)
  if (exacto !== -1) {
    return texto.includes(bloque, exacto + 1)
      ? 'ambiguo'
      : { desde: exacto, hasta: exacto + bloque.length }
  }

  const arriba = aparicionesDeLinea(lineas, utiles[0]!)
  if (arriba.length === 0) {
    return null
  }
  if (arriba.length > 1) {
    return 'ambiguo'
  }
  const desdeLinea = arriba[0]!
  const hastaLinea = aparicionesDeLinea(lineas, utiles.at(-1)!).find((linea) => linea >= desdeLinea)
  if (hastaLinea === undefined) {
    return 'ambiguo'
  }
  // Una sola línea útil que aparece una vez: reemplaza esa línea y nada más.
  return {
    desde: arranqueDeLinea(lineas, desdeLinea),
    hasta: arranqueDeLinea(lineas, hastaLinea) + lineas[hastaLinea]!.length
  }
}

/** Si el bloque trae marcas de «acá sigue igual», que es cuando hace falta un modelo para rellenar. */
export function bloqueTieneElisiones(bloque: string): boolean {
  return bloque.split('\n').some(esElision)
}
