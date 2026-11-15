import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { comandoCorto, loQueHizo, marcaDeTiempo, rutaCorta } from './pasos'

const INICIO = Date.UTC(2026, 10, 14, 15, 0, 0)

function mensaje(
  id: string,
  role: NativeChatMessage['role'],
  segundo: number | null,
  blocks: NativeChatMessage['blocks']
): NativeChatMessage {
  return {
    id,
    role,
    blocks,
    timestamp: segundo === null ? null : INICIO + segundo * 1000,
    source: 'transcript'
  }
}

const pedido = mensaje('u1', 'user', 0, [
  { type: 'text', text: 'El test de precios falla en Safari' }
])

const leer = mensaje('a1', 'assistant', 4, [
  {
    type: 'tool-call',
    name: 'Read',
    callId: 'c1',
    input: { file_path: '/home/ana-dev/tienda-web/src/pricing/plan-picker.tsx' }
  },
  { type: 'tool-result', callId: 'c1', output: '...' }
])

const correrMal = mensaje('a2', 'assistant', 9, [
  { type: 'tool-call', name: 'Bash', callId: 'c2', input: { command: 'npm test -- pricing' } },
  { type: 'tool-result', callId: 'c2', output: ' Tests  1 failed | 7 passed (8)', isError: true }
])

const editar = mensaje('a3', 'assistant', 31, [
  {
    type: 'tool-call',
    name: 'Edit',
    callId: 'c3',
    input: {
      file_path: '/home/ana-dev/tienda-web/src/pricing/price-list.ts',
      old_string: '  const month = new Date(now.getFullYear(), now.getMonth(), 1)',
      new_string: '  const month = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))'
    }
  },
  { type: 'tool-result', callId: 'c3', output: 'ok' }
])

const correrBien = mensaje('a4', 'assistant', 38, [
  { type: 'tool-call', name: 'Bash', callId: 'c4', input: { command: 'npm test -- pricing' } },
  { type: 'tool-result', callId: 'c4', output: ' Tests  8 passed (8)' }
])

describe('loQueHizo', () => {
  it('arma una frase por paso, con su segundo, a partir de la herramienta y su argumento', () => {
    const { pasos, archivos, segundos } = loQueHizo([pedido, leer, correrMal, editar, correrBien])
    expect(
      pasos.map((paso) => [paso.segundo, paso.accion, paso.objeto, paso.detalle, paso.resultado])
    ).toEqual([
      [4, 'leyo', 'src/pricing/plan-picker.tsx', null, null],
      [9, 'corrio', 'npm test -- pricing', { tipo: 'fallaron', n: 1 }, 'fallo'],
      [31, 'edito', 'src/pricing/price-list.ts', { tipo: 'lineas', mas: 1, menos: 1 }, null],
      [38, 'corrio', 'npm test -- pricing', { tipo: 'pasaron', n: 8 }, 'arreglo']
    ])
    expect(archivos).toBe(1)
    expect(segundos).toBe(38)
  })

  it('la edición lleva su diff para mostrarlo incrustado', () => {
    const edicion = loQueHizo([pedido, editar]).pasos[0]
    expect(edicion?.diff?.lines.some((linea) => linea.kind === 'add')).toBe(true)
  })

  it('lo que no alcanza para una frase no aparece', () => {
    const raro = mensaje('a5', 'assistant', 12, [
      // Una lectura sin ruta, un comando sin texto, una edición rechazada y una lista de tareas.
      { type: 'tool-call', name: 'Read', callId: 'x1', input: {} },
      { type: 'tool-result', callId: 'x1', output: '' },
      { type: 'tool-call', name: 'Bash', callId: 'x2', input: {} },
      { type: 'tool-result', callId: 'x2', output: '' },
      {
        type: 'tool-call',
        name: 'Edit',
        callId: 'x3',
        input: { file_path: 'a.ts', old_string: 'a', new_string: 'b' }
      },
      { type: 'tool-result', callId: 'x3', output: 'old_string not found', isError: true },
      { type: 'tool-call', name: 'TodoWrite', callId: 'x4', input: { todos: [] } }
    ])
    expect(loQueHizo([pedido, raro]).pasos).toEqual([])
  })

  it('sin la hora del mensaje, el paso queda sin marca de tiempo', () => {
    const sinHora = mensaje('a6', 'assistant', null, leer.blocks)
    expect(loQueHizo([pedido, sinHora]).pasos[0]?.segundo).toBeNull()
  })

  it('un comando que pasa sin que nada haya fallado antes no es un arreglo', () => {
    expect(loQueHizo([pedido, correrBien]).pasos[0]?.resultado).toBeNull()
  })
})

describe('formatos', () => {
  it('marcaDeTiempo', () => {
    expect(marcaDeTiempo(4)).toBe('0:04')
    expect(marcaDeTiempo(72)).toBe('1:12')
  })

  it('rutaCorta y comandoCorto', () => {
    expect(rutaCorta('C:\\Users\\ana-dev\\tienda-web\\src\\pricing\\plan.ts')).toBe(
      'src/pricing/plan.ts'
    )
    expect(comandoCorto('cd /repo && npm test\nmás')).toBe('npm test')
  })
})
