import { describe, expect, it } from 'vitest'
import {
  VelocityTracker,
  findFreeSpot,
  fitRect,
  inertiaStep,
  interpretWheel,
  lerpViewport,
  panelLod,
  resizeRect,
  screenToWorld,
  snapRect,
  snapResize,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
  type ViewportTransform
} from './index'

const v0: ViewportTransform = { x: 100, y: 50, zoom: 2 }

describe('transforms', () => {
  it('screen ⇄ world round-trip', () => {
    const p = { x: 333, y: -12 }
    const w = screenToWorld(v0, p)
    expect(worldToScreen(v0, w)).toEqual(p)
    expect(screenToWorld(v0, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 })
  })

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const anchor = { x: 420, y: 260 }
    const before = screenToWorld(v0, anchor)
    const v1 = zoomAt(v0, anchor, 0.75)
    const after = screenToWorld(v1, anchor)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
    expect(v1.zoom).toBe(0.75)
  })

  it('zoomAt clamps to 30%–300%', () => {
    expect(zoomAt(v0, { x: 0, y: 0 }, 50).zoom).toBe(3)
    expect(zoomAt(v0, { x: 0, y: 0 }, 0.01).zoom).toBe(0.3)
  })

  it('visibleWorldRect covers the screen', () => {
    const r = visibleWorldRect(v0, { width: 800, height: 600 })
    expect(r).toEqual({ x: -50, y: -25, width: 400, height: 300 })
  })

  it('fitRect centers bounds and never zooms past maxZoom', () => {
    const size = { width: 1000, height: 800 }
    const big = fitRect({ x: 0, y: 0, width: 2000, height: 1000 }, size, 50)
    expect(big.zoom).toBeCloseTo(900 / 2000)
    const center = screenToWorld(big, { x: 500, y: 400 })
    expect(center.x).toBeCloseTo(1000)
    expect(center.y).toBeCloseTo(500)
    expect(fitRect({ x: 0, y: 0, width: 10, height: 10 }, size).zoom).toBe(1)
  })

  it('lerpViewport hits both ends', () => {
    const size = { width: 800, height: 600 }
    const a = { x: 0, y: 0, zoom: 1 }
    const b = { x: -400, y: 200, zoom: 2 }
    const end = lerpViewport(a, b, 1, size)
    expect(end.zoom).toBeCloseTo(2)
    expect(end.x).toBeCloseTo(-400)
    expect(end.y).toBeCloseTo(200)
    expect(lerpViewport(a, b, 0, size).zoom).toBeCloseTo(1)
  })
})

describe('wheel', () => {
  it('ctrl+wheel zooms, plain wheel pans', () => {
    const zoomIn = interpretWheel({
      deltaX: 0,
      deltaY: -100,
      deltaMode: 0,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false
    })
    expect(zoomIn.kind).toBe('zoom')
    expect(zoomIn.kind === 'zoom' && zoomIn.factor).toBeGreaterThan(1)
    const pan = interpretWheel({
      deltaX: 10,
      deltaY: 20,
      deltaMode: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false
    })
    expect(pan).toEqual({ kind: 'pan', dx: -10, dy: -20 })
    const lines = interpretWheel({
      deltaX: 0,
      deltaY: 3,
      deltaMode: 1,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true
    })
    expect(lines).toEqual({ kind: 'pan', dx: -48, dy: 0 })
  })
})

describe('resize', () => {
  const start = { x: 0, y: 0, width: 400, height: 300 }
  const limits = { minWidth: 200, minHeight: 120 }
  it('east/south grow', () => {
    expect(resizeRect(start, 'se', 50, 20, limits)).toEqual({ x: 0, y: 0, width: 450, height: 320 })
  })
  it('west/north move the origin and respect min size', () => {
    expect(resizeRect(start, 'nw', 300, 300, limits)).toEqual({
      x: 200,
      y: 180,
      width: 200,
      height: 120
    })
    expect(resizeRect(start, 'w', -100, 0, limits)).toEqual({
      x: -100,
      y: 0,
      width: 500,
      height: 300
    })
  })
})

describe('snapping', () => {
  const target = { x: 500, y: 100, width: 300, height: 200 }
  it('aligns left edges within threshold and reports a guide', () => {
    const res = snapRect({ x: 494, y: 400, width: 200, height: 100 }, [target], 8)
    expect(res.dx).toBe(6)
    expect(res.dy).toBe(0)
    expect(res.guides[0]).toMatchObject({ axis: 'x', at: 500 })
  })
  it('ignores far targets', () => {
    expect(snapRect({ x: 0, y: 0, width: 10, height: 10 }, [target], 8)).toEqual({
      dx: 0,
      dy: 0,
      guides: []
    })
  })
  it('snaps resize edges', () => {
    const { rect, guides } = snapResize({ x: 0, y: 0, width: 495, height: 50 }, 'e', [target], 8)
    expect(rect.width).toBe(500)
    expect(guides).toHaveLength(1)
  })
})

describe('inertia & lod & placement', () => {
  it('velocity tracker computes px/ms and decays', () => {
    const t = new VelocityTracker()
    t.push(0, { x: 0, y: 0 })
    t.push(10, { x: 10, y: 5 })
    t.push(20, { x: 20, y: 10 })
    const v = t.velocity(20)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0.5)
    const step = inertiaStep(v, 16)
    expect(step.velocity.x).toBeLessThan(v.x)
    expect(step.dx).toBeGreaterThan(0)
  })

  it('lod hides far panels and snapshots at low zoom', () => {
    const visible = { x: 0, y: 0, width: 1000, height: 800 }
    expect(panelLod({ x: 100, y: 100, width: 100, height: 100 }, visible, 1)).toBe('live')
    expect(panelLod({ x: 100, y: 100, width: 100, height: 100 }, visible, 0.3)).toBe('snapshot')
    expect(panelLod({ x: 9000, y: 100, width: 100, height: 100 }, visible, 1)).toBe('hidden')
  })

  it('findFreeSpot avoids overlaps', () => {
    const occupied = [{ x: 0, y: 0, width: 400, height: 300 }]
    const p = findFreeSpot({ width: 400, height: 300 }, { x: 0, y: 0 }, occupied)
    const overlaps = p.x < 400 + 12 && p.x + 400 > -12 && p.y < 300 + 12 && p.y + 300 > -12
    expect(overlaps).toBe(false)
  })
})
