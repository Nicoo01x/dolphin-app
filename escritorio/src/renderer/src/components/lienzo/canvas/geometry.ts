/**
 * Canvas geometry. World coordinates are the persistent space panels live in; screen
 * coordinates are CSS pixels relative to the canvas element.
 *
 *   screen = world * zoom + offset        world = (screen - offset) / zoom
 *
 * Everything here is pure and allocation-light so it can run inside pointer handlers.
 */

export type Point = {
  x: number
  y: number
}

export type Size = {
  width: number
  height: number
}

export type Rect = {} & Point & Size

export type ViewportTransform = {
  /** Screen-space offset of the world origin. */
  x: number
  y: number
  zoom: number
}

export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 3

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v

export function clampZoom(zoom: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
  return clamp(zoom, min, max)
}

export function screenToWorld(v: ViewportTransform, p: Point): Point {
  return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom }
}

export function worldToScreen(v: ViewportTransform, p: Point): Point {
  return { x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y }
}

export function worldRectToScreen(v: ViewportTransform, r: Rect): Rect {
  return {
    x: r.x * v.zoom + v.x,
    y: r.y * v.zoom + v.y,
    width: r.width * v.zoom,
    height: r.height * v.zoom
  }
}

/** Zooms so the world point under `anchor` (screen) stays under it. */
export function zoomAt(
  v: ViewportTransform,
  anchor: Point,
  nextZoom: number,
  min = ZOOM_MIN,
  max = ZOOM_MAX
): ViewportTransform {
  const zoom = clampZoom(nextZoom, min, max)
  const world = screenToWorld(v, anchor)
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom }
}

export function panBy(v: ViewportTransform, dx: number, dy: number): ViewportTransform {
  return { zoom: v.zoom, x: v.x + dx, y: v.y + dy }
}

/** Visible world rectangle for a canvas of `size` screen pixels. */
export function visibleWorldRect(v: ViewportTransform, size: Size): Rect {
  return {
    x: -v.x / v.zoom,
    y: -v.y / v.zoom,
    width: size.width / v.zoom,
    height: size.height / v.zoom
  }
}

export function rectUnion(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) {
    return null
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    if (r.x < minX) {
      minX = r.x
    }
    if (r.y < minY) {
      minY = r.y
    }
    if (r.x + r.width > maxX) {
      maxX = r.x + r.width
    }
    if (r.y + r.height > maxY) {
      maxY = r.y + r.height
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function inflateRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 }
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  }
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/**
 * Viewport that fits `bounds` inside a canvas of `size`, leaving `padding` screen px,
 * never zooming in past `maxZoom` (fitting one small panel should not blow it up to 300%).
 */
/** Screen-space room taken by floating chrome (rails, bands, docks) on each side. */
export type Insets = {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * The part of the window a panel can occupy without hiding under the chrome. The chrome floats
 * over an infinite canvas, so nothing stops a panel from sitting beneath a rail — which is how a
 * terminal ends up with its first characters covered. Everything that aims the camera aims at
 * this rect instead of at the window, so what the camera promises to show is actually visible.
 */
export function safeRect(size: Size, insets: Insets = NO_INSETS): Rect {
  return {
    x: insets.left,
    y: insets.top,
    width: Math.max(1, size.width - insets.left - insets.right),
    height: Math.max(1, size.height - insets.top - insets.bottom)
  }
}

export function fitRect(
  bounds: Rect,
  size: Size,
  padding = 64,
  maxZoom = 1,
  minZoom = ZOOM_MIN,
  insets: Insets = NO_INSETS
): ViewportTransform {
  const safe = safeRect(size, insets)
  const availW = Math.max(1, safe.width - padding * 2)
  const availH = Math.max(1, safe.height - padding * 2)
  const zoom = clamp(
    Math.min(availW / Math.max(1, bounds.width), availH / Math.max(1, bounds.height)),
    minZoom,
    maxZoom
  )
  const c = rectCenter(bounds)
  const target = rectCenter(safe)
  return { zoom, x: target.x - c.x * zoom, y: target.y - c.y * zoom }
}

/** Viewport that centers `point` (world) in the safe area at the given zoom. */
export function centerOn(
  point: Point,
  size: Size,
  zoom: number,
  insets: Insets = NO_INSETS
): ViewportTransform {
  const target = rectCenter(safeRect(size, insets))
  return { zoom, x: target.x - point.x * zoom, y: target.y - point.y * zoom }
}

/** Linear interpolation between two viewports, interpolating zoom logarithmically for a natural feel. */
export function lerpViewport(
  a: ViewportTransform,
  b: ViewportTransform,
  t: number,
  size: Size
): ViewportTransform {
  // Interpolate the world point at the screen center and the zoom in log space.
  const ca = screenToWorld(a, { x: size.width / 2, y: size.height / 2 })
  const cb = screenToWorld(b, { x: size.width / 2, y: size.height / 2 })
  const zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t)
  const cx = ca.x + (cb.x - ca.x) * t
  const cy = ca.y + (cb.y - ca.y) * t
  return centerOn({ x: cx, y: cy }, size, zoom)
}

// ───────────────────────── wheel normalization ─────────────────────────

export type WheelLike = {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number }

const LINE_HEIGHT = 16

/**
 * Interprets a wheel event the way design tools do:
 *  - ctrl/cmd + wheel, and trackpad pinch (Chromium reports pinch as ctrl+wheel) → zoom
 *  - trackpad two-finger scroll → pan in both axes
 *  - mouse wheel → pan vertically (shift → horizontally)
 */
export function interpretWheel(e: WheelLike): WheelIntent {
  const scale = e.deltaMode === 1 ? LINE_HEIGHT : e.deltaMode === 2 ? 600 : 1
  const dx = e.deltaX * scale
  const dy = e.deltaY * scale
  if (e.ctrlKey || e.metaKey) {
    // Pinch deltas are small and continuous; mouse wheel notches are ~100px.
    const clamped = clamp(dy, -60, 60)
    return { kind: 'zoom', factor: Math.exp(-clamped * 0.0085) }
  }
  if (e.shiftKey && dx === 0) {
    return { kind: 'pan', dx: -dy, dy: 0 }
  }
  return { kind: 'pan', dx: -dx, dy: -dy }
}

// ───────────────────────── level of detail ─────────────────────────

export type PanelLod = 'live' | 'snapshot' | 'hidden'

/** Below this zoom heavy panels (terminal, editor, browser) render a lightweight snapshot. */
export const SNAPSHOT_ZOOM = 0.42

export function panelLod(panel: Rect, visible: Rect, zoom: number, margin = 400): PanelLod {
  const area = inflateRect(visible, margin / Math.max(zoom, 0.05))
  if (!rectsIntersect(panel, area)) {
    return 'hidden'
  }
  if (zoom < SNAPSHOT_ZOOM) {
    return 'snapshot'
  }
  return 'live'
}
