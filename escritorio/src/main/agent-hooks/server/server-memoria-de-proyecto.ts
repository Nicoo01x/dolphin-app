import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentHookSource } from '../../../shared/agent-hook-listener/transport/agent-hook-relay'
import type { AgentHookEventPayload } from '../../../shared/agent-hook-listener/listener-event'
import type { ProjectAgentMemoryOptions } from '../project-agent-memory'
import { AgentHookServerStatusHookLifecycle } from './server-status-hook-lifecycle'
import {
  ProjectAgentMemoryHookBridge,
  sendProjectMemoryHookResponse
} from './project-agent-memory-hook-bridge'

/**
 * La memoria del proyecto de Dolphin, enganchada al server de hooks de la base.
 *
 * Why una capa de la jerarquía y no código dentro del handler de la base: así el handler sólo marca
 * dónde arranca la respuesta y dónde se contesta sin estado, y la próxima puesta al día con la base
 * choca en tres líneas en vez de en todo el bloque.
 */
export abstract class AgentHookServerConMemoriaDeProyecto extends AgentHookServerStatusHookLifecycle {
  protected readonly projectAgentMemory = new ProjectAgentMemoryHookBridge()
  private readonly respuestasDeMemoria = new WeakMap<ServerResponse, Promise<string>>()

  setProjectAgentMemoryOptions(options: ProjectAgentMemoryOptions | null): void {
    this.projectAgentMemory.setOptions(options)
  }

  /** Why con el cuerpo crudo: tiene que leerlo antes de que la base normalice el alias del panel. */
  protected prepararMemoriaDeProyecto(
    res: ServerResponse,
    source: AgentHookSource,
    hookBody: unknown
  ): void {
    this.respuestasDeMemoria.set(res, this.projectAgentMemory.buildResponse(source, hookBody))
  }

  /** El camino de tmux no tiene estado que contestar: va la memoria, o un 204 si no hay. */
  protected async responderSoloMemoriaDeProyecto(res: ServerResponse): Promise<void> {
    sendProjectMemoryHookResponse(res, await this.tomarRespuestaDeMemoria(res))
  }

  protected override async respondToHook(
    req: IncomingMessage,
    res: ServerResponse,
    source: AgentHookSource,
    body: unknown,
    accepted: AgentHookEventPayload | null
  ): Promise<void> {
    const memoria = await this.tomarRespuestaDeMemoria(res)
    if (memoria) {
      sendProjectMemoryHookResponse(res, memoria)
      return
    }
    await super.respondToHook(req, res, source, body, accepted)
  }

  private async tomarRespuestaDeMemoria(res: ServerResponse): Promise<string> {
    const respuesta = this.respuestasDeMemoria.get(res)
    this.respuestasDeMemoria.delete(res)
    return (await respuesta) ?? ''
  }
}
