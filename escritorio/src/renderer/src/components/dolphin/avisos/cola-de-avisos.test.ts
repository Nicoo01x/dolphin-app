import { describe, expect, it } from 'vitest'
import {
  CALMA_ANTES_DE_UNA_PREFERENCIA_MS,
  COLA_VACIA,
  RESPIRO_ENTRE_AVISOS_MS,
  encolar,
  mostrar,
  ordenarAvisos,
  quitar,
  turnoDeLaCola,
  type Aviso,
  type EstadoDeLaCola,
  type Importancia
} from './cola-de-avisos'

const aviso = (id: string, importancia: Importancia): Aviso => ({
  id,
  importancia,
  titulo: () => id,
  contenido: () => null
})

/** Lo que llega en una instalación nueva, en el orden en que lo levanta la app. */
function colaDeUnaInstalacionNueva(): EstadoDeLaCola {
  return [
    aviso('texto-del-terminal', 'preferencia'),
    aviso('tema-de-claude', 'preferencia'),
    aviso('skills', 'accion'),
    aviso('interfaz-de-chat', 'uso')
  ].reduce(encolar, COLA_VACIA)
}

function idDelTurno(estado: EstadoDeLaCola, ahora: number): string | null {
  const turno = turnoDeLaCola(estado, ahora)
  return turno.tipo === 'mostrar' ? turno.aviso.id : null
}

describe('la cola de avisos', () => {
  it('lo urgente (queda poca RAM) pasa adelante de todo, aunque llegue último', () => {
    const estado = encolar(colaDeUnaInstalacionNueva(), aviso('memoria-baja', 'urgente'))
    expect(idDelTurno(estado, 0)).toBe('memoria-baja')
  })

  it('lo urgente no espera a la bienvenida ni a otro modal; lo demás, sí', () => {
    const comun = colaDeUnaInstalacionNueva()
    expect(turnoDeLaCola(comun, 0, true)).toEqual({ tipo: 'nada' })
    const conUrgente = encolar(comun, aviso('memoria-baja', 'urgente'))
    expect(turnoDeLaCola(conUrgente, 0, true)).toMatchObject({
      tipo: 'mostrar',
      aviso: { id: 'memoria-baja' }
    })
  })

  it('lo urgente sale encima del aviso que está a la vista, sin sacarlo', () => {
    let estado = mostrar(colaDeUnaInstalacionNueva(), 'skills')
    estado = encolar(estado, aviso('memoria-baja', 'urgente'))
    // Ni el respiro lo frena: recién se cerró uno y sale igual.
    estado = { ...estado, ultimoCierre: 0 }
    expect(idDelTurno(estado, 1)).toBe('memoria-baja')
    estado = mostrar(estado, 'memoria-baja')
    expect(estado).toMatchObject({ visible: 'skills', urgente: 'memoria-baja' })
    // Mientras está arriba no entra nada más, y al cerrarlo lo de abajo sigue como estaba.
    expect(turnoDeLaCola(estado, 10_000)).toEqual({ tipo: 'nada' })
    estado = quitar(estado, 'memoria-baja', 2_000)
    expect(estado).toMatchObject({ visible: 'skills', urgente: null })
  })

  it('con lo urgente solo en pantalla, el siguiente espera a que se cierre y a su respiro', () => {
    let estado = encolar(colaDeUnaInstalacionNueva(), aviso('memoria-baja', 'urgente'))
    estado = mostrar(estado, 'memoria-baja')
    expect(mostrar(estado, 'interfaz-de-chat')).toBe(estado)
    expect(turnoDeLaCola(estado, 0)).toEqual({ tipo: 'nada' })
    estado = quitar(estado, 'memoria-baja', 1_000)
    expect(turnoDeLaCola(estado, 1_000)).toEqual({ tipo: 'esperar', ms: RESPIRO_ENTRE_AVISOS_MS })
    expect(idDelTurno(estado, 1_000 + RESPIRO_ENTRE_AVISOS_MS)).toBe('interfaz-de-chat')
  })

  it('ordena por importancia: uso, después acción, después preferencias por llegada', () => {
    expect(ordenarAvisos(colaDeUnaInstalacionNueva().avisos).map((a) => a.id)).toEqual([
      'interfaz-de-chat',
      'skills',
      'texto-del-terminal',
      'tema-de-claude'
    ])
  })

  it('muestra de a uno: con uno a la vista no entra otro, aunque sea más importante', () => {
    let estado = colaDeUnaInstalacionNueva()
    estado = mostrar(estado, 'skills')
    expect(turnoDeLaCola(estado, 0)).toEqual({ tipo: 'nada' })
    expect(mostrar(estado, 'interfaz-de-chat')).toBe(estado)
    expect(estado.visible).toBe('skills')
  })

  it('al cerrarse uno entra el siguiente, después de un respiro', () => {
    let estado = colaDeUnaInstalacionNueva()
    expect(idDelTurno(estado, 0)).toBe('interfaz-de-chat')
    estado = quitar(mostrar(estado, 'interfaz-de-chat'), 'interfaz-de-chat', 1_000)
    expect(turnoDeLaCola(estado, 1_000)).toEqual({ tipo: 'esperar', ms: RESPIRO_ENTRE_AVISOS_MS })
    expect(idDelTurno(estado, 1_000 + RESPIRO_ENTRE_AVISOS_MS)).toBe('skills')
  })

  it('una preferencia espera dos minutos de calma y entra una sola por sesión', () => {
    let estado = colaDeUnaInstalacionNueva()
    estado = quitar(mostrar(estado, 'interfaz-de-chat'), 'interfaz-de-chat', 0)
    estado = quitar(mostrar(estado, 'skills'), 'skills', 5_000)
    // En el primer minuto de una instalación nueva no aparece ninguna preferencia.
    expect(idDelTurno(estado, 60_000)).toBeNull()
    expect(idDelTurno(estado, 5_000 + CALMA_ANTES_DE_UNA_PREFERENCIA_MS)).toBe('texto-del-terminal')
    estado = mostrar(estado, 'texto-del-terminal')
    estado = quitar(estado, 'texto-del-terminal', 200_000)
    // La otra queda para la próxima vez que se abra Dolphin.
    expect(turnoDeLaCola(estado, 10_000_000)).toEqual({ tipo: 'nada' })
    expect(estado.avisos.map((a) => a.id)).toEqual(['tema-de-claude'])
  })

  it('una preferencia sola, sin nada antes en la sesión, no espera', () => {
    const estado = encolar(COLA_VACIA, aviso('tema-de-claude', 'preferencia'))
    expect(idDelTurno(estado, 0)).toBe('tema-de-claude')
  })

  it('el mismo id reemplaza el contenido sin sumar una ventana ni perder su lugar', () => {
    let estado = colaDeUnaInstalacionNueva()
    const titulo = (): string => 'otro'
    const nuevo = { ...aviso('texto-del-terminal', 'preferencia'), titulo }
    estado = encolar(estado, nuevo)
    expect(estado.avisos).toHaveLength(4)
    expect(ordenarAvisos(estado.avisos)[2]).toMatchObject({
      id: 'texto-del-terminal',
      titulo
    })
  })

  it('retirar uno que todavía no se vio no cuenta como cierre', () => {
    const estado = quitar(colaDeUnaInstalacionNueva(), 'skills', 9_000)
    expect(estado.ultimoCierre).toBeNull()
    expect(idDelTurno(estado, 0)).toBe('interfaz-de-chat')
  })
})
