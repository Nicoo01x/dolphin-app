import { describe, expect, it, vi } from 'vitest'
import { pedirEstudio, recibirRespuestaDeEstudio } from './dolphin-isla-estudio'

describe('pedido de estudio desde la isla', () => {
  it('responde con los datos que devuelve la ventana principal', async () => {
    const enviar = vi.fn((pedido: { id: string; paneKeys: string[] }) => {
      recibirRespuestaDeEstudio({
        id: pedido.id,
        estudio: { disponible: true, agentes: [{ paneKey: 'p', archivos: [] }] }
      })
      return true
    })
    await expect(pedirEstudio(enviar, ['p'])).resolves.toEqual({
      disponible: true,
      agentes: [{ paneKey: 'p', archivos: [] }]
    })
  })

  it('no queda colgado si no hay ventana principal', async () => {
    await expect(pedirEstudio(() => false)).resolves.toEqual({ disponible: false, agentes: [] })
  })
})
