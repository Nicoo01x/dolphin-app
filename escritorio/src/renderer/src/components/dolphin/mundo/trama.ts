/**
 * La cuenta del grabado en puntos, sin canvas: qué tan grande es cada punto según la lámina, cuándo
 * aparece mientras se dibuja, cómo respira con el oleaje y dónde está el catalejo. Es la técnica del
 * `Grabado.tsx` que tuvo la web (borrado en 61659c86ea, ver assets/laminas/FUENTE.md), pasada de un
 * shader a cuentas chicas para un canvas 2D: el inicio dibuja unos pocos miles de puntos a pocos
 * cuadros por segundo, y así no hace falta WebGL para algo que es casi quieto.
 */

/** La lámina en grises, ya estirada a su negro y su blanco reales: 0 negro, 1 blanco. */
export type Luminancia = { ancho: number; alto: number; datos: Float32Array }

export type Lente = { x: number; y: number; radio: number }

const clamp = (valor: number, min = 0, max = 1): number => Math.min(max, Math.max(min, valor))

/**
 * El negro y el blanco de verdad de un escaneo (percentiles 3 y 97): un grabado viejo va de gris a
 * crema, y tramarlo sin estirarlo da una lámina lavada.
 */
export function nivelesDe(valores: ArrayLike<number>): [number, number] {
  if (valores.length === 0) {
    return [0, 1]
  }
  const ordenados = Array.from(valores).sort((a, b) => a - b)
  const en = (p: number): number =>
    ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * p))] ?? 0
  return [en(0.03), en(0.97)]
}

