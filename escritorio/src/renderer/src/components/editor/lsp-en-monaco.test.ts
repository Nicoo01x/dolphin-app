import { afterEach, describe, expect, it, vi } from 'vitest'
import { uriDeArchivo } from '../../../../shared/lsp/a-monaco'

vi.mock('@/i18n/i18n', () => ({ translate: (_clave: string, texto: string) => texto }))

import { instalarLsp, type PuenteLsp } from './lsp-en-monaco'

type Proveedor = Record<string, (...args: unknown[]) => unknown>

/** Un Monaco de mentira: guarda los proveedores y el opener para poder llamarlos a mano. */
function monacoFalso() {
  const proveedores: { tipo: string; lenguaje: string; proveedor: Proveedor; vivo: boolean }[] = []
  const registrar = (tipo: string) => (lenguaje: string, proveedor: Proveedor) => {
    const fila = { tipo, lenguaje, proveedor, vivo: true }
    proveedores.push(fila)
    return { dispose: () => void (fila.vivo = false) }
  }
  const openers: { openCodeEditor: (...args: unknown[]) => unknown }[] = []
  const modos: Record<string, boolean>[] = []
  const tsDefaults = {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Monaco y el editor de mentira tienen sólo lo que el LSP usa.
    modeConfiguration: { hovers: true, completionItems: true } as Record<string, boolean>,
    setModeConfiguration: (c: Record<string, boolean>) => {
      tsDefaults.modeConfiguration = c
      modos.push(c)
    }
  }
  const uri = (texto: string) => ({ toString: () => texto, scheme: texto.split(':')[0] })
  const monaco = {
    Uri: { parse: uri },
    languages: new Proxy(
      {},
      { get: (_objetivo, nombre: string) => registrar(nombre.replace(/^register|Provider$/g, '')) }
    ),
    editor: {
      getModel: () => null,
      setModelMarkers: vi.fn(),
      registerEditorOpener: (opener: { openCodeEditor: (...args: unknown[]) => unknown }) => {
        openers.push(opener)
        return { dispose: () => {} }
      }
    },
    typescript: { typescriptDefaults: tsDefaults }
  }
  const vivos = (tipo: string) => proveedores.filter((p) => p.tipo === tipo && p.vivo)
  return { monaco, vivos, openers, modos, uri }
}

function editorFalso(id: string, uriDelModelo: string) {
  const modelo = {
    uri: { toString: () => uriDelModelo },
    getValue: () => 'const a = 1',
    onDidChangeContent: () => ({ dispose: () => {} }),
    isDisposed: () => false
  }
  return { modelo, editor: { getId: () => id, getModel: () => modelo } }
}

function puenteFalso(
  respuestaDeAbrir: unknown = { sinServidor: false, servidor: 'ts', raiz: 'D:/repo' }
) {
  const preguntas: { ruta: string; metodo: string; params: unknown }[] = []
  const puente: PuenteLsp = {
    abrir: vi.fn(() => Promise.resolve(respuestaDeAbrir)),
    cambio: vi.fn(),
    cerrar: vi.fn(),
    preguntar: vi.fn((pedido) => {
      preguntas.push(pedido)
      return Promise.resolve({ resultado: null })
    }),
    alDiagnosticar: () => () => {}
  }
  return { puente, preguntas }
}

const descartar: { dispose: () => void }[] = []
afterEach(() => {
  for (const d of descartar.splice(0)) {
    d.dispose()
  }
})

