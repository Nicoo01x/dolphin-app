import { clamp, type Point, type Rect } from './geometry'

// ───────────────────────── resize ─────────────────────────

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

export type SizeLimits = {
  minWidth: number
  minHeight: number
  maxWidth?: number
  maxHeight?: number
}

/** Applies a world-space pointer delta to `start` dragged by `handle`, honoring min/max sizes. */
export function resizeRect(
  start: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  limits: SizeLimits
): Rect {
  const maxW = limits.maxWidth ?? Infinity
  const maxH = limits.maxHeight ?? Infinity
  let { x, y, width, height } = start
  if (handle.includes('e')) {
    width = clamp(start.width + dx, limits.minWidth, maxW)
  }
  if (handle.includes('s')) {
    height = clamp(start.height + dy, limits.minHeight, maxH)
  }
  if (handle.includes('w')) {
    width = clamp(start.width - dx, limits.minWidth, maxW)
    x = start.x + start.width - width
  }
  if (handle.includes('n')) {
    height = clamp(start.height - dy, limits.minHeight, maxH)
    y = start.y + start.height - height
  }
  return { x, y, width, height }
}

// ───────────────────────── snapping ─────────────────────────

export type Guide = {
  axis: 'x' | 'y'
  /** World coordinate of the guide line. */
  at: number
  /** Extent of the guide along the other axis (world). */
  from: number
  to: number
}

export type SnapResult = {
  dx: number
  dy: number
  guides: Guide[]
}

/**
 * Magnetic alignment: finds the smallest adjustment (≤ threshold, world units) that aligns any
 * edge or center of `moving` with an edge or center of a target, independently per axis.
 */
export function snapRect(moving: Rect, targets: readonly Rect[], threshold: number): SnapResult {
  const mx = [moving.x, moving.x + moving.width / 2, moving.x + moving.width]
  const my = [moving.y, moving.y + moving.height / 2, moving.y + moving.height]
  let bestX: { delta: number; at: number } | null = null
  let bestY: { delta: number; at: number } | null = null
  for (const t of targets) {
    const tx = [t.x, t.x + t.width / 2, t.x + t.width]
    const ty = [t.y, t.y + t.height / 2, t.y + t.height]
    for (const a of mx) {
      for (const b of tx) {
        const d = b - a
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) {
          bestX = { delta: d, at: b }
        }
      }
    }
    for (const a of my) {
      for (const b of ty) {
        const d = b - a
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) {
          bestY = { delta: d, at: b }
        }
      }
    }
  }
  const dx = bestX?.delta ?? 0
  const dy = bestY?.delta ?? 0
  const snapped = { x: moving.x + dx, y: moving.y + dy, width: moving.width, height: moving.height }
  const guides: Guide[] = []
  if (bestX) {
    guides.push(guideFor('x', bestX.at, snapped, targets))
  }
  if (bestY) {
    guides.push(guideFor('y', bestY.at, snapped, targets))
  }
  return { dx, dy, guides }
}

function guideFor(axis: 'x' | 'y', at: number, moving: Rect, targets: readonly Rect[]): Guide {
  const eps = 0.5
  let from = axis === 'x' ? moving.y : moving.x
  let to = axis === 'x' ? moving.y + moving.height : moving.x + moving.width
  for (const t of targets) {
    const lines =
      axis === 'x'
        ? [t.x, t.x + t.width / 2, t.x + t.width]
        : [t.y, t.y + t.height / 2, t.y + t.height]
    if (!lines.some((l) => Math.abs(l - at) < eps)) {
      continue
    }
    if (axis === 'x') {
      from = Math.min(from, t.y)
      to = Math.max(to, t.y + t.height)
    } else {
      from = Math.min(from, t.x)
      to = Math.max(to, t.x + t.width)
    }
  }
  return { axis, at, from, to }
}

