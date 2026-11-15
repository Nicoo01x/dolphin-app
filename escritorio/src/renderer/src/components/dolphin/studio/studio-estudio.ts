import type { AgenteDeEstudio, ArchivoDeEstudio } from '../../../../../shared/dolphin-isla-types'
import type { StudioSessionSummary } from './studio-summary'

const archivosPorPane = new Map<string, readonly ArchivoDeEstudio[]>()

export function registrarEstudio(paneKey: string, summary: StudioSessionSummary): void {
  archivosPorPane.set(
    paneKey,
    summary.files.map((ruta) => ({ ruta, accion: summary.fileActions?.[ruta] ?? 'editado' }))
  )
}

export function agentesDeEstudio(paneKeys: readonly string[], maxArchivos = 8): AgenteDeEstudio[] {
  return paneKeys.flatMap((paneKey) => {
    const archivos = archivosPorPane.get(paneKey)
    return archivos && archivos.length > 0
      ? [{ paneKey, archivos: archivos.toReversed().slice(0, maxArchivos) }]
      : []
  })
}

export function yaRegistrado(paneKey: string): boolean {
  return archivosPorPane.has(paneKey)
}
