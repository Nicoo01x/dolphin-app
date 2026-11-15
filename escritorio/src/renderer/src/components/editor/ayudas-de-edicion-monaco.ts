import type { OnMount } from '@monaco-editor/react'
import type { IDisposable, editor } from 'monaco-editor'
import type { AlcanceDePrediccion } from '../../../../shared/prediccion-de-edicion-settings'
import { splitWorktreeIdForFilesystem } from '../../../../shared/worktree/id'
import { instalarPrediccionDeEdicion } from './prediccion-de-edicion-monaco'
import { instalarEdicionEnElLugar } from './edicion-en-el-lugar-monaco'
import { instalarDestinoDeApply } from './destino-de-apply-monaco'
import { instalarSiluetaDelArchivo } from './silueta-del-archivo-monaco'
import { instalarLsp } from './lsp-en-monaco'
import { crearAbrirUbicacion } from './abrir-ubicacion-del-editor'

/**
 * Las ayudas del editor, montadas juntas: el Tab predictivo, Cmd+K, el destino del botón Apply del
 * chat, la silueta del archivo y —desde el 09/11/2026— la inteligencia de lenguaje (LSP): errores
 * subrayados, hover, ir a la definición, referencias, renombrar, completado y formatear.
 *
 * Viven acá y no en `use-monaco-editor-mount` porque las tres necesitan exactamente lo mismo —el
 * worktree donde corre el agente y la ruta del archivo— y porque el hook de montaje tiene un tope
 * de 300 líneas que ya rozaba. Que las tres se armen y se desarmen en el mismo lugar también
 * evita el error silencioso de sumar una cuarta y olvidarse de su `dispose`.
 */

type MonacoApi = Parameters<OnMount>[1]

export function instalarAyudasDeEdicion(args: {
  monaco: MonacoApi
  editor: editor.IStandaloneCodeEditor
  rutaDelArchivo: string
  /** El id del worktree, tal como lo guarda la pestaña; null cuando el archivo no cuelga de uno. */
  worktreeId: string | null
  leerAlcance: () => AlcanceDePrediccion | undefined
}): IDisposable {
  // `ForFilesystem` porque el id de un proyecto de carpeta lleva un sufijo de sesión que no es
  // parte de la ruta. Sin worktree no hay dónde correr un agente: Cmd+K lo dice con el motivo a
  // la vista y el Tab se queda en su escalón local, que no necesita ninguno.
  const leerWorktreePath = (): string | null =>
    args.worktreeId ? (splitWorktreeIdForFilesystem(args.worktreeId)?.worktreePath ?? null) : null

  const prediccion = instalarPrediccionDeEdicion({
    monaco: args.monaco,
    editor: args.editor,
    leerAlcance: args.leerAlcance,
    rutaDelArchivo: args.rutaDelArchivo,
    leerWorktreePath
  })
  const destinoDeApply = instalarDestinoDeApply(args.editor, args.rutaDelArchivo)
  const edicionEnElLugar = instalarEdicionEnElLugar({
    monaco: args.monaco,
    editor: args.editor,
    rutaDelArchivo: args.rutaDelArchivo,
    leerWorktreePath
  })
  const silueta = instalarSiluetaDelArchivo(args.editor)
  // El LSP necesita el lenguaje del modelo y la ruta del archivo, y nada más. Sin puente —en el
  // cliente web, que no tiene preload— no se monta y el editor queda como estaba.
  const lenguaje = args.editor.getModel()?.getLanguageId() ?? ''
  const puente = window.api?.lsp
  const worktreePath = leerWorktreePath()
  const lsp =
    puente && lenguaje && args.rutaDelArchivo
      ? instalarLsp({
          monaco: args.monaco as Parameters<typeof instalarLsp>[0]['monaco'],
          editor: args.editor,
          archivo: { ruta: args.rutaDelArchivo, lenguaje },
          puente,
          ...(args.worktreeId && worktreePath
            ? { abrirUbicacion: crearAbrirUbicacion(args.worktreeId, worktreePath) }
            : {})
        })
      : null

  return {
    dispose: () => {
      prediccion.dispose()
      edicionEnElLugar.dispose()
      destinoDeApply.dispose()
      silueta.dispose()
      lsp?.dispose()
    }
  }
}
