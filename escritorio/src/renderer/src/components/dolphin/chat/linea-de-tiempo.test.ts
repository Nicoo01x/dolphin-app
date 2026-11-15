import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { lineaDeTiempo, TOPE } from './linea-de-tiempo'

const pedido = (id: string, texto: string, extra: Partial<NativeChatMessage> = {}) =>
  ({
    id,
    role: 'user',
    blocks: [{ type: 'text', text: texto }],
    timestamp: 1,
    source: 'transcript',
    ...extra
  }) satisfies NativeChatMessage

const respuesta = (
  id: string,
  model: string | undefined,
  blocks: NativeChatMessage['blocks'] = []
) =>
  ({
    id,
    role: 'assistant',
    blocks,
    timestamp: 2,
    source: 'transcript',
    ...(model ? { model } : {})
  }) satisfies NativeChatMessage

const escribir = (callId: string, ruta: string): NativeChatMessage['blocks'][number] => ({
  type: 'tool-call',
  name: 'Edit',
  callId,
  input: { file_path: ruta }
})

describe('la línea de tiempo de la charla', () => {
  it('anota el pedido, quién contestó, lo que escribió y lo que corrió, en orden', () => {
    const { hitos } = lineaDeTiempo([
      pedido('m1', 'arreglá el login'),
      respuesta('m2', 'claude-opus-5-5', [
        escribir('c1', 'D:/repo/src/login.ts'),
        { type: 'tool-call', name: 'Bash', callId: 'c2', input: { command: 'npm test' } }
      ])
    ])
    expect(hitos.map((h) => [h.clase, h.texto])).toEqual([
      ['pedido', 'arreglá el login'],
      ['respuesta', 'Opus 5.5'],
      ['escritura', 'login.ts'],
      ['comando', 'npm test']
    ])
  })

  it('el hito de la respuesta lleva el modelo, para que la fila le ponga su logo', () => {
    const { hitos } = lineaDeTiempo([pedido('m1', 'dale'), respuesta('m2', 'claude-haiku-4-5')])
    expect(hitos.at(-1)).toMatchObject({ clase: 'respuesta', modelo: 'claude-haiku-4-5' })
  })

  it('no repite quién contestó en cada fila del mismo turno, pero sí cuando cambia el modelo', () => {
    const { hitos } = lineaDeTiempo([
      pedido('m1', 'hacelo'),
      respuesta('m2', 'claude-opus-5-5', [{ type: 'text', text: 'voy' }]),
      respuesta('m3', 'claude-opus-5-5', [{ type: 'text', text: 'sigo' }]),
      respuesta('m4', 'claude-haiku-4-5', [{ type: 'text', text: 'reviso' }])
    ])
    expect(hitos.filter((h) => h.clase === 'respuesta').map((h) => h.texto)).toEqual([
      'Opus 5.5',
      'Haiku 4.5'
    ])
  })

  it('un pedido nuevo vuelve a anotar quién contestó, aunque sea el mismo modelo', () => {
    const { hitos } = lineaDeTiempo([
      pedido('m1', 'uno'),
      respuesta('m2', 'claude-opus-5-5'),
      pedido('m3', 'dos'),
      respuesta('m4', 'claude-opus-5-5')
    ])
    expect(hitos.map((h) => h.clase)).toEqual(['pedido', 'respuesta', 'pedido', 'respuesta'])
  })

  it('una escritura que falló no se anota: no cambió nada', () => {
    const { hitos } = lineaDeTiempo([
      respuesta('m1', 'claude-opus-5-5', [
        escribir('c1', '/repo/a.ts'),
        escribir('c2', '/repo/b.ts')
      ]),
      respuesta('m2', 'claude-opus-5-5', [
        { type: 'tool-result', callId: 'c1', output: 'no existe', isError: true }
      ])
    ])
    expect(hitos.filter((h) => h.clase === 'escritura').map((h) => h.texto)).toEqual(['b.ts'])
    expect(hitos.filter((h) => h.clase === 'error')).toHaveLength(1)
  })

  it('un mensaje de trescientas líneas es una fila de una línea', () => {
    const largo = `${'a'.repeat(500)}\nlo que sigue`
    const { hitos } = lineaDeTiempo([pedido('m1', largo)])
    expect(hitos).toHaveLength(1)
    expect(hitos[0]?.texto.length).toBeLessThanOrEqual(80)
    expect(hitos[0]?.texto.endsWith('…')).toBe(true)
  })

  it('un pedido en cola o sin mandar todavía no pasó', () => {
    const { hitos } = lineaDeTiempo([
      pedido('m1', 'esperando', { queued: true }),
      pedido('m2', 'tampoco', { unsent: true })
    ])
    expect(hitos).toEqual([])
  })

  // Why: sin tope, una charla larga dibuja una fila por cada cosa que pasó y la tarjeta no termina.
  it('se queda con los últimos hitos y dice cuántos quedaron antes', () => {
    const muchos = Array.from({ length: TOPE + 5 }, (_, i) => pedido(`m${i}`, `pedido ${i}`))
    const { hitos, antes } = lineaDeTiempo(muchos)
    expect(hitos).toHaveLength(TOPE)
    expect(antes).toBe(5)
    expect(hitos[0]?.texto).toBe('pedido 5')
  })

  it('sin nada que contar, no hay línea de tiempo', () => {
    expect(lineaDeTiempo([])).toEqual({ hitos: [], antes: 0 })
  })

  it('las claves no se mueven al cargar mensajes más viejos', () => {
    const nuevos = [pedido('m9', 'lo último'), respuesta('m10', 'claude-opus-5-5')]
    const conHistoria = lineaDeTiempo([pedido('m1', 'lo viejo'), ...nuevos])
    const soloNuevos = lineaDeTiempo(nuevos)
    expect(conHistoria.hitos.slice(-2).map((h) => h.clave)).toEqual(
      soloNuevos.hitos.map((h) => h.clave)
    )
  })

  it('un equipo de compañeros es un hito solo, con cuántos son', () => {
    const { hitos } = lineaDeTiempo([
      respuesta('m1', 'claude-opus-5-5', [
        {
          type: 'subagent-group',
          groupId: 'g1',
          agents: [
            { id: 'a', label: 'uno', state: 'working' },
            { id: 'b', label: 'dos', state: 'completed' }
          ]
        }
      ])
    ])
    expect(hitos.filter((h) => h.clase === 'companeros').map((h) => h.texto)).toEqual([
      '2 compañeros'
    ])
  })

  it('la entrada de una herramienta puede venir como texto JSON', () => {
    const { hitos } = lineaDeTiempo([
      respuesta('m1', 'claude-opus-5-5', [
        { type: 'tool-call', name: 'Write', callId: 'c1', input: '{"file_path":"/repo/x/y.md"}' }
      ])
    ])
    expect(hitos.map((h) => [h.clase, h.texto])).toEqual([
      ['respuesta', 'Opus 5.5'],
      ['escritura', 'y.md']
    ])
  })
})
