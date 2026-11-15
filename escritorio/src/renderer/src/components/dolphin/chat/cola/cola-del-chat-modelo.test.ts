import { describe, expect, it } from 'vitest'
import {
  COLA_VACIA,
  ESPERA_MAXIMA_DEL_TURNO_MS,
  TOPE_DE_LA_COLA,
  decidirVaciado,
  encolar,
  mover,
  pausar,
  reanudar,
  restaurar,
  retieneElEnvio,
  tomar,
  type EstadoDeCola,
  type MensajeEnCola
} from './cola-del-chat-modelo'

const mensaje = (id: string): MensajeEnCola => ({
  id,
  texto: `texto ${id}`,
  imagenes: [],
  encoladoEn: 1
})
const cola = (...ids: string[]): EstadoDeCola => ({
  mensajes: ids.map(mensaje),
  pausa: null
})
const ids = (estado: EstadoDeCola) => estado.mensajes.map((m) => m.id)

describe('retieneElEnvio', () => {
  it('retiene mientras el agente trabaja y deja pasar con el agente quieto y la cola vacía', () => {
    expect(retieneElEnvio({ estado: COLA_VACIA, espera: null, trabajando: true })).toBe(true)
    expect(retieneElEnvio({ estado: COLA_VACIA, espera: null, trabajando: false })).toBe(false)
  })

  it('pone atrás lo nuevo si la cola avanza, aunque el agente esté quieto', () => {
    expect(retieneElEnvio({ estado: cola('a'), espera: null, trabajando: false })).toBe(true)
  })

  it('con la cola en pausa, lo nuevo sale directo: es una orden nueva después de un Stop', () => {
    expect(
      retieneElEnvio({
        estado: pausar(cola('a'), 'detenido'),
        espera: null,
        trabajando: false
      })
    ).toBe(false)
  })

  it('retiene mientras espera que arranque el turno de lo que acaba de salir', () => {
    expect(
      retieneElEnvio({
        estado: COLA_VACIA,
        espera: { desde: 0, vioTrabajar: false },
        trabajando: false
      })
    ).toBe(true)
  })

  it('no retiene más allá del tope', () => {
    const llena = cola(...Array.from({ length: TOPE_DE_LA_COLA }, (_, i) => `m${i}`))
    expect(retieneElEnvio({ estado: llena, espera: null, trabajando: true })).toBe(false)
  })
})

describe('enviar ahora (tomar)', () => {
  it('con uno solo en cola, lo saca y la cola queda vacía y sin pausa', () => {
    const { estado, tomado } = tomar(pausar(cola('a'), 'restaurada'), 'a')
    expect(tomado?.mensaje.id).toBe('a')
    expect(estado).toEqual(COLA_VACIA)
  })

  it('con varios, saca ESE y el resto sigue en su orden', () => {
    const { estado, tomado } = tomar(cola('a', 'b', 'c', 'd'), 'c')
    expect(tomado).toEqual({ mensaje: mensaje('c'), indice: 2 })
    expect(ids(estado)).toEqual(['a', 'b', 'd'])
  })

  it('la segunda vez no encuentra nada: el fin del turno y el botón no mandan dos veces', () => {
    const primera = tomar(cola('a', 'b'), 'a')
    const segunda = tomar(primera.estado, 'a')
    expect(segunda.tomado).toBeNull()
    expect(ids(segunda.estado)).toEqual(['b'])
  })
})

describe('borrar y deshacer', () => {
  it('deshacer lo devuelve a su lugar', () => {
    const { estado, tomado } = tomar(cola('a', 'b', 'c'), 'b')
    expect(ids(restaurar(estado, tomado!))).toEqual(['a', 'b', 'c'])
  })

  it('si la cola se achicó mientras tanto, vuelve al final sin romper nada', () => {
    const { tomado } = tomar(cola('a', 'b', 'c'), 'c')
    expect(ids(restaurar(cola('x'), tomado!))).toEqual(['x', 'c'])
  })

  it('deshacer dos veces no lo duplica', () => {
    const { estado, tomado } = tomar(cola('a', 'b'), 'a')
    const una = restaurar(estado, tomado!)
    expect(restaurar(una, tomado!)).toBe(una)
  })
})

describe('mover', () => {
  it('antes y después de un vecino', () => {
    expect(ids(mover(cola('a', 'b', 'c'), 'c', { antesDe: 'a' }))).toEqual(['c', 'a', 'b'])
    expect(ids(mover(cola('a', 'b', 'c'), 'a', { despuesDe: 'c' }))).toEqual(['b', 'c', 'a'])
  })
})

describe('decidirVaciado', () => {
  const quieto = { trabajando: false, puedeRecibir: true, ahora: 1_000 }

  it('con el turno terminado sale el primero', () => {
    expect(decidirVaciado({ ...quieto, estado: cola('a', 'b'), espera: null }).sale).toBe('a')
  })

  it('no sale nada mientras trabaja, con una pregunta abierta, en pausa o vacía', () => {
    expect(
      decidirVaciado({
        ...quieto,
        trabajando: true,
        estado: cola('a'),
        espera: null
      }).sale
    ).toBeNull()
    expect(
      decidirVaciado({
        ...quieto,
        puedeRecibir: false,
        estado: cola('a'),
        espera: null
      }).sale
    ).toBeNull()
    expect(
      decidirVaciado({
        ...quieto,
        estado: pausar(cola('a'), 'detenido'),
        espera: null
      }).sale
    ).toBeNull()
    expect(decidirVaciado({ ...quieto, estado: COLA_VACIA, espera: null }).sale).toBeNull()
    expect(
      decidirVaciado({
        ...quieto,
        estado: reanudar(pausar(cola('a'), 'detenido')),
        espera: null
      }).sale
    ).toBe('a')
  })

  it('después de entregar espera a ver el turno arrancar y terminar antes de mandar el siguiente', () => {
    const estado = cola('b')
    let espera = decidirVaciado({
      ...quieto,
      estado,
      espera: { desde: 1_000, vioTrabajar: false }
    })
    expect(espera).toEqual({
      espera: { desde: 1_000, vioTrabajar: false },
      sale: null
    })
    espera = decidirVaciado({
      ...quieto,
      trabajando: true,
      estado,
      espera: espera.espera
    })
    expect(espera).toEqual({
      espera: { desde: 1_000, vioTrabajar: true },
      sale: null
    })
    expect(decidirVaciado({ ...quieto, estado, espera: espera.espera })).toEqual({
      espera: null,
      sale: 'b'
    })
  })

  it('si nunca lo vio trabajar, deja de esperar después del tope', () => {
    const espera = { desde: 0, vioTrabajar: false }
    expect(
      decidirVaciado({
        ...quieto,
        ahora: ESPERA_MAXIMA_DEL_TURNO_MS - 1,
        estado: cola('b'),
        espera
      }).sale
    ).toBeNull()
    expect(
      decidirVaciado({
        ...quieto,
        ahora: ESPERA_MAXIMA_DEL_TURNO_MS,
        estado: cola('b'),
        espera
      }).sale
    ).toBe('b')
  })

  it('encolar suma al final', () => {
    expect(ids(encolar(cola('a'), mensaje('b')))).toEqual(['a', 'b'])
  })
})
