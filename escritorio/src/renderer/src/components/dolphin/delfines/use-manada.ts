import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { installWindowVisibilityInterval } from '@/lib/window-activity/window-visibility-interval'
import { selectWslHostDistro } from '@/components/wsl-host-mark/WslHostMark'
import { buildExecutionHostRegistry } from '../../../../../shared/execution-host/execution-host-registry'
import { getHostDisplayLabelOverrides } from '../../../../../shared/host-setting-overrides'
import type { ManadaLeida, ServidorParaDelfines } from '../../../../../shared/delfines-types'
import { servidoresDondeCorrer } from '../memoria-baja/servidor-para-correr'

/** Cada cuánto se vuelve a mirar: un bot cambia de estado en minutos, no en segundos. */
const CADA_MS = 15_000

export type EstadoDeLaManada =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; manada: Extract<ManadaLeida, { ok: true }> }
  | { tipo: 'error'; code: Extract<ManadaLeida, { ok: false }>['code']; detail?: string }

/** La manada, refrescada mientras la ventana está a la vista y más espaciada sin foco. */
export function useManada(): { estado: EstadoDeLaManada; recargar: () => Promise<void> } {
  const [estado, setEstado] = useState<EstadoDeLaManada>({ tipo: 'cargando' })
  const recargar = useCallback(async () => {
    const api = window.api?.delfines
    if (!api) {
      setEstado({ tipo: 'error', code: 'sin-nucleo' })
      return
    }
    try {
      const leida = await api.listar()
      setEstado(
        leida.ok
          ? { tipo: 'listo', manada: leida }
          : { tipo: 'error', code: leida.code, ...(leida.detail ? { detail: leida.detail } : {}) }
      )
    } catch (error) {
      setEstado({
        tipo: 'error',
        code: 'nucleo',
        detail: error instanceof Error ? error.message : String(error)
      })
    }
  }, [])
  useEffect(
    () =>
      installWindowVisibilityInterval({
        run: () => void recargar(),
        intervalMs: CADA_MS,
        slowWhileUnfocused: true
      }),
    [recargar]
  )
  return { estado, recargar }
}

/**
 * Los servidores donde se puede llevar un bot: conectados por SSH y que no sean esta computadora
 * (una distro de WSL no cuenta). La regla es la del cartel de poca RAM; acá se quedan sólo los SSH,
 * porque llevar un bot copia su carpeta por esa conexión.
 */
export function useServidoresParaDelfines(): ServidorParaDelfines[] {
  const repos = useAppStore((s) => s.repos)
  const settings = useAppStore((s) => s.settings)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  return useMemo(() => {
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
    ).flatMap((servidor) =>
      servidor.id.startsWith('ssh:')
        ? [{ hostId: servidor.id as `ssh:${string}`, nombre: servidor.nombre }]
        : []
    )
  }, [
    repos,
    settings,
    sshConnectionStates,
    sshTargetLabels,
    runtimeEnvironments,
    runtimeStatusByEnvironmentId
  ])
}
