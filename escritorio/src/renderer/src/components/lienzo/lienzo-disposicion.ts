import { clampZoom, type Rect, type ViewportTransform } from './canvas'
import type { PanelDelLienzo, TipoDePanel } from './lienzo-paneles'

/**
 * Cómo quedó el lienzo la última vez: qué ventanas, dónde, de qué tamaño y con cuánto zoom.
 *
 * Un escritorio que se reacomoda solo cada vez que entrás no es un escritorio. Va en el
 * `localStorage` del renderer —no en el estado compartido de la app— porque es exactamente eso:
 * cómo dejaste las ventanas en ESTA máquina.
 *
 * Todo lo que vuelve del disco se valida campo por campo: un `localStorage` a medio escribir, de
 * una versión vieja o tocado a mano no puede dejar la vista en blanco. Si algo no cierra, se
 * descarta y el lienzo abre como la primera vez.
 */

const DONDE = 'dolphin.lienzo.disposicion'
const TIPOS: readonly TipoDePanel[] = ['consola', 'terminal', 'archivos', 'navegador']

export type Disposicion = {
  readonly paneles: readonly PanelDelLienzo[]
  readonly vista: ViewportTransform
}

const numero = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isFinite(valor)

function leerRect(crudo: unknown): Rect | null {
  if (typeof crudo !== 'object' || crudo === null) {
    return null
  }
  const r = crudo as Record<string, unknown>
  if (!numero(r.x) || !numero(r.y) || !numero(r.width) || !numero(r.height)) {
    return null
  }
  // Una ventana de 0 px no se puede ni agarrar para agrandarla.
  if (r.width < 80 || r.height < 60) {
    return null
  }
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

function leerPanel(crudo: unknown): PanelDelLienzo | null {
  if (typeof crudo !== 'object' || crudo === null) {
    return null
  }
  const p = crudo as Record<string, unknown>
  if (typeof p.id !== 'string' || typeof p.titulo !== 'string') {
    return null
  }
  if (!TIPOS.includes(p.tipo as TipoDePanel)) {
    return null
  }
  const rect = leerRect(p.rect)
  if (!rect) {
    return null
  }
  return {
    id: p.id,
    tipo: p.tipo as TipoDePanel,
    titulo: p.titulo,
    ...(typeof p.subtitulo === 'string' ? { subtitulo: p.subtitulo } : {}),
    rect
  }
}

export function leerDisposicion(
  almacen: Pick<Storage, 'getItem'> = localStorage
): Disposicion | null {
  let crudo: string | null
  try {
    crudo = almacen.getItem(DONDE)
  } catch {
    // Sin localStorage (ventana sin almacenamiento): se abre como la primera vez.
    return null
  }
  if (!crudo) {
    return null
  }
  let leido: unknown
  try {
    leido = JSON.parse(crudo)
  } catch {
    return null
  }
  if (typeof leido !== 'object' || leido === null) {
    return null
  }
  const { paneles, vista } = leido as { paneles?: unknown; vista?: unknown }
  if (!Array.isArray(paneles)) {
    return null
  }
  const buenos = paneles.map(leerPanel).filter((p): p is PanelDelLienzo => p !== null)
  // Guardado vacío: que abra con las de siempre en vez de un plano pelado.
  if (buenos.length === 0) {
    return null
  }
  const v = (typeof vista === 'object' && vista !== null ? vista : {}) as Record<string, unknown>
  return {
    paneles: buenos,
    vista: {
      zoom: numero(v.zoom) ? clampZoom(v.zoom) : 1,
      x: numero(v.x) ? v.x : 0,
      y: numero(v.y) ? v.y : 0
    }
  }
}

export function guardarDisposicion(
  disposicion: Disposicion,
  almacen: Pick<Storage, 'setItem'> = localStorage
): void {
  try {
    almacen.setItem(DONDE, JSON.stringify(disposicion))
  } catch {
    // Disco lleno o almacenamiento bloqueado: no vale romper el lienzo por no poder recordarlo.
  }
}
