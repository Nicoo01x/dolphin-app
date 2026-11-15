import { luminanciaDe, type Luminancia } from './trama'

let cargando: Promise<Luminancia> | null = null

/**
 * La lámina de la franja (la gran ola de Hokusai, ver assets/laminas/FUENTE.md), como luminancia. Se pide después del primer pintado (no entra en el arranque) y
 * viaja como data URL en su propio pedazo del bundle: leer los píxeles de una imagen servida por
 * `file://` puede ensuciar el canvas y negar `getImageData`; una data URL nunca.
 */
export function cargarLamina(): Promise<Luminancia> {
  cargando ??= (async () => {
    const { default: src } = await import('../../../assets/laminas/gran-ola.webp?inline')
    const imagen = new Image()
    imagen.decoding = 'async'
    imagen.src = src
    await imagen.decode()
    const lienzo = document.createElement('canvas')
    lienzo.width = imagen.naturalWidth
    lienzo.height = imagen.naturalHeight
    const g = lienzo.getContext('2d', { willReadFrequently: true })
    if (!g) {
      throw new Error('sin canvas 2d')
    }
    g.drawImage(imagen, 0, 0)
    const { data } = g.getImageData(0, 0, lienzo.width, lienzo.height)
    return luminanciaDe(data, lienzo.width, lienzo.height)
  })()
  // Si falló, la próxima vez se intenta de nuevo en vez de quedarse con el error para siempre.
  cargando.catch(() => {
    cargando = null
  })
  return cargando
}
