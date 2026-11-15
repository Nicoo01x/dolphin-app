import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Solo se reemplaza lo de más abajo, la escritura a la terminal: el envío del chat (limpiar la
// línea, el texto, el Enter aparte, la fila por terminal) corre de verdad.
const m = vi.hoisted(() => ({
  estado: {
    agentStatusByPaneKey: {} as Record<string, { state: string; interactivePrompt?: string }>
  },
  oyentes: new Set<() => void>(),
  limpiezas: [] as string[],
  escrituras: [] as string[],
  opciones: [] as unknown[],
  acepta: (_datos: string): Promise<boolean> => Promise.resolve(true)
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => m.estado,
    subscribe: (oyente: () => void) => {
      m.oyentes.add(oyente)
      return () => m.oyentes.delete(oyente)
    }
  }
}))
vi.mock('@/runtime/hosted-terminals/input/runtime-terminal-input-send', () => ({
  sendRuntimePtyInput: (_ptyId: string, datos: string) => {
    m.limpiezas.push(datos)
    return true
  }
}))
vi.mock('@/runtime/hosted-terminals/input/runtime-terminal-verified-input', () => ({
  sendRuntimePtyInputVerified: (
    _ptyId: string,
    datos: string,
    _modo: string,
    opciones?: unknown
  ) => {
    m.escrituras.push(datos)
    m.opciones.push(opciones)
    return m.acepta(datos)
  }
}))

import { resetNativeChatPtySendQueuesForTests } from '../../native-chat/session/terminal/send/native-chat-pty-send-queue'
import { sendNativeChatMessage } from '../../native-chat/session/terminal/send/native-chat-runtime-send'
import { NATIVE_CHAT_SUBMIT } from '../../../../../shared/native-chat/input/native-chat-paste-bytes'
import { TOPE_DE_ENVIO_MS, escribirAlAgente } from './use-escritura-desde-isla'

const pedido = { id: 'x', paneKey: 'p', ptyId: 'pty-1', texto: 'dale, seguí' }
const avisar = (): void => {
  for (const oyente of m.oyentes) {
    oyente()
  }
}

describe('la ventana principal tipea lo de la isla con el envío del chat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetNativeChatPtySendQueuesForTests()
    m.oyentes.clear()
    m.limpiezas = []
    m.escrituras = []
    m.opciones = []
    m.acepta = () => Promise.resolve(true)
    m.estado.agentStatusByPaneKey = { p: { state: 'working' } }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('limpia la línea, pega el texto, manda el Enter aparte y dice que llegó', async () => {
    const resultado = escribirAlAgente(pedido)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(resultado).resolves.toEqual({ ok: true })
    expect(m.limpiezas.length).toBeGreaterThan(0)
    expect(m.escrituras).toEqual(['dale, seguí', NATIVE_CHAT_SUBMIT])
    // Cada escritura pide que la terminal confirme: sin eso, una terminal local que rechaza
    // igual daba «Se lo mandé».
    expect(m.opciones).toEqual([{ requireWriteSettlement: true }, { requireWriteSettlement: true }])
    expect(m.oyentes.size).toBe(0)
  })

  it('si vence esperando su turno detrás de otro envío, no se escribió nada: no llegó', async () => {
    m.acepta = () => new Promise<boolean>(() => {})
    // Un envío del chat a la misma terminal queda colgado y ocupa la fila (ese no tiene tope).
    sendNativeChatMessage('pty-1', 'el de antes', { onDeliverySettled: () => {} })
    await vi.advanceTimersByTimeAsync(10)
    const resultado = escribirAlAgente(pedido)

    await vi.advanceTimersByTimeAsync(TOPE_DE_ENVIO_MS + 10)

    await expect(resultado).resolves.toEqual({ ok: false, motivo: 'no-llego' })
    expect(m.escrituras).not.toContain('dale, seguí')
  })

  it('con una aprobación o una pregunta a la vista no escribe nada', async () => {
    m.estado.agentStatusByPaneKey = { p: { state: 'working', interactivePrompt: '{"q":1}' } }
    await expect(escribirAlAgente(pedido)).resolves.toEqual({ ok: false, motivo: 'aprobacion' })
    m.estado.agentStatusByPaneKey = { p: { state: 'waiting' } }
    await expect(escribirAlAgente(pedido)).resolves.toEqual({ ok: false, motivo: 'aprobacion' })
    expect(m.escrituras).toEqual([])
  })

  it('si la aprobación aparece después del texto, el Enter no sale ni se tipea nada debajo', async () => {
    const resultado = escribirAlAgente(pedido)
    await vi.advanceTimersByTimeAsync(50)
    expect(m.escrituras).toEqual(['dale, seguí'])
    const limpiezasAntes = m.limpiezas.length

    m.estado.agentStatusByPaneKey = { p: { state: 'blocked' } }
    avisar()
    await vi.advanceTimersByTimeAsync(2_000)

    await expect(resultado).resolves.toEqual({ ok: false, motivo: 'aprobacion' })
    expect(m.escrituras).toEqual(['dale, seguí'])
    expect(m.limpiezas.length).toBe(limpiezasAntes)
  })

  it('si la terminal rechaza el texto, no llegó y no se manda el Enter', async () => {
    m.acepta = () => Promise.resolve(false)
    const resultado = escribirAlAgente(pedido)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(resultado).resolves.toEqual({ ok: false, motivo: 'no-llego' })
    expect(m.escrituras).toEqual(['dale, seguí'])
  })

  it('si la terminal nunca contesta, queda sin confirmar y se corta', async () => {
    m.acepta = () => new Promise<boolean>(() => {})
    const resultado = escribirAlAgente(pedido)
    await vi.advanceTimersByTimeAsync(TOPE_DE_ENVIO_MS + 10)
    await expect(resultado).resolves.toEqual({ ok: false, motivo: 'sin-confirmar' })
    expect(m.escrituras).not.toContain(NATIVE_CHAT_SUBMIT)
  })
})
