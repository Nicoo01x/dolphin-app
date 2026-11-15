import { describe, expect, it } from 'vitest'
import {
  decidirBucle,
  huellaDeHerramienta,
  type EntradaDeBucle,
  type MemoriaDeBucles
} from './dolphin-bucles'

const base = (overrides: Partial<EntradaDeBucle> = {}): EntradaDeBucle => ({
  paneKey: 'tab:pane',
  hookEventName: 'PreToolUse',
  toolName: 'Bash',
  toolInput: { command: 'pnpm test' },
  ...overrides
})

function pasar(eventos: EntradaDeBucle[]): ReturnType<typeof decidirBucle>[] {
  let memoria: MemoriaDeBucles = new Map()
  const decisiones = eventos.map((evento) => {
    const decision = decidirBucle(memoria, evento)
    memoria = decision.memoria
    return decision
  })
  return decisiones
}

describe('detector de bucles de Dolphin', () => {
  it('avisa una sola vez por una secuencia repetida', () => {
    const decisiones = pasar([1, 2, 3, 4].map(() => base({ toolInput: { command: 'pnpm lint' } })))
    expect(decisiones.filter((decision) => decision.aviso)).toHaveLength(1)
    expect(decisiones[2]?.aviso).toMatchObject({ repeticiones: 3, motivo: 'herramienta-repetida' })
  })

  it('no avisa una secuencia variada', () => {
    const decisiones = pasar(
      ['pnpm lint', 'pnpm test', 'pnpm typecheck', 'pnpm format'].map((command) =>
        base({ toolInput: { command } })
      )
    )
    expect(decisiones.every((decision) => decision.aviso === null)).toBe(true)
  })

  it('cuenta cuatro apariciones en una ventana aunque no sean consecutivas', () => {
    const decisiones = pasar(
      ['a', 'b', 'a', 'c', 'a', 'd', 'a'].map((path) =>
        base({ toolName: 'Read', toolInput: { path } })
      )
    )
    expect(decisiones[6]?.aviso).toMatchObject({ motivo: 'herramienta-repetida' })
  })

  it('ordena las claves antes de formar la huella', () => {
    expect(huellaDeHerramienta('Read', { b: 2, a: 1 })).toBe(
      huellaDeHerramienta('Read', { a: 1, b: 2 })
    )
  })

  it('vuelve a avisar cuando la racha se corta', () => {
    const decisiones = pasar([
      ...Array.from({ length: 3 }, () => base({ toolName: 'Read', toolInput: { path: 'a.ts' } })),
      base({ toolName: 'Write', toolInput: { path: 'a.ts' } }),
      ...Array.from({ length: 3 }, () => base({ toolName: 'Read', toolInput: { path: 'a.ts' } }))
    ])
    expect(decisiones.filter((decision) => decision.aviso)).toHaveLength(2)
  })

  it('avisa cuatro tests fallando si no cambió ningún archivo', () => {
    const decisiones = pasar(
      Array.from({ length: 4 }, () =>
        base({
          hookEventName: 'PostToolUseFailure',
          exitCode: 1,
          toolInput: { command: 'npm test' }
        })
      )
    )
    expect(decisiones[3]?.aviso).toMatchObject({ motivo: 'tests-fallando', repeticiones: 4 })
  })

  it('reconoce una salida fallida de PostToolUse', () => {
    const decisiones = pasar(
      Array.from({ length: 4 }, () =>
        base({ hookEventName: 'PostToolUse', output: { exitCode: 1 } })
      )
    )
    expect(decisiones[3]?.aviso).toMatchObject({ motivo: 'tests-fallando', repeticiones: 4 })
  })

  it('no avisa tests fallando si hubo un cambio de archivo en el medio', () => {
    const decisiones = pasar([
      ...Array.from({ length: 2 }, () =>
        base({
          hookEventName: 'PostToolUseFailure',
          exitCode: 1,
          toolInput: { command: 'npm test' }
        })
      ),
      base({ toolName: 'Edit', toolInput: { file_path: 'src/a.ts' } }),
      ...Array.from({ length: 2 }, () =>
        base({
          hookEventName: 'PostToolUseFailure',
          exitCode: 1,
          toolInput: { command: 'npm test' }
        })
      )
    ])
    expect(decisiones.every((decision) => decision.aviso === null)).toBe(true)
  })

  it('usa seis repeticiones cuando no llegaron argumentos', () => {
    const decisiones = pasar(
      Array.from({ length: 6 }, () => base({ toolInput: undefined, toolName: 'Read' }))
    )
    expect(decisiones.filter((decision) => decision.aviso)).toHaveLength(1)
    expect(decisiones[5]?.aviso?.repeticiones).toBe(6)
  })
})
