import { describe, expect, it, vi } from 'vitest'
import { pedirEscritura, recibirRespuestaDeEscritura } from './dolphin-isla-escritura'

const escritura = { paneKey: 'p', ptyId: 'pty-1', texto: 'hola' }

describe('el pedido de escritura con respuesta', () => {
  it('termina con lo que contesta la ventana principal', async () => {
    let id = ''
    const resultado = pedirEscritura((pedido) => {
      id = pedido.id
      return true
    }, escritura)
    recibirRespuestaDeEscritura({ id, resultado: { ok: false, motivo: 'aprobacion' } })
    await expect(resultado).resolves.toEqual({ ok: false, motivo: 'aprobacion' })
  })

  it('si nadie lo puede recibir, no llegó', async () => {
    await expect(pedirEscritura(() => false, escritura)).resolves.toEqual({
      ok: false,
      motivo: 'no-llego'
    })
  })

  it('si la ventana principal no contesta a tiempo, queda sin confirmar; y una respuesta tarde no hace nada', async () => {
    vi.useFakeTimers()
    let id = ''
    const resultado = pedirEscritura(
      (pedido) => {
        id = pedido.id
        return true
      },
      escritura,
      1_000
    )
    vi.advanceTimersByTime(1_001)
    // Pudo haber llegado: no se dice «no llegó», que invita a mandarlo dos veces.
    await expect(resultado).resolves.toEqual({ ok: false, motivo: 'sin-confirmar' })
    expect(() => recibirRespuestaDeEscritura({ id, resultado: { ok: true } })).not.toThrow()
    vi.useRealTimers()
  })
})
