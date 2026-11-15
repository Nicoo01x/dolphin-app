import { describe, expect, it } from 'vitest'
import {
  ALCANCE_DE_PREDICCION_POR_DEFECTO,
  prediccionConModeloActiva,
  prediccionLocalActiva,
  resolverAlcanceDePrediccion
} from './prediccion-de-edicion-settings'

/**
 * El interruptor del Tab predictivo tiene que apagarse de verdad.
 *
 * Nace con interruptor a pedido de Nico: hay máquinas donde cada proceso de más se siente, y lo
 * que gasta plata o memoria lo prende la persona. Estas pruebas fijan que `apagada` apague las dos
 * capas, y que un valor roto caiga en el escalón barato en vez de en el caro.
 */

describe('el alcance de la predicción', () => {
  it('sin ajuste, el escalón local: no abre procesos ni pide red', () => {
    expect(resolverAlcanceDePrediccion(undefined)).toBe('local')
    expect(ALCANCE_DE_PREDICCION_POR_DEFECTO).toBe('local')
  })

  it.each(['apagada', 'local', 'con-modelo'] as const)('respeta lo elegido: %s', (valor) => {
    expect(resolverAlcanceDePrediccion(valor)).toBe(valor)
  })

  // Un ajuste guardado por una versión futura no puede hacernos gastar cuota sin permiso.
  it('un valor que no conoce cae en el escalón barato, nunca en el caro', () => {
    expect(resolverAlcanceDePrediccion('ultra' as never)).toBe('local')
    expect(prediccionConModeloActiva('ultra' as never)).toBe(false)
  })

  it('apagada apaga las dos capas', () => {
    expect(prediccionLocalActiva('apagada')).toBe(false)
    expect(prediccionConModeloActiva('apagada')).toBe(false)
  })

  it('local trabaja sin modelo', () => {
    expect(prediccionLocalActiva('local')).toBe(true)
    expect(prediccionConModeloActiva('local')).toBe(false)
  })

  it('con-modelo incluye lo local', () => {
    expect(prediccionLocalActiva('con-modelo')).toBe(true)
    expect(prediccionConModeloActiva('con-modelo')).toBe(true)
  })
})