function montar(
  falso: ReturnType<typeof monacoFalso>,
  puente: PuenteLsp,
  id: string,
  ruta: string,
  abrirUbicacion?: (ruta: string, linea: number, columna: number) => boolean
) {
  const { editor, modelo } = editorFalso(id, `vscode-remote://dueno/${ruta.replace(/\\/g, '/')}`)
  const lsp = instalarLsp({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Monaco y el editor de mentira tienen sólo lo que el LSP usa.
    monaco: falso.monaco as unknown as Parameters<typeof instalarLsp>[0]['monaco'],
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Monaco y el editor de mentira tienen sólo lo que el LSP usa.
    editor: editor as unknown as Parameters<typeof instalarLsp>[0]['editor'],
    archivo: { ruta, lenguaje: 'typescript' },
    puente,
    ...(abrirUbicacion ? { abrirUbicacion } : {})
  })
  descartar.push(lsp)
  return { lsp, modelo }
}

describe('el LSP en Monaco', () => {
  it('registra UN proveedor por lenguaje y pregunta por el archivo que se está mirando', async () => {
    const falso = monacoFalso()
    const { puente, preguntas } = puenteFalso()
    montar(falso, puente, 'e1', 'D:\\repo\\a.ts')
    const b = montar(falso, puente, 'e2', 'D:\\repo\\mi carpeta\\b.ts')
    expect(falso.vivos('Hover')).toHaveLength(1)

    const hover = falso.vivos('Hover')[0].proveedor
    await hover.provideHover(b.modelo, { lineNumber: 1, column: 7 })

    expect(preguntas).toHaveLength(1)
    expect(preguntas[0].ruta).toBe('D:\\repo\\mi carpeta\\b.ts')
    // El mismo uri con el que main abrió el archivo (`uriDeArchivo`), no uno armado a mano.
    expect(preguntas[0].params).toMatchObject({
      textDocument: { uri: uriDeArchivo('D:\\repo\\mi carpeta\\b.ts') },
      position: { line: 0, character: 6 }
    })
  })

  it('dos vistas del mismo archivo abren y cierran una sola vez', () => {
    const falso = monacoFalso()
    const { puente } = puenteFalso()
    const uno = montar(falso, puente, 'e1', '/repo/a.ts')
    const dos = montar(falso, puente, 'e2', '/repo/a.ts')
    expect(puente.abrir).toHaveBeenCalledTimes(1)
    uno.lsp.dispose()
    expect(puente.cerrar).not.toHaveBeenCalled()
    dos.lsp.dispose()
    expect(puente.cerrar).toHaveBeenCalledTimes(1)
    expect(falso.vivos('Hover')).toHaveLength(0)
  })

  it('con servidor se calla el worker de TypeScript, y vuelve al cerrar el último archivo', async () => {
    const falso = monacoFalso()
    const { puente } = puenteFalso()
    const a = montar(falso, puente, 'e1', '/repo/a.ts')
    await vi.waitFor(() => expect(falso.modos.at(-1)?.hovers).toBe(false))
    expect(falso.modos.at(-1)?.completionItems).toBe(false)
    a.lsp.dispose()
    expect(falso.modos.at(-1)?.hovers).toBe(true)
  })

  it('si el servidor no arrancó, el worker sigue contestando', async () => {
    const falso = monacoFalso()
    const { puente } = puenteFalso({ sinServidor: true, motivo: 'no-instalado' })
    montar(falso, puente, 'e1', '/repo/a.ts')
    await Promise.resolve()
    await Promise.resolve()
    expect(falso.modos).toHaveLength(0)
  })

  it('ir a la definición en otro archivo abre esa pestaña en el lugar', () => {
    const falso = monacoFalso()
    const { puente } = puenteFalso()
    const abrir = vi.fn(() => true)
    const { editor } = editorFalso('e1', 'vscode-remote://dueno/D:/repo/a.ts')
    montar(falso, puente, 'e1', 'D:\\repo\\a.ts', abrir)
    const abrio = falso.openers[0].openCodeEditor(editor, falso.uri('file:///d%3A/repo/otro.ts'), {
      startLineNumber: 12,
      startColumn: 3,
      endLineNumber: 12,
      endColumn: 9
    })
    expect(abrio).toBe(true)
    expect(abrir).toHaveBeenCalledWith('d:/repo/otro.ts', 12, 3)
  })
})
