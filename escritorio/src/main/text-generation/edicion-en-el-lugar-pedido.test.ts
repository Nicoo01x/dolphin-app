import { describe, expect, it } from 'vitest'
import {
  MAXIMO_DEL_PEDIDO_DE_EDICION,
  revisarElPedidoDeEdicion
} from './edicion-en-el-lugar-generation-request'

/**
 * El borde del IPC. Lo que llega es nuestro propio editor, pero un handler que le cree a quien
 * llama no es un handler: es un agujero. Las dos cosas que no pueden pasar son correr un agente
 * para nada y mandarle una selección que no entra en una línea de comando, porque eso no falla
 * con un error que se entienda, falla con un error del spawn.
 */

describe('revisar el pedido de edición', () => {
  it('deja pasar un pedido normal, ya recortado', () => {
    expect(revisarElPedidoDeEdicion('  que esto sea async  ')).toEqual({
      ok: true,
      prompt: 'que esto sea async'
    })
  })

  it('no manda nada cuando no hay pedido', () => {
    for (const vacio of ['', '   ', '\n\t', undefined]) {
      const revisado = revisarElPedidoDeEdicion(vacio)
      expect(revisado.ok, JSON.stringify(vacio)).toBe(false)
    }
    expect(revisarElPedidoDeEdicion('')).toEqual({
      ok: false,
      error: 'Describe the edit you want.'
    })
  })

  it('corta una selección que no entra en una línea de comando', () => {
    const justo = 'x'.repeat(MAXIMO_DEL_PEDIDO_DE_EDICION)
    expect(revisarElPedidoDeEdicion(justo).ok).toBe(true)
    expect(revisarElPedidoDeEdicion(`${justo}x`)).toEqual({
      ok: false,
      error: 'That selection is too large to edit in one request.'
    })
  })

  it('el tope se mide después de recortar, no antes', () => {
    // Un pedido con espacios de sobra no se rechaza por culpa de los espacios.
    const conAire = `   ${'x'.repeat(MAXIMO_DEL_PEDIDO_DE_EDICION)}   `
    expect(revisarElPedidoDeEdicion(conAire).ok).toBe(true)
  })
})
