import {
  azar,
  bajoElLente,
  encuadre,
  enLente,
  medidasDelEncuadre,
  muestra,
  muestraMedia,
  oleaje,
  revelado,
  tonoDe,
  type Composicion,
  type Lente,
  type Luminancia
} from './trama'

/**
 * Separación de la trama en px de CSS. Gruesa a propósito: lo que dibuja la forma es cuánto cambia
 * el tamaño de un punto entre la luz y la sombra, y con 5 px sólo quedaban crestas sueltas.
 */
export const PASO = 7
/** Bajo el catalejo la trama va mucho más fina, y acerca un poco: ahí se ve el detalle. */
const PASO_FINO = 2.5
const AUMENTO = 1.4
/** Llenos, los puntos se tocan: la sombra de la ola se lee como una masa y la espuma como huecos. */
const RADIO_MAXIMO = PASO * 0.5
const RADIO_MAXIMO_FINO = PASO_FINO * 0.5 * 0.96

/**
 * La lámina, pegada a la derecha y apenas más alta que la franja: entra casi entera, con el Fuji.
 * Nunca más ancha que el 62 % de la franja: lo que queda a la izquierda es de las cifras. Si no
 * entra, se achica (se probó recortarla por la izquierda: en una franja alta y angosta quedaba sólo
 * la cresta, cortada; achicada se ve siempre la ola entera, con el Fuji y las barcas).
 */
const COMPOSICION: Composicion = { alto: 1.15, fundido: 0.25, anchoMaximo: 0.62 }
/** El instante que se muestra quieto con «reducir movimiento» y en las capturas. */
export const MOMENTO_QUIETO = 10_400

/** Los puntos de la trama gruesa, ya con su tono: x, y, tono y desorden de cada uno. */
export type Escena = {
  ancho: number
  alto: number
  puntos: Float32Array
  lamina: Luminancia
  aLamina: (x: number, y: number) => [number, number, number]
}

export function armarEscena(ancho: number, alto: number, lamina: Luminancia): Escena {
  const aLamina = encuadre(ancho, alto, lamina, COMPOSICION)
  // Media celda, en píxeles de la lámina: cada punto lleva la tinta de toda su celda.
  const mediaCelda = (PASO / 2) * medidasDelEncuadre(ancho, alto, lamina, COMPOSICION).escala
  const filas = Math.ceil(alto / PASO)
  const columnas = Math.ceil(ancho / PASO) + 1
  const puntos = new Float32Array(filas * columnas * 4)
  let n = 0
  for (let fila = 0; fila < filas; fila += 1) {
    // Filas corridas medio paso, como la trama de una lámina impresa.
    const corrido = fila % 2 === 0 ? 0 : PASO / 2
    for (let columna = 0; columna < columnas; columna += 1) {
      const x = columna * PASO + corrido
      const y = fila * PASO + PASO / 2
      const [u, v, peso] = aLamina(x, y)
      puntos[n] = x
      puntos[n + 1] = y
      puntos[n + 2] = peso > 0 ? tonoDe(muestraMedia(lamina, u, v, mediaCelda)) * peso : 0
      puntos[n + 3] = azar(columna, fila)
      n += 4
    }
  }
  return { ancho, alto, puntos: puntos.subarray(0, n), lamina, aLamina }
}

export type Cuadro = {
  ms: number
  /** Cuánto se dibujó la lámina, de 0 a 1. */
  progreso: number
  lente: Lente | null
  color: string
  alfa: number
}

function punto(g: CanvasRenderingContext2D, x: number, y: number, radio: number): void {
  g.moveTo(x + radio, y)
  g.arc(x, y, radio, 0, Math.PI * 2)
}

function trazarFinos(g: CanvasRenderingContext2D, escena: Escena, cuadro: Cuadro, lente: Lente) {
  const desde = (valor: number) => Math.floor((valor - lente.radio) / PASO_FINO) * PASO_FINO
  g.beginPath()
  for (let y = Math.max(0, desde(lente.y)); y <= lente.y + lente.radio; y += PASO_FINO) {
    for (let x = Math.max(0, desde(lente.x)); x <= lente.x + lente.radio; x += PASO_FINO) {
      if (enLente(x, y, lente) < 0.5) {
        continue
      }
      const [lx, ly] = bajoElLente(x, y, lente, AUMENTO)
      const [u, v, peso] = escena.aLamina(lx, ly)
      const tono = peso > 0 ? tonoDe(muestra(escena.lamina, u, v)) * peso : 0
      const radio =
        RADIO_MAXIMO_FINO * tono * revelado(y / escena.alto, azar(x, y), cuadro.progreso)
      if (radio > 0.3) {
        punto(g, x, y, radio)
      }
    }
  }
  g.globalAlpha = Math.min(1, cuadro.alfa * 1.3)
  g.fill()
  // El canto del lente: un hilo de la misma tinta, casi nada, para que se lea como un vidrio.
  g.globalAlpha = cuadro.alfa * 0.4
  g.lineWidth = 1
  g.beginPath()
  g.arc(lente.x, lente.y, lente.radio, 0, Math.PI * 2)
  g.stroke()
}

/**
 * Un cuadro del grabado: la trama gruesa en un solo trazo y, si hay catalejo, la trama fina adentro.
 */
export function pintarGrabado(g: CanvasRenderingContext2D, escena: Escena, cuadro: Cuadro): void {
  const { ancho, alto, puntos } = escena
  const lente = cuadro.lente && cuadro.lente.radio > 1 ? cuadro.lente : null
  g.clearRect(0, 0, ancho, alto)
  g.fillStyle = cuadro.color
  g.strokeStyle = cuadro.color
  g.beginPath()
  for (let i = 0; i < puntos.length; i += 4) {
    const x = puntos[i] ?? 0
    const y = puntos[i + 1] ?? 0
    if (lente && enLente(x, y, lente) >= 0.5) {
      continue
    }
    const radio =
      RADIO_MAXIMO *
      (puntos[i + 2] ?? 0) *
      revelado(y / alto, puntos[i + 3] ?? 0, cuadro.progreso) *
      oleaje(x, y, cuadro.ms)
    if (radio > 0.5) {
      punto(g, x, y, radio)
    }
  }
  g.globalAlpha = cuadro.alfa
  g.fill()
  if (lente) {
    trazarFinos(g, escena, cuadro, lente)
  }
  g.globalAlpha = 1
}
