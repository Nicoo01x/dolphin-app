// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { tarjetasDeLaCola } from './ColaDelChat'
import type { MensajeEnCola } from './cola-del-chat-modelo'

const mensaje = (id: string, imagenes: string[] = []): MensajeEnCola => ({
  id,
  texto: id,
  imagenes,
  encoladoEn: 0
})

describe('tarjetasDeLaCola', () => {
  it('pasa las imágenes como referencias y la pausa como hold de cola', () => {
    const [tarjeta] = tarjetasDeLaCola(
      { mensajes: [mensaje('a', ['/tmp/a.png'])], pausa: 'detenido' },
      []
    )
    expect(tarjeta).toMatchObject({
      messageId: 'a',
      hold: 'queue-paused',
      images: [{ type: 'image-ref', path: '/tmp/a.png' }]
    })
  })

  it('la recién borrada queda en su lugar mientras se cierra, fuera del arrastre', () => {
    const tarjetas = tarjetasDeLaCola({ mensajes: [mensaje('a'), mensaje('c')], pausa: null }, [
      { mensaje: mensaje('b'), indice: 1 }
    ])
    expect(tarjetas.map((t) => [t.messageId, t.hold])).toEqual([
      ['a', 'turn'],
      ['b', 'sending'],
      ['c', 'turn']
    ])
  })

  it('si se deshizo antes de que termine de cerrarse, no aparece dos veces', () => {
    const tarjetas = tarjetasDeLaCola({ mensajes: [mensaje('a'), mensaje('b')], pausa: null }, [
      { mensaje: mensaje('b'), indice: 1 }
    ])
    expect(tarjetas.map((t) => t.messageId)).toEqual(['a', 'b'])
  })
})
