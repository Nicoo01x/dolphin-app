import { describe, expect, it } from 'vitest'
import { agentesDeEstudio, registrarEstudio } from './studio-estudio'
import type { StudioSessionSummary } from './studio-summary'

describe('el estudio de la isla', () => {
  it('resume por agente, ordena lo último y limita a ocho archivos', () => {
    registrarEstudio(
      'pane-1',
      {
        files: Array.from({ length: 9 }, (_, index) => `src/${index}.ts`),
        fileActions: {},
        commands: 0,
        reads: 0
      } satisfies StudioSessionSummary
    )
    expect(agentesDeEstudio(['pane-1'])).toEqual([
      {
        paneKey: 'pane-1',
        archivos: Array.from({ length: 8 }, (_, index) => ({
          ruta: `src/${8 - index}.ts`,
          accion: 'editado'
        }))
      }
    ])
  })
})