/** Los píxeles RGBA de la lámina, como luminancia estirada a sus niveles. */
export function luminanciaDe(rgba: ArrayLike<number>, ancho: number, alto: number): Luminancia {
  const crudos = new Float32Array(ancho * alto)
  for (let i = 0; i < crudos.length; i += 1) {
    const r = rgba[i * 4] ?? 0
    const g = rgba[i * 4 + 1] ?? 0
    const b = rgba[i * 4 + 2] ?? 0
    crudos[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  const [negro, blanco] = nivelesDe(crudos.filter((_, i) => i % 7 === 0))
  const rango = Math.max(blanco - negro, 0.05)
  return { ancho, alto, datos: crudos.map((valor) => clamp((valor - negro) / rango)) }
}

/**
 * Cómo va la lámina en la franja: pegada a la derecha y arriba, con un alto de `alto` veces el de la
 * franja (lo de abajo se corta), y su borde izquierdo fundido en `fundido` de su ancho. No cubre la
 * franja entera a propósito: lo que queda a la izquierda, vacío, es donde van las cifras.
 *
 * `anchoMaximo` es lo más ancha que puede ser, en fracción del ancho de la franja: si por su
 * proporción ocuparía más (una franja alta, o una ventana angosta), se achica sin deformarse y queda
 * anclada abajo a la derecha, con el mismo pie cortado que tendría a su tamaño. Así la ola nunca se
 * mete debajo de las cifras.
 */
export type Composicion = { alto: number; fundido: number; anchoMaximo?: number }

/**
 * Dónde cae la lámina en el lienzo: `escala` (píxeles de la lámina por píxel del lienzo), su borde
 * izquierdo y su borde de arriba en el lienzo, y el ancho que ocupa.
 */
export type Encuadre = { escala: number; izquierda: number; arriba: number; ancho: number }

export function medidasDelEncuadre(
  anchoLienzo: number,
  altoLienzo: number,
  lamina: Pick<Luminancia, 'ancho' | 'alto'>,
  composicion: Composicion
): Encuadre {
  const escala = lamina.alto / Math.max(1, altoLienzo * composicion.alto)
  const ancho = lamina.ancho / escala
  const tope = anchoLienzo * (composicion.anchoMaximo ?? Number.POSITIVE_INFINITY)
  if (ancho <= tope) {
    return { escala, izquierda: anchoLienzo - ancho, arriba: 0, ancho }
  }
  // Más chica, con su proporción: la fila de la lámina que tocaba el pie de la franja lo sigue
  // tocando, así la ola apoya sobre el tablero en vez de quedar colgada del techo.
  const escalaChica = lamina.alto / Math.max(1, (tope * lamina.alto) / lamina.ancho)
  const altoChico = lamina.alto / escalaChica
  const hastaElPie = Math.min(1, 1 / composicion.alto)
  return {
    escala: escalaChica,
    izquierda: anchoLienzo - tope,
    arriba: altoLienzo - altoChico * hastaElPie,
    ancho: tope
  }
}

/**
 * De un punto del lienzo a un punto de la lámina: `[u, v, peso]`, con `peso` 0 fuera de la lámina y
 * subiendo de 0 a 1 en su borde izquierdo.
 */
export function encuadre(
  anchoLienzo: number,
  altoLienzo: number,
  lamina: Pick<Luminancia, 'ancho' | 'alto'>,
  composicion: Composicion
): (x: number, y: number) => [number, number, number] {
  const { escala, izquierda, arriba, ancho } = medidasDelEncuadre(
    anchoLienzo,
    altoLienzo,
    lamina,
    composicion
  )
  const fundido = Math.max(1, ancho * composicion.fundido)
  return (x, y) => {
    const adentro = x - izquierda
    const v = (y - arriba) * escala
    return adentro < 0 || v < 0 ? [0, 0, 0] : [adentro * escala, v, clamp(adentro / fundido)]
  }
}

/** La luminancia en un punto de la lámina, interpolada entre los cuatro píxeles vecinos. */
export function muestra(lamina: Luminancia, u: number, v: number): number {
  const x = clamp(u - 0.5, 0, lamina.ancho - 1)
  const y = clamp(v - 0.5, 0, lamina.alto - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(lamina.ancho - 1, x0 + 1)
  const y1 = Math.min(lamina.alto - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const en = (px: number, py: number): number => lamina.datos[py * lamina.ancho + px] ?? 0
  const arriba = en(x0, y0) * (1 - fx) + en(x1, y0) * fx
  const abajo = en(x0, y1) * (1 - fx) + en(x1, y1) * fx
  return arriba * (1 - fy) + abajo * fy
}

/**
 * La luminancia media de un cuadrado de lado `2 · radio` alrededor de un punto de la lámina. Es lo
 * que hace una trama de imprenta: cada punto lleva la tinta de toda su celda. Muestrear un solo
 * punto se saltea las líneas finas del grabado —en Hokusai, el contorno de la espuma—, y entonces
 * la espuma blanca se confunde con el cielo y la silueta de la ola desaparece.
 */
export function muestraMedia(lamina: Luminancia, u: number, v: number, radio: number): number {
  const LADO = 4
  let suma = 0
  for (let j = 0; j < LADO; j += 1) {
    for (let i = 0; i < LADO; i += 1) {
      const du = ((i + 0.5) / LADO - 0.5) * 2 * radio
      const dv = ((j + 0.5) / LADO - 0.5) * 2 * radio
      suma += muestra(lamina, u + du, v + dv)
    }
  }
  return suma / (LADO * LADO)
}

/**
 * Cuánta tinta lleva un punto: la tinta de la lámina. El cielo liso no lleva puntos; la espuma,
 * cruzada de líneas finas, lleva puntos chicos; el azul hondo de la ola, llenos. La curva abre los
 * valores bajos (exponente < 1) a propósito: es la diferencia de tamaño entre la espuma y el cielo
 * lo que dibuja la silueta. En claro es la lámina como se imprimió; en oscuro, la misma en plata.
 * Medido sobre la lámina, por celda: cielo 0,07 de tinta, espuma 0,16 (hasta 0,32), azul 0,82.
 */
export function tonoDe(luminancia: number, desde = 0.1, rango = 0.55): number {
  return clamp((1 - luminancia - desde) / rango) ** 0.6
}

/** Un número fijo entre 0 y 1 por celda: el desorden del dibujo, igual en cada cuadro. */
export function azar(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Cuánto de su tamaño tiene un punto mientras la lámina se dibuja (`progreso` de 0 a 1): aparecen
 * de lo hondo —abajo— hacia la superficie, con un poco de desorden para que no sea una cortina.
 */
export function revelado(alturaRelativa: number, desorden: number, progreso: number): number {
  if (progreso >= 1) {
    return 1
  }
  const comienzo = ((1 - clamp(alturaRelativa)) * 0.72 + desorden * 0.2) * 0.88
  const t = clamp((progreso - comienzo) / 0.12)
  return 1 - (1 - t) ** 3
}

/** El oleaje: cada punto respira apenas, en una onda lenta que viaja a lo ancho. */
export function oleaje(x: number, y: number, ms: number): number {
  return 1 + 0.09 * Math.sin(x * 0.018 - ms * 0.0011 + Math.sin(y * 0.05 + ms * 0.0004) * 1.5)
}

/** 1 adentro del catalejo, 0 afuera, con un canto de un par de píxeles. */
export function enLente(x: number, y: number, lente: Lente | null): number {
  if (!lente || lente.radio <= 0) {
    return 0
  }
  const distancia = Math.hypot(x - lente.x, y - lente.y)
  return clamp((lente.radio - distancia) / 2 + 0.5)
}

/**
 * Dónde mira el catalejo: acerca un poco, como un lente de verdad, alrededor de su centro. Es lo
 * que hace que bajo el cursor se vea el buril del grabado y no la misma trama más chica.
 */
export function bajoElLente(x: number, y: number, lente: Lente, aumento: number): [number, number] {
  return [lente.x + (x - lente.x) / aumento, lente.y + (y - lente.y) / aumento]
}
