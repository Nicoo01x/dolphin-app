import { describe, expect, it } from 'vitest'
import { DocumentosLsp } from './lsp-documentos'
import { accionesAplicables, ayudaDeFirmas, edicionDeWorkspace } from './lsp-ediciones-monaco'
import { ajustarWorkerDeTs, type DefaultsDelWorker } from './lsp-worker-de-ts'

const RANGO = { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }

describe('DocumentosLsp', () => {
  it('encuentra el archivo por la ruta que devuelve el servidor', () => {
    const docs = new DocumentosLsp()
    docs.sumar('vscode-remote://x/D:/repo/a.ts', 'D:\\repo\\a.ts', 'typescript')
    expect(docs.deLaRuta('d:/repo/a.ts')?.uriDelModelo).toBe('vscode-remote://x/D:/repo/a.ts')
  })

  it('una caída deja sin servidor sólo a los archivos de esa raíz', () => {
    const docs = new DocumentosLsp()
    docs.sumar('m1', '/uno/a.ts', 'typescript')
    docs.sumar('m2', '/dos/b.ts', 'typescript')
    docs.marcarApertura('m1', { sinServidor: false, servidor: 'ts', raiz: '/uno' })
    docs.marcarApertura('m2', { sinServidor: false, servidor: 'ts', raiz: '/dos' })
    expect(docs.marcarCaida('ts', '/uno')).toEqual(['typescript'])
    expect(docs.delModelo('m1')?.estado).toBe('sin')
    expect(docs.hayServidorPara('typescript')).toBe(true)
  })
})

describe('el worker de TypeScript', () => {
  function defaults(): DefaultsDelWorker & { veces: number } {
    const inicial: DefaultsDelWorker['modeConfiguration'] = { hovers: true, documentSymbols: true }
    const d = {
      veces: 0,
      modeConfiguration: inicial,
      setModeConfiguration(c: DefaultsDelWorker['modeConfiguration']) {
        d.veces += 1
        d.modeConfiguration = { ...c, documentSymbols: c.documentSymbols ?? false }
      }
    }
    return d
  }

  it('apaga lo que cubre el servidor y deja el resto', () => {
    const d = defaults()
    ajustarWorkerDeTs(d, true)
    expect(d.modeConfiguration).toMatchObject({ hovers: false, completionItems: false })
    expect(d.modeConfiguration.documentSymbols).toBe(true)
  })

  it('no lo reinicia si ya estaba como tenía que estar', () => {
    const d = defaults()
    ajustarWorkerDeTs(d, false)
    expect(d.veces).toBe(0)
    ajustarWorkerDeTs(d, true)
    ajustarWorkerDeTs(d, true)
    expect(d.veces).toBe(1)
  })
})

describe('ediciones de workspace', () => {
  const abiertos = (uri: string) => (uri === 'file:///repo/a.ts' ? 'modelo-a' : null)

  it('aplica `changes` y `documentChanges` sobre los modelos abiertos', () => {
    const cambio = { range: RANGO, newText: 'otro' }
    for (const crudo of [
      { changes: { 'file:///repo/a.ts': [cambio] } },
      { documentChanges: [{ textDocument: { uri: 'file:///repo/a.ts' }, edits: [cambio] }] }
    ]) {
      const edicion = edicionDeWorkspace(crudo, abiertos)
      expect(edicion).toEqual({
        tipo: 'lista',
        ediciones: [
          {
            uriDelModelo: 'modelo-a',
            text: 'otro',
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 }
          }
        ]
      })
    }
  })

  it('si toca un archivo cerrado no aplica nada', () => {
    const edicion = edicionDeWorkspace(
      {
        changes: {
          'file:///repo/a.ts': [{ range: RANGO, newText: 'x' }],
          'file:///repo/b.ts': [{ range: RANGO, newText: 'x' }]
        }
      },
      abiertos
    )
    expect(edicion).toEqual({ tipo: 'no-se-puede', archivos: ['file:///repo/b.ts'] })
  })

  it('deja afuera los arreglos que son sólo un comando', () => {
    const acciones = accionesAplicables(
      [
        { title: 'Organize imports', command: 'x' },
        {
          title: 'Add import',
          kind: 'quickfix',
          isPreferred: true,
          edit: { changes: { 'file:///repo/a.ts': [{ range: RANGO, newText: 'import x' }] } }
        }
      ],
      abiertos
    )
    expect(acciones.map((a) => a.titulo)).toEqual(['Add import'])
    expect(acciones[0].preferida).toBe(true)
  })
})

describe('ayuda de firmas', () => {
  it('traduce firmas con parámetros por texto y por posición', () => {
    const ayuda = ayudaDeFirmas({
      signatures: [
        {
          label: 'f(a: number, b: string)',
          documentation: { kind: 'markdown', value: 'Hace f.' },
          parameters: [{ label: [2, 11] }, { label: 'b: string' }]
        }
      ],
      activeParameter: 1
    })
    expect(ayuda?.signatures[0].parameters.map((p) => p.label)).toEqual([[2, 11], 'b: string'])
    expect(ayuda?.signatures[0].documentation).toEqual({ value: 'Hace f.' })
    expect(ayuda?.activeParameter).toBe(1)
    expect(ayudaDeFirmas({ signatures: [] })).toBeNull()
  })
})
