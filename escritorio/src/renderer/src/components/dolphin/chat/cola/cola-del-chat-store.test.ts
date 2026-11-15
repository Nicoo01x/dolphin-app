// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { restaurar } from './cola-del-chat-modelo'
import {
  cambiarCola,
  claveDeCola,
  entregarDeLaCola,
  leerCola,
  montarListaDeCola,
  olvidarColasParaTests,
  quitarDeLaCola,
  registrarEntrega,
  retenerEnCola,
  vaciarSiToca
} from './cola-del-chat-store'

const clave = claveDeCola('tab-1:pane-1', 'claude')
const textos = () => leerCola(clave).mensajes.map((m) => m.texto)

describe('la cola del chat sobre el CLI', () => {
  let desmontar: () => void
  let entregados: string[]
  beforeEach(() => {
    localStorage.clear()
    olvidarColasParaTests()
    desmontar = montarListaDeCola(clave)
    entregados = []
    registrarEntrega(clave, (mensaje) => {
      entregados.push(mensaje.texto)
      return true
    })
  })
  afterEach(() => desmontar())

  it('sin lista a la vista el composer no retiene: el envío va al CLI como siempre', () => {
    desmontar()
    expect(retenerEnCola(clave, { texto: 'uno', imagenes: [] }, true)).toBe(false)
    desmontar = montarListaDeCola(clave)
  })

  it('enviar ahora con varios en cola manda ESE y deja el resto en orden', () => {
    for (const texto of ['uno', 'dos', 'tres']) {
      retenerEnCola(clave, { texto, imagenes: [] }, true)
    }
    const dos = leerCola(clave).mensajes[1]!
    expect(entregarDeLaCola(clave, dos.id)).toBe(true)
    expect(entregados).toEqual(['dos'])
    expect(textos()).toEqual(['uno', 'tres'])
  })

  it('el fin del turno y enviar ahora en el mismo instante no lo mandan dos veces', () => {
    retenerEnCola(clave, { texto: 'uno', imagenes: [] }, true)
    const id = leerCola(clave).mensajes[0]!.id
    expect(vaciarSiToca(clave, { trabajando: false, puedeRecibir: true }).entrego).toBe(true)
    expect(entregarDeLaCola(clave, id)).toBe(false)
    expect(entregados).toEqual(['uno'])
  })

  it('sale de a uno: el siguiente espera a que el turno del anterior arranque y termine', () => {
    retenerEnCola(clave, { texto: 'uno', imagenes: [] }, true)
    retenerEnCola(clave, { texto: 'dos', imagenes: [] }, true)
    vaciarSiToca(clave, { trabajando: false, puedeRecibir: true })
    vaciarSiToca(clave, { trabajando: false, puedeRecibir: true })
    expect(entregados).toEqual(['uno'])
    vaciarSiToca(clave, { trabajando: true, puedeRecibir: false })
    vaciarSiToca(clave, { trabajando: false, puedeRecibir: true })
    expect(entregados).toEqual(['uno', 'dos'])
  })

  it('si la escritura no sale, el mensaje vuelve a su lugar y la cola se pausa', () => {
    registrarEntrega(clave, () => false)
    retenerEnCola(clave, { texto: 'uno', imagenes: [] }, true)
    vaciarSiToca(clave, { trabajando: false, puedeRecibir: true })
    expect(textos()).toEqual(['uno'])
    expect(leerCola(clave).pausa).toBe('noSalio')
  })

  it('borrar y deshacer', () => {
    retenerEnCola(clave, { texto: 'uno', imagenes: [] }, true)
    retenerEnCola(clave, { texto: 'dos', imagenes: [] }, true)
    const quitado = quitarDeLaCola(clave, leerCola(clave).mensajes[0]!.id)
    expect(textos()).toEqual(['dos'])
    cambiarCola(clave, (estado) => restaurar(estado, quitado!))
    expect(textos()).toEqual(['uno', 'dos'])
  })

  it('si Dolphin se cierra con mensajes en cola, vuelven en pausa y no salen solos', () => {
    retenerEnCola(clave, { texto: 'uno', imagenes: ['/tmp/a.png'] }, true)
    olvidarColasParaTests()
    const espia = vi.fn(() => true)
    registrarEntrega(clave, espia)
    const desmontarOtra = montarListaDeCola(clave)
    expect(leerCola(clave).pausa).toBe('restaurada')
    expect(leerCola(clave).mensajes[0]).toMatchObject({
      texto: 'uno',
      imagenes: ['/tmp/a.png']
    })
    vaciarSiToca(clave, { trabajando: false, puedeRecibir: true })
    expect(espia).not.toHaveBeenCalled()
    desmontarOtra()
  })
})
