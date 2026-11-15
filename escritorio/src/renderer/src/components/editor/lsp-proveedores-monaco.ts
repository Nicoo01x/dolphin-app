import type * as monacoEditor from 'monaco-editor'
import type { IDisposable, editor, languages, Position } from 'monaco-editor'
import { translate } from '@/i18n/i18n'
import {
  camposDe,
  claseDeCompletadoAMonaco,
  esRangoLsp,
  hoverAMarkdown,
  posicionDesdeMonaco,
  rangoAMonaco,
  type RangoLsp
} from '../../../../shared/lsp/a-monaco'
import type { DocumentoLsp } from './lsp-documentos'
import { ayudaDeFirmas, edicionDeWorkspace, type EdicionParaMonaco } from './lsp-ediciones-monaco'
import { registrarAccionesDeCodigo } from './lsp-acciones-monaco'

type MonacoApi = typeof monacoEditor

/** Lo que los proveedores necesitan de la sesión del LSP, y nada más. */
export type ContextoDeProveedores = {
  /** El archivo que Monaco está mirando, por su modelo; undefined si no tiene LSP. */
  readonly documento: (modelo: editor.ITextModel) => DocumentoLsp | undefined
  readonly preguntar: (documento: DocumentoLsp, metodo: string, params: unknown) => Promise<unknown>
  /** El uri del modelo abierto para un uri del servidor, o null si el archivo no tiene pestaña. */
  readonly modeloDe: (uriLsp: string) => string | null
}

/** Una ubicación de LSP, en cualquiera de las tres formas en que los servidores la mandan. */
function ubicaciones(crudo: unknown): { uri: string; range: RangoLsp }[] {
  if (!crudo) {
    return []
  }
  const lista = Array.isArray(crudo) ? crudo : [crudo]
  return lista.flatMap((uno) => {
    const pieza = camposDe(uno)
    // `LocationLink` nombra el destino con otras claves; sin esto, ir a la definición no hace nada
    // contra los servidores que la usan (rust-analyzer y gopls, entre otros).
    const uri = typeof pieza.uri === 'string' ? pieza.uri : pieza.targetUri
    const range = [pieza.range, pieza.targetSelectionRange, pieza.targetRange].find(esRangoLsp)
    return typeof uri === 'string' && range ? [{ uri, range }] : []
  })
}

/**
 * Los proveedores de UN lenguaje, registrados una sola vez para todos sus archivos. Cada uno
 * resuelve el archivo desde el modelo que le pasa Monaco, que es el que se está mirando.
 */
