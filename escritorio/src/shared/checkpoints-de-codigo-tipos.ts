/**
 * Los tipos de los checkpoints de código, compartidos entre el proceso principal, el preload y el
 * renderer. Van en `shared` porque viajan por el puente y las tres puntas tienen que concordar.
 */

export type CheckpointDeCodigoDato = {
  readonly sha: string
  readonly ref: string
  readonly cuando: number
}

export type RestauracionDeCheckpointDato = {
  /** El checkpoint del estado anterior: con esto se deshace la restauración. */
  readonly deshacer: CheckpointDeCodigoDato
  readonly archivosEscritos: number
  readonly archivosBorrados: readonly string[]
}

export type CambioDesdeCheckpoint = {
  readonly archivo: string
  /** La letra de `git diff --name-status`: M, A, D, R… */
  readonly estado: string
}

export type CheckpointsApi = {
  crear: (cwd: string, etiqueta?: string) => Promise<CheckpointDeCodigoDato | null>
  restaurar: (cwd: string, sha: string) => Promise<RestauracionDeCheckpointDato>
  cambios: (cwd: string, sha: string) => Promise<readonly CambioDesdeCheckpoint[]>
}
