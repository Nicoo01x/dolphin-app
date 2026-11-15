import { afterEach, describe, expect, it } from 'vitest'
import {
  checkpointsDeLaPestana,
  recordarCheckpointDeTurno,
  recortarPedido,
  vaciarCheckpointsDelChat
} from './checkpoints-del-chat'

function checkpoint(n: number, cuando = n * 1000) {
  return { sha: `sha-${n}`, ref: `refs/dolphin/checkpoints/${n}`, cuando }
}

afterEach(vaciarCheckpointsDelChat)

describe('los checkpoints de un chat', () => {
  it('guarda el turno con su pedido', () => {
    recordarCheckpointDeTurno('tab-1', checkpoint(1), 'arreglá el login')
    expect(checkpointsDeLaPestana('tab-1')).toEqual([
      { sha: 'sha-1', cuando: 1000, pedido: 'arreglá el login' }
    ])
  })

  // El más nuevo primero: es el que se busca cuando algo acaba de salir mal.
  it('el más nuevo queda arriba', () => {
    recordarCheckpointDeTurno('tab-1', checkpoint(1), 'primero')
    recordarCheckpointDeTurno('tab-1', checkpoint(2), 'segundo')
    expect(checkpointsDeLaPestana('tab-1').map((c) => c.pedido)).toEqual(['segundo', 'primero'])
  })

  it('el mismo checkpoint no se anota dos veces', () => {
    recordarCheckpointDeTurno('tab-1', checkpoint(1), 'uno')
    recordarCheckpointDeTurno('tab-1', checkpoint(1), 'otra vez')
    expect(checkpointsDeLaPestana('tab-1')).toHaveLength(1)
  })

  // Dos chats en el mismo proyecto son dos conversaciones: mezclarlas ofrecería volver a un pedido
  // que se hizo en la otra.
  it('cada chat tiene los suyos', () => {
    recordarCheckpointDeTurno('tab-1', checkpoint(1), 'en el primero')
    recordarCheckpointDeTurno('tab-2', checkpoint(2), 'en el segundo')
    expect(checkpointsDeLaPestana('tab-1').map((c) => c.pedido)).toEqual(['en el primero'])
    expect(checkpointsDeLaPestana('tab-2').map((c) => c.pedido)).toEqual(['en el segundo'])
  })

  it('sin pestaña no hay nada', () => {
    expect(checkpointsDeLaPestana(null)).toEqual([])
    expect(checkpointsDeLaPestana('vacia')).toEqual([])
  })

  // Un techo de la lista, no de los checkpoints del repo: sin esto una sesión larga la vuelve
  // inservible.
  it('recuerda hasta 30 por chat, los más nuevos', () => {
    for (let i = 1; i <= 35; i += 1) {
      recordarCheckpointDeTurno('tab-1', checkpoint(i), `pedido ${i}`)
    }
    const lista = checkpointsDeLaPestana('tab-1')
    expect(lista).toHaveLength(30)
    expect(lista[0]?.pedido).toBe('pedido 35')
    expect(lista.at(-1)?.pedido).toBe('pedido 6')
  })
})

describe('el pedido que se muestra', () => {
  it('se achica a una línea', () => {
    expect(recortarPedido('  arreglá\n  el   login  ')).toBe('arreglá el login')
  })

  it('un pedido largo se recorta', () => {
    const recortado = recortarPedido('x'.repeat(200))
    expect(recortado).toHaveLength(90)
    expect(recortado.endsWith('…')).toBe(true)
  })

  it('uno corto queda igual', () => {
    expect(recortarPedido('dale')).toBe('dale')
  })
})