export function registrarProveedores(
  monaco: MonacoApi,
  lenguaje: string,
  contexto: ContextoDeProveedores
): IDisposable {
  const { documento, preguntar, modeloDe } = contexto
  const posicionDe = (doc: DocumentoLsp, posicion: Position) => ({
    textDocument: { uri: doc.uri },
    position: posicionDesdeMonaco(posicion)
  })
  // Un destino abierto se nombra con el uri de SU modelo: así Monaco salta adentro del mismo
  // archivo sin ayuda y el peek de referencias tiene de dónde sacar la vista previa.
  const aMonaco = (u: { uri: string; range: RangoLsp }): languages.Location => ({
    uri: monaco.Uri.parse(modeloDe(u.uri) ?? u.uri),
    range: rangoAMonaco(u.range)
  })
  const edicionesDeMonaco = (ediciones: readonly EdicionParaMonaco[]) =>
    ediciones.map((edicion) => ({
      resource: monaco.Uri.parse(edicion.uriDelModelo),
      textEdit: { range: edicion.range, text: edicion.text },
      versionId: undefined
    }))

  const descartables: IDisposable[] = [
    monaco.languages.registerHoverProvider(lenguaje, {
      provideHover: async (modelo, posicion) => {
        const doc = documento(modelo)
        if (!doc) {
          return null
        }
        const crudo = camposDe(
          await preguntar(doc, 'textDocument/hover', posicionDe(doc, posicion))
        )
        const texto = hoverAMarkdown(crudo.contents)
        return texto
          ? {
              contents: [{ value: texto }],
              ...(esRangoLsp(crudo.range) ? { range: rangoAMonaco(crudo.range) } : {})
            }
          : null
      }
    }),
    monaco.languages.registerDefinitionProvider(lenguaje, {
      provideDefinition: async (modelo, posicion) => {
        const doc = documento(modelo)
        return doc
          ? ubicaciones(
              await preguntar(doc, 'textDocument/definition', posicionDe(doc, posicion))
            ).map(aMonaco)
          : []
      }
    }),
    monaco.languages.registerReferenceProvider(lenguaje, {
      provideReferences: async (modelo, posicion) => {
        const doc = documento(modelo)
        return doc
          ? ubicaciones(
              await preguntar(doc, 'textDocument/references', {
                ...posicionDe(doc, posicion),
                context: { includeDeclaration: true }
              })
            ).map(aMonaco)
          : []
      }
    }),
    monaco.languages.registerCompletionItemProvider(lenguaje, {
      // Why estos disparadores y no los que diga el servidor: el `initialize` del servidor los
      // declara, pero esa respuesta vive en el proceso principal. El punto y las dos barras cubren
      // casi todo, y de todas formas Monaco pide completado al escribir cualquier palabra.
      triggerCharacters: ['.', ':', '/', '>', '@', '"', "'"],
      provideCompletionItems: async (modelo, posicion) => {
        const doc = documento(modelo)
        if (!doc) {
          return { suggestions: [] }
        }
        const crudo = await preguntar(doc, 'textDocument/completion', posicionDe(doc, posicion))
        const lista = Array.isArray(crudo) ? crudo : camposDe(crudo).items
        const items: unknown[] = Array.isArray(lista) ? lista : []
        const palabra = modelo.getWordUntilPosition(posicion)
        const rango = {
          startLineNumber: posicion.lineNumber,
          endLineNumber: posicion.lineNumber,
          startColumn: palabra.startColumn,
          endColumn: palabra.endColumn
        }
        return {
          suggestions: items.map((uno) => {
            const item = camposDe(uno)
            const etiqueta = typeof item.label === 'string' ? item.label : String(item.label ?? '')
            const clase: languages.CompletionItemKind = claseDeCompletadoAMonaco(
              typeof item.kind === 'number' ? item.kind : undefined
            )
            return {
              label: etiqueta,
              kind: clase,
              insertText: typeof item.insertText === 'string' ? item.insertText : etiqueta,
              range: rango,
              ...(typeof item.detail === 'string' && item.detail ? { detail: item.detail } : {}),
              ...(item.documentation
                ? { documentation: { value: hoverAMarkdown(item.documentation) } }
                : {})
            }
          })
        }
      }
    }),
    monaco.languages.registerRenameProvider(lenguaje, {
      provideRenameEdits: async (modelo, posicion, nuevoNombre) => {
        const doc = documento(modelo)
        if (!doc) {
          return { edits: [] }
        }
        const crudo = await preguntar(doc, 'textDocument/rename', {
          ...posicionDe(doc, posicion),
          newName: nuevoNombre
        })
        const edicion = edicionDeWorkspace(crudo, modeloDe)
        if (edicion.tipo === 'no-se-puede') {
          return {
            edits: [],
            rejectReason: translate(
              'editor.lsp.renameTouchesClosedFiles',
              "Renaming this also changes files that aren't open ({{total}}). Open them and try again.",
              { total: edicion.archivos.length }
            )
          }
        }
        return { edits: edicionesDeMonaco(edicion.ediciones) }
      }
    }),
    monaco.languages.registerDocumentFormattingEditProvider(lenguaje, {
      provideDocumentFormattingEdits: async (modelo, opciones) => {
        const doc = documento(modelo)
        if (!doc) {
          return []
        }
        const crudo = await preguntar(doc, 'textDocument/formatting', {
          textDocument: { uri: doc.uri },
          options: { tabSize: opciones.tabSize, insertSpaces: opciones.insertSpaces }
        })
        return (Array.isArray(crudo) ? crudo : []).flatMap((una) => {
          const edicion = camposDe(una)
          return esRangoLsp(edicion.range) && typeof edicion.newText === 'string'
            ? [{ range: rangoAMonaco(edicion.range), text: edicion.newText }]
            : []
        })
      }
    }),
    monaco.languages.registerSignatureHelpProvider(lenguaje, {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [')'],
      provideSignatureHelp: async (modelo, posicion) => {
        const doc = documento(modelo)
        const ayuda = doc
          ? ayudaDeFirmas(
              await preguntar(doc, 'textDocument/signatureHelp', posicionDe(doc, posicion))
            )
          : null
        return ayuda ? { value: ayuda, dispose: () => {} } : null
      }
    }),
    registrarAccionesDeCodigo(monaco, lenguaje, contexto, edicionesDeMonaco)
  ]

  return {
    dispose: () => {
      for (const descartable of descartables) {
        descartable.dispose()
      }
    }
  }
}
