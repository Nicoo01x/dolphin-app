import { beforeEach, describe, expect, it, vi } from 'vitest'

type Tarjeta = { paneKey: string; ptyId: string | null; bucket: string }

const m = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  popout: {
    id: 'popout',
    zoom: 1,
    getZoomFactor(): number {
      return this.zoom
    }
  },
  principal: { id: 'principal', send: vi.fn() },
  hayPrincipal: true,
  tablero: null as { cards: Tarjeta[] } | null,
  cerrarIsla: null as (() => void) | null,
  ventana: {
    getBounds: () => ({ x: 0, y: 0, width: 420, height: 56 }),
    setBounds: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    isDestroyed: () => false
  },
  bandejas: vi.fn(async () => [{ id: 'a' }])
}))

vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: vi.fn(),
    handle: (nombre: string, callback: (...args: unknown[]) => unknown) =>
      m.handlers.set(nombre, callback)
  },
  app: { whenReady: () => new Promise(() => {}), once: vi.fn(), getPath: () => 'C:/datos' },
  globalShortcut: { register: () => true, unregister: vi.fn() }
}))
vi.mock('../window/dashboard-popout-window', () => ({
  createOrFocusDashboardPopout: () => ({
    isDestroyed: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 420, height: 56 }),
    once: (_evento: string, callback: () => void) => {
      m.cerrarIsla = callback
    },
    close: vi.fn()
  }),
  closeDashboardPopout: vi.fn(),
  getDashboardPopoutWindow: () => m.ventana,
  isDashboardPopoutRenderer: (sender: unknown) => sender === m.popout
}))
vi.mock('../ipc/ui', () => ({
  isTrustedUIRenderer: (sender: unknown) => sender === m.principal,
  getTrustedUIRendererWebContents: () => (m.hayPrincipal ? m.principal : null)
}))
vi.mock('../ipc/dashboard-popout', () => ({ getLastDashboardSnapshot: () => m.tablero }))
vi.mock('../ipc/filesystem/access/filesystem-allowed-roots', () => ({ getLocalRepos: () => [] }))
vi.mock('./dolphin-isla-bandeja', () => ({ leerBandejasDeIsla: m.bandejas }))

import { alternarIsla, registrarIsla } from './dolphin-isla'
import { islaAbiertaAhora, marcarIslaAbierta } from './dolphin-isla-estado'

const invocar = (canal: string, sender: unknown, ...args: unknown[]): unknown =>
  m.handlers.get(canal)?.({ sender }, ...args)

const pedido = { paneKey: 'tab-1:pane', ptyId: 'pty-1', texto: 'dale, seguí' }

