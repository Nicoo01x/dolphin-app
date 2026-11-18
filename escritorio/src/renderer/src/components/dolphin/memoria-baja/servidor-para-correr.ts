import type { ExecutionHostId } from '../../../../../shared/execution-host'
import type { ExecutionHostRegistryEntry } from '../../../../../shared/execution-host/execution-host-registry-entry'
import type { LoQueMasPesa } from '../../../../../shared/modo-poca-ram'
import type { ProjectHostSetup } from '../../../../../shared/project-types'
import type { Repo } from '../../../../../shared/repo-types'
import {
  getRepoWorkspaceCreationTargetHint,
  type WorkspaceCreationTargetHint
} from '@/lib/workspace/creation/project-host-workspace-target'

/**
 * A qué servidor mandar lo pesado, y qué hace el botón del cartel. Es la regla, sin la tienda ni
 * React, para poder probar cada caso.
 */

export type ServidorParaCorrer = {
  readonly id: ExecutionHostId
  readonly nombre: string
}

/**
 * Los servidores donde se puede correr algo ahora: conectados, y que no sean esta computadora.
 * Una distro de WSL cuenta como esta computadora (corre en la misma RAM), así que no sirve.
 * Una entrada fusionada en otra (el SSH de un VPS con su servidor de Dolphin) se cuenta una vez.
 */
export function servidoresDondeCorrer(
  hosts: readonly ExecutionHostRegistryEntry[],
  esWsl: (hostId: ExecutionHostId) => boolean
): ServidorParaCorrer[] {
  return hosts
    .filter(
      (host) =>
        host.kind !== 'local' &&
        !host.mergedIntoHostId &&
        host.health === 'available' &&
        !esWsl(host.id)
    )
    .map((host) => ({ id: host.id, nombre: host.label }))
}

export type AccionDelCartel =
  /** No hay ningún servidor conectado: el botón lleva a conectar uno. */
  | { readonly tipo: 'conectar' }
  | {
      readonly tipo: 'correr'
      readonly servidor: ServidorParaCorrer
      /** El espacio que más pesa, si se pudo nombrar. */
      readonly worktreeId: string | null
      readonly nombre: string | null
      /** El proyecto de donde sale el espacio nuevo en el servidor. */
      readonly repoId: string | null
      readonly objetivo: WorkspaceCreationTargetHint | null
    }

type Entrada = {
  readonly masPesado: LoQueMasPesa
  readonly servidores: readonly ServidorParaCorrer[]
  readonly repos: readonly Repo[]
  readonly projectHostSetups: readonly ProjectHostSetup[]
  /** Si no se pudo nombrar un espacio, el proyecto abierto es el punto de partida. */
  readonly repoActivoId: string | null
}

/** De qué proyecto sale el espacio nuevo, y apuntado a qué servidor. */
function objetivoEn(
  repo: Repo,
  servidores: readonly ServidorParaCorrer[],
  projectHostSetups: readonly ProjectHostSetup[]
): { servidor: ServidorParaCorrer; objetivo: WorkspaceCreationTargetHint } | null {
  const { projectId } = getRepoWorkspaceCreationTargetHint(repo, projectHostSetups)
  const instalado = (servidor: ServidorParaCorrer): ProjectHostSetup | undefined =>
    projectHostSetups.find((setup) => setup.projectId === projectId && setup.hostId === servidor.id)
  // Mejor el servidor donde el proyecto ya está: ahí se crea sin clonar nada.
  const servidor = servidores.find((candidato) => instalado(candidato)) ?? servidores[0]
  if (!servidor) {
    return null
  }
  const setup = instalado(servidor)
  return {
    servidor,
    objetivo: { projectId, hostId: servidor.id, ...(setup ? { projectHostSetupId: setup.id } : {}) }
  }
}

export function decidirAccionDelCartel({
  masPesado,
  servidores,
  repos,
  projectHostSetups,
  repoActivoId
}: Entrada): AccionDelCartel {
  const [primero] = servidores
  if (!primero) {
    return { tipo: 'conectar' }
  }
  const espacio = masPesado.tipo === 'espacio' ? masPesado : null
  const repo = repos.find((candidato) => candidato.id === (espacio?.repoId ?? repoActivoId))
  const destino = repo ? objetivoEn(repo, servidores, projectHostSetups) : null
  return {
    tipo: 'correr',
    servidor: destino?.servidor ?? primero,
    worktreeId: espacio?.worktreeId ?? null,
    nombre: espacio?.nombre ?? null,
    repoId: repo?.id ?? null,
    objetivo: destino?.objetivo ?? null
  }
}