/** Snaps the dragged edges of a resize to nearby target edges. */
export function snapResize(
  rect: Rect,
  handle: ResizeHandle,
  targets: readonly Rect[],
  threshold: number
): { rect: Rect; guides: Guide[] } {
  const guides: Guide[] = []
  const r = { ...rect }
  const snapEdge = (value: number, candidates: number[]): number | null => {
    let best: number | null = null
    for (const c of candidates) {
      if (
        Math.abs(c - value) <= threshold &&
        (best === null || Math.abs(c - value) < Math.abs(best - value))
      ) {
        best = c
      }
    }
    return best
  }
  const xs = targets.flatMap((t) => [t.x, t.x + t.width])
  const ys = targets.flatMap((t) => [t.y, t.y + t.height])
  if (handle.includes('e')) {
    const s = snapEdge(r.x + r.width, xs)
    if (s !== null) {
      r.width = s - r.x
      guides.push({ axis: 'x', at: s, from: r.y, to: r.y + r.height })
    }
  }
  if (handle.includes('w')) {
    const s = snapEdge(r.x, xs)
    if (s !== null) {
      r.width += r.x - s
      r.x = s
      guides.push({ axis: 'x', at: s, from: r.y, to: r.y + r.height })
    }
  }
  if (handle.includes('s')) {
    const s = snapEdge(r.y + r.height, ys)
    if (s !== null) {
      r.height = s - r.y
      guides.push({ axis: 'y', at: s, from: r.x, to: r.x + r.width })
    }
  }
  if (handle.includes('n')) {
    const s = snapEdge(r.y, ys)
    if (s !== null) {
      r.height += r.y - s
      r.y = s
      guides.push({ axis: 'y', at: s, from: r.x, to: r.x + r.width })
    }
  }
  return { rect: r, guides }
}

export function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid
}

// ───────────────────────── inertia ─────────────────────────

/** Tracks recent pointer samples and yields a release velocity (px/ms). */
export class VelocityTracker {
  private samples: { t: number; x: number; y: number }[] = []
  constructor(private readonly windowMs = 80) {}

  reset(): void {
    this.samples = []
  }

  push(t: number, p: Point): void {
    this.samples.push({ t, x: p.x, y: p.y })
    const cutoff = t - this.windowMs
    while (this.samples.length > 2 && (this.samples[0]?.t ?? t) < cutoff) {
      this.samples.shift()
    }
  }

  velocity(now: number): Point {
    const first = this.samples[0]
    const last = this.samples.at(-1)
    if (!first || !last || last.t === first.t || now - last.t > 50) {
      return { x: 0, y: 0 }
    }
    const dt = last.t - first.t
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt }
  }
}

/**
 * Exponential decay used for release inertia. Returns the displacement for a frame of `dt` ms
 * and the next velocity. Friction is per-millisecond retention (0.995 ≈ glides ~300ms).
 */
export function inertiaStep(
  velocity: Point,
  dt: number,
  friction = 0.9945
): { dx: number; dy: number; velocity: Point } {
  const decay = friction ** dt
  const next = { x: velocity.x * decay, y: velocity.y * decay }
  return {
    dx: ((velocity.x + next.x) / 2) * dt,
    dy: ((velocity.y + next.y) / 2) * dt,
    velocity: next
  }
}

export function isInertiaDone(v: Point, epsilon = 0.02): boolean {
  return Math.abs(v.x) < epsilon && Math.abs(v.y) < epsilon
}

// ───────────────────────── placement ─────────────────────────

/**
 * Finds a free spot for a new panel near `preferred` (world), scanning outward in a spiral
 * so new panels never land exactly on top of existing ones.
 */
export function findFreeSpot(
  size: { width: number; height: number },
  preferred: Point,
  occupied: readonly Rect[],
  gap = 24
): Point {
  const fits = (p: Point) => {
    const r = {
      x: p.x - gap / 2,
      y: p.y - gap / 2,
      width: size.width + gap,
      height: size.height + gap
    }
    return !occupied.some(
      (o) =>
        r.x < o.x + o.width && r.x + r.width > o.x && r.y < o.y + o.height && r.y + r.height > o.y
    )
  }
  if (fits(preferred)) {
    return preferred
  }
  const step = 48
  for (let ring = 1; ring < 60; ring++) {
    for (let i = -ring; i <= ring; i++) {
      const candidates = [
        { x: preferred.x + i * step, y: preferred.y - ring * step },
        { x: preferred.x + i * step, y: preferred.y + ring * step },
        { x: preferred.x - ring * step, y: preferred.y + i * step },
        { x: preferred.x + ring * step, y: preferred.y + i * step }
      ]
      for (const c of candidates) {
        if (fits(c)) {
          return c
        }
      }
    }
  }
  return { x: preferred.x + 40, y: preferred.y + 40 }
}
