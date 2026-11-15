import type * as monacoEditor from 'monaco-editor'
import type { IDisposable, editor, languages } from 'monaco-editor'
import { rangoDesdeMonaco, severidadDesdeMonaco } from '../../../../shared/lsp/a-monaco'
import { accionesAplicables, type EdicionParaMonaco } from './lsp-ediciones-monaco'
import type { ContextoDeProveedores } from './lsp-proveedores-monaco'

type MonacoApi = typeof monacoEditor

/** Una marca de Monaco devuelta al servidor como el diagnóstico que fue. */
function diagnosticoDe(marca: editor.IMarkerData): Record<string, unknown> {
  const codigo = typeof marca.code === 'string' ? marca.code : marca.code?.value
  return {
    range: rangoDesdeMonaco(marca),
    message: marca.message,
    severity: severidadDesdeMonaco(marca.severity),
    ...(marca.source ? { source: marca.source } : {}),
    // Los servidores mandan los códigos como número (TS: 2304) y los comparan como tal.
    ...(codigo === undefined ? {} : { code: /^\d+$/.test(codigo) ? Number(codigo) : codigo })
  }
}

/**
 * Los arreglos rápidos (la lamparita y Ctrl+.). Se le pasan al servidor los diagnósticos del
 * tramo, que es de lo que salen casi todos los arreglos.
 */
export function registrarAccionesDeCodigo(
  monaco: MonacoApi,
  lenguaje: string,
  contexto: ContextoDeProveedores,
  edicionesDeMonaco: (ediciones: readonly EdicionParaMonaco[]) => languages.IWorkspaceTextEdit[]
): IDisposable {
  return monaco.languages.registerCodeActionProvider(lenguaje, {
    provideCodeActions: async (modelo, rango, contextoDeMonaco) => {
      const doc = contexto.documento(modelo)
      if (!doc) {
        return { actions: [], dispose: () => {} }
      }
      const crudo = await contexto.preguntar(doc, 'textDocument/codeAction', {
        textDocument: { uri: doc.uri },
        range: rangoDesdeMonaco(rango),
        context: {
          diagnostics: contextoDeMonaco.markers.map(diagnosticoDe),
          ...(contextoDeMonaco.only ? { only: [contextoDeMonaco.only] } : {}),
          // Monaco y LSP numeran igual: 1 invocado a mano, 2 automático.
          triggerKind: contextoDeMonaco.trigger
        }
      })
      return {
        actions: accionesAplicables(crudo, contexto.modeloDe).map((accion) => ({
          title: accion.titulo,
          ...(accion.clase ? { kind: accion.clase } : {}),
          isPreferred: accion.preferida,
          edit: { edits: edicionesDeMonaco(accion.ediciones) }
        })),
        dispose: () => {}
      }
    }
  })
}
