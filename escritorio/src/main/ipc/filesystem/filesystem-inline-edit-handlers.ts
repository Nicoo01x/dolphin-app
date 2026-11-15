import { ipcMain } from 'electron'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { ResolvedSourceControlAiGenerationParams } from '../../../shared/source-control/ai/source-control-ai-operation-resolution'
import { getCommitMessageModelDiscoveryHostKey } from '../../../shared/source-control/ai/generation/commit-message-host-key'
import { resolveCommitMessageSettings } from '../../text-generation/commit-message-text-generation'
import {
  generarEdicionEnElLugarConElAgente,
  revisarElPedidoDeEdicion
} from '../../text-generation/edicion-en-el-lugar-generation-request'
import type { GenerateEdicionEnElLugarResult } from '../../text-generation/source-control-text-generation-types'
import { prepareLocalCommitMessageAgentEnv } from '../../text-generation/commit-message-agent-environment'
import { SSH_HOST_NOT_SERVED_MESSAGE } from '../../providers/ssh-host-not-served-error'
import { resolveRegisteredWorktreePath } from '../worktrees/removal/registered-worktree-roots-cache'
import { ajustesDelProyectoPara } from '../../editorconfig/leer-editorconfig'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import {
  getLocalAgentRuntimeTarget,
  getLocalTextGenerationTarget,
  getRepoForSourceControlAi
} from './filesystem-source-control-ai-targets'

/**
 * Editar con IA adentro del editor (Cmd+K), del lado del proceso principal.
 *
 * Va por la misma vía que el mensaje de commit —misma resolución de ajustes, mismo lanzador de
 * agente, mismo destino local— porque es la misma operación: pedirle texto a un agente y esperar.
 * Lo único propio es cómo se lee la respuesta, y eso vive en `generarEdicionEnElLugar`.
 *
 * Usa la configuración de `commitMessage` a propósito, en vez de una propia. Un ajuste nuevo
 * significa otro agente, otro modelo y otro nivel de razonamiento que elegir, y hoy no hay nada
 * que justifique esa segunda pantalla: quien configuró su IA de texto quiere esa misma IA acá. El
 * día que haga falta separarlas, lo que cambia es la operación que se le pasa al resolvedor.
 */
export function registerFilesystemInlineEditHandlers(context: FilesystemHandlerContext): void {
  const { store, commitMessageAgentEnv } = context

  /**
   * La sangría que declara el proyecto para ese archivo.
   *
   * Vive con el otro handler del editor porque comparte la validación del worktree, que es lo
   * único delicado: la ruta llega del renderer y no se cree, se resuelve contra los worktrees
   * registrados antes de leer una sola carpeta.
   */
  ipcMain.handle(
    'editor:resolveEditorConfig',
    async (_event, args: { worktreePath: string; filePath: string }) => {
      try {
        const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
        return await ajustesDelProyectoPara(args.filePath, worktreePath)
      } catch {
        // Que no se pueda resolver no es un error para quien abre un archivo: usa sus ajustes.
        return {}
      }
    }
  )
  ipcMain.handle(
    'editor:generateInlineEdit',
    async (
      _event,
      args: {
        worktreePath: string
        /** El pedido completo, ya armado por el editor: es el único que sabe qué hay alrededor. */
        prompt: string
        // Clave de meta sin recortar; se valida contra worktreePath antes de leer nada.
        worktreeId?: string
        repoId?: string
        connectionId?: string
        sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
        sourceControlAi?: GlobalSettings['sourceControlAi']
        agentCmdOverrides?: GlobalSettings['agentCmdOverrides']
      }
    ): Promise<GenerateEdicionEnElLugarResult> => {
      const pedido = revisarElPedidoDeEdicion(args.prompt)
      if (!pedido.ok) {
        return { success: false, error: pedido.error }
      }
      if (args.connectionId) {
        return { success: false, error: SSH_HOST_NOT_SERVED_MESSAGE }
      }
      const baseSettings = store.getSettings()
      const requestSettings = {
        ...baseSettings,
        ...(args.sourceControlAi !== undefined ? { sourceControlAi: args.sourceControlAi } : {}),
        ...(args.agentCmdOverrides !== undefined
          ? { agentCmdOverrides: args.agentCmdOverrides }
          : {})
      }
      const resolvedSettings = args.sourceControlAiResolvedParams
        ? { ok: true as const, params: args.sourceControlAiResolvedParams }
        : resolveCommitMessageSettings(
            requestSettings,
            getCommitMessageModelDiscoveryHostKey(args.connectionId ?? null),
            'commitMessage',
            await getRepoForSourceControlAi(store, args)
          )
      if (!resolvedSettings.ok) {
        return { success: false, error: resolvedSettings.error }
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      const localEnv = await prepareLocalCommitMessageAgentEnv(
        resolvedSettings.params.agentId,
        commitMessageAgentEnv,
        getLocalAgentRuntimeTarget(gitOptions)
      )
      if (!localEnv.ok) {
        return { success: false, error: localEnv.error }
      }
      return generarEdicionEnElLugarConElAgente({
        prompt: pedido.prompt,
        params: resolvedSettings.params,
        target: getLocalTextGenerationTarget(worktreePath, gitOptions, localEnv.env)
      })
    }
  )
}
