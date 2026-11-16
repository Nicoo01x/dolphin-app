import { luzDelVidrio, type TemaDelVidrio } from '../../../../../shared/fondo-del-chat'

/**
 * El vidrio de los paneles: la pintura achicada, desenfocada y comprimida, hecha UNA vez por imagen.
 *
 * Por qué así y no `backdrop-filter`: el desenfoque de fondo se recalcula cada vez que cambia algo
 * encima, y los paneles grandes (el editor, la terminal, el chat) cambian con cada tecla y cada
 * scroll. Esto es una imagen chica (480 px de ancho) que cada panel pinta con
 * `background-attachment: fixed`, así coincide con la pintura de atrás en toda la ventana: el
 * navegador la escala y la compone, nunca la vuelve a desenfocar. Funciona igual con «reducir
 * efectos» o los efectos de transparencia de Windows apagados.
 *
 * La curva de luz es la que deja leer sobre cualquier cuadro (`fondo-del-chat.ts`): en la versión
 * oscura las luces se aplastan hasta un techo y en la clara las sombras suben hasta un piso. Se hace
 * en luz lineal, que es donde la luminancia de WCAG se suma de verdad.
 */
export type VidrioDelPaisaje = { readonly oscuro: string; readonly claro: string }

/** Ancho de la imagen esmerilada; con la ventana a ~1600 px, el desenfoque de 8 px se ve de ~26. */
const ANCHO = 480
const DESENFOQUE_PX = 8
const SATURACION = 1.5

const vidrios = new Map<string, Promise<VidrioDelPaisaje | null>>()

/** El vidrio de una imagen, una sola vez por URL: la ventana y Ajustes la piden a la vez. */
export function vidrioDelPaisaje(url: string): Promise<VidrioDelPaisaje | null> {
  const enCache = vidrios.get(url)
  if (enCache) {
    return enCache
  }
  const pedido = hacerVidrio(url).catch(() => null)
  vidrios.set(url, pedido)
  return pedido
}

const A_LINEAL = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

function aSrgb(lineal: number): number {
  const c = lineal <= 0.0031308 ? lineal * 12.92 : 1.055 * lineal ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

/** Pasa cada punto por la curva de luz del vidrio (`luzDelVidrio`), en luz lineal. */
export function comprimir(
  datos: Uint8ClampedArray,
  tema: TemaDelVidrio
): Uint8ClampedArray<ArrayBuffer> {
  // Un búfer propio: `ImageData` no acepta uno que pueda ser compartido.
  const salida = new Uint8ClampedArray(new ArrayBuffer(datos.length))
  salida.set(datos)
  for (let i = 0; i < salida.length; i += 4) {
    const r = A_LINEAL[salida[i]!]!
    const g = A_LINEAL[salida[i + 1]!]!
    const b = A_LINEAL[salida[i + 2]!]!
    const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const objetivo = luzDelVidrio(luz, tema)
    if (tema === 'oscuro') {
      // Escalar los tres canales conserva el tono y deja la luminancia justa.
      const k = luz > 0 ? objetivo / luz : 0
      salida[i] = aSrgb(r * k)
      salida[i + 1] = aSrgb(g * k)
      salida[i + 2] = aSrgb(b * k)
    } else {
      // Mezclar con blanco en luz lineal sube la luminancia exactamente lo que falta.
      const t = luz < 1 ? Math.max(0, (objetivo - luz) / (1 - luz)) : 0
      salida[i] = aSrgb(r + (1 - r) * t)
      salida[i + 1] = aSrgb(g + (1 - g) * t)
      salida[i + 2] = aSrgb(b + (1 - b) * t)
    }
  }
  return salida
}

async function hacerVidrio(url: string): Promise<VidrioDelPaisaje | null> {
  const imagen = new Image()
  imagen.decoding = 'async'
  imagen.src = url
  await imagen.decode()
  const alto = Math.max(1, Math.round((ANCHO * imagen.naturalHeight) / imagen.naturalWidth))
  const lienzo = document.createElement('canvas')
  lienzo.width = ANCHO
  lienzo.height = alto
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return null
  }
  // Primero entera y después desenfocada encima: el borde del desenfoque mezcla con la pintura y
  // no con transparente, que dejaría un halo en el canto de la ventana.
  ctx.drawImage(imagen, 0, 0, ANCHO, alto)
  ctx.filter = `blur(${DESENFOQUE_PX}px) saturate(${SATURACION})`
  ctx.drawImage(imagen, 0, 0, ANCHO, alto)
  ctx.filter = 'none'
  const base = ctx.getImageData(0, 0, ANCHO, alto)
  const [oscuro, claro] = await Promise.all(
    (['oscuro', 'claro'] as const).map((modo) => {
      ctx.putImageData(new ImageData(comprimir(base.data, modo), ANCHO, alto), 0, 0)
      return aUrl(lienzo)
    })
  )
  return oscuro && claro ? { oscuro, claro } : null
}

function aUrl(lienzo: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolver) => {
    lienzo.toBlob((blob) => resolver(blob ? URL.createObjectURL(blob) : null), 'image/webp', 0.92)
  })
}
