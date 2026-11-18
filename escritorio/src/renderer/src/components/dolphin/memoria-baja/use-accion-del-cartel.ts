import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { selectWslHostDistro } from '@/components/wsl-host-mark/WslHostMark'
import { buildExecutionHostRegistry } from '../../../../../shared/execution-host/execution-host-registry'
import { getHostDisplayLabelOverrides } from '../../../../../shared/host-setting-overrides'
import type { LoQueMasPesa } from '../../../../../shared/modo-poca-ram'
import {
  decidirAccionDelCartel,
  servidoresDondeCorrer,
  type AccionDelCartel
} from './servidor-para-correr'

/**
 * La acción del cartel con lo que la app sabe ahora de los servidores. Es en vivo: si mientras el
 * cartel está abierto se conecta un VPS, «Conectar un servidor» pasa a «Correr en …».
 */
export function useAccionDelCartel(masPesado: LoQueMasPesa): AccionDelCartel {
  const repos = useAppStore((s) => s.repos)
  const settings = useAppStore((s) => s.settings)
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)
  const repoActivoId = useAppStore((s) => s.activeRepoId)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)

  const servidores = useMemo(() => {
    const hosts = buildExecutionHostRegistry({
      repos,
      settings,
      hostSource: 'configured-only',
      sshTargetLabels,
      sshConnectionStates,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId,
      hostLabelOverrides: getHostDisplayLabelOverrides(settings)
    })
    return servidoresDondeCorrer(
      hosts,
      (hostId) => selectWslHostDistro({ runtimeEnvironments }, hostId) !== null
    )
  }, [
    repos,
    settings,
    sshConnectionStates,
    sshTargetLabels,
    runtimeEnvironments,
    runtimeStatusByEnvironmentId
  ])

  return useMemo(
    () => decidirAccionDelCartel({ masPesado, servidores, repos, projectHostSetups, repoActivoId }),
    [masPesado, servidores, repos, projectHostSetups, repoActivoId]
  )
}