describe('la isla en main', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    marcarIslaAbierta(false)
    m.hayPrincipal = true
    m.tablero = { cards: [{ paneKey: 'tab-1:pane', ptyId: 'pty-1', bucket: 'working' }] }
    registrarIsla({} as never)
    // getDashboardPopoutWindow devuelve una ventana: la primera vez la isla está cerrada, así que
    // alternar la abre en lugar de cerrarla.
    alternarIsla({} as never)
  })

  it('lo escrito va a la ventana principal y la isla espera que conteste si llegó', async () => {
    const resultado = invocar('dolphin:isla:escribir', m.popout, pedido) as Promise<unknown>
    expect(m.principal.send).toHaveBeenCalledWith(
      'ui:dolphinIslaEscribir',
      expect.objectContaining({ ...pedido, id: expect.any(String) })
    )
    const { id } = m.principal.send.mock.calls[0][1] as { id: string }
    invocar('dolphin:isla:escrito', m.principal, { id, resultado: { ok: true } })
    await expect(resultado).resolves.toEqual({ ok: true })
  })

  it('a un agente que espera una aprobación no se le escribe: el Enter la contestaría', async () => {
    m.tablero = { cards: [{ paneKey: 'tab-1:pane', ptyId: 'pty-1', bucket: 'attention' }] }
    await expect(invocar('dolphin:isla:escribir', m.popout, pedido)).resolves.toEqual({
      ok: false,
      motivo: 'aprobacion'
    })
    expect(m.principal.send).not.toHaveBeenCalled()
  })

  it('sin ventana principal no dice «mandado»', async () => {
    m.hayPrincipal = false
    await expect(invocar('dolphin:isla:escribir', m.popout, pedido)).resolves.toEqual({
      ok: false,
      motivo: 'no-llego'
    })
  })

  it('una terminal fuera del tablero, otra ventana o la isla ya cerrada no escriben nada', async () => {
    await expect(
      invocar('dolphin:isla:escribir', m.popout, { ...pedido, ptyId: 'pty-otra' })
    ).resolves.toEqual({ ok: false, motivo: 'no-esta' })
    expect(await invocar('dolphin:isla:escribir', m.principal, pedido)).toEqual({
      ok: false,
      motivo: 'no-esta'
    })
    m.cerrarIsla?.()
    expect(islaAbiertaAhora()).toBe(false)
    // Con la isla cerrada, el pop-out normal tampoco escribe.
    expect(await invocar('dolphin:isla:escribir', m.popout, pedido)).toEqual({
      ok: false,
      motivo: 'no-esta'
    })
    expect(m.principal.send).not.toHaveBeenCalled()
  })

  it('una respuesta de otra ventana no cuenta', async () => {
    const resultado = invocar('dolphin:isla:escribir', m.popout, pedido) as Promise<unknown>
    const { id } = m.principal.send.mock.calls[0][1] as { id: string }
    invocar('dolphin:isla:escrito', m.popout, { id, resultado: { ok: true } })
    invocar('dolphin:isla:escrito', m.principal, {
      id,
      resultado: { ok: false, motivo: 'no-llego' }
    })
    await expect(resultado).resolves.toEqual({ ok: false, motivo: 'no-llego' })
  })

  it('el tamaño pedido se multiplica por el zoom y la ventana crece alrededor del mismo centro', () => {
    m.popout.zoom = 1.25
    // La ventana falsa está en x 0 con 420 de ancho: su centro es 210.
    invocar('dolphin:isla:tamano', m.popout, { ancho: 320, alto: 200 })
    expect(m.ventana.setBounds).toHaveBeenCalledWith({ x: 10, y: 0, width: 400, height: 250 })
    m.popout.zoom = 1
  })

  it('fuera de la forma el mouse pasa de largo; encima, lo toma la isla (y nadie más lo cambia)', () => {
    invocar('dolphin:isla:raton', m.popout, true)
    expect(m.ventana.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true })
    invocar('dolphin:isla:raton', m.popout, false)
    expect(m.ventana.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true })
    invocar('dolphin:isla:raton', m.principal, true)
    invocar('dolphin:isla:raton', m.popout, 'si')
    expect(m.ventana.setIgnoreMouseEvents).toHaveBeenCalledTimes(2)
  })

  it('ir y venir entre anchos pares e impares no corre la isla de lugar', () => {
    const anterior = m.ventana
    let limites = { x: 0, y: 0, width: 420, height: 56 }
    m.ventana = {
      getBounds: () => limites,
      setBounds: vi.fn((nuevos: typeof limites) => {
        limites = nuevos
      }),
      setIgnoreMouseEvents: vi.fn(),
      isDestroyed: () => false
    }
    for (let vez = 0; vez < 100; vez++) {
      invocar('dolphin:isla:tamano', m.popout, { ancho: 319, alto: 78 })
      invocar('dolphin:isla:tamano', m.popout, { ancho: 412, alto: 155 })
    }
    // Centro 210: con 412 de ancho, x es 4 (sin el arreglo, 104: medio píxel por cada vuelta).
    expect(limites.x).toBe(4)
    m.ventana = anterior
  })

  it('si Windows la movió (otra pantalla, otra escala), el centro sale de donde quedó', () => {
    const anterior = m.ventana
    let limites = { x: 0, y: 0, width: 420, height: 56 }
    m.ventana = {
      getBounds: () => limites,
      setBounds: vi.fn((nuevos: typeof limites) => {
        limites = nuevos
      }),
      setIgnoreMouseEvents: vi.fn(),
      isDestroyed: () => false
    }
    invocar('dolphin:isla:tamano', m.popout, { ancho: 412, alto: 155 })
    expect(limites.x).toBe(4)
    // Windows la corre 500 px: el centro pasa a 710, no vuelve al 210 de antes.
    limites = { ...limites, x: limites.x + 500 }
    invocar('dolphin:isla:tamano', m.popout, { ancho: 319, alto: 78 })
    expect(limites.x).toBe(Math.round(710 - 319 / 2))
    m.ventana = anterior
  })

  it('la bandeja solo se la da a la isla abierta', async () => {
    expect(await invocar('dolphin:isla:bandeja', m.popout)).toEqual([{ id: 'a' }])
    m.cerrarIsla?.()
    expect(await invocar('dolphin:isla:bandeja', m.popout)).toEqual([])
    expect(m.bandejas).toHaveBeenCalledTimes(1)
  })
})
