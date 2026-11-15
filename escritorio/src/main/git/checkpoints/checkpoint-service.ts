import { gitExecFileAsync } from '../command-runner/git-exec-file'
import {
  cambiosDesde,
  checkpointsGuardados,
  crearCheckpoint,
  olvidarCheckpoint,
  restaurarCheckpoint,
  type CheckpointDeCodigo,
  type EjecutarGit,
  type RestauracionDeCheckpoint
} from './checkpoint-de-codigo'

/**
 * El servicio de checkpoints: adapta el ejecutor de git del repo al motor, que no sabe de Electron
 * ni de admisión de procesos y por eso se puede probar contra un repo de verdad.
 *
 * `admissionTier: 'status'` es el default del ejecutor y alcanza: un checkpoint es rápido y pasa
 * antes de un turno, así que no tiene que ganarle la cola a nada.
 */
const git: EjecutarGit = async (args, opciones) => {
  const { stdout } = await gitExecFileAsync([...args], {
    cwd: opciones.cwd,
    ...(opciones.env ? { env: opciones.env } : {})
  })
  return { stdout }
}

export function crearCheckpointDeCodigo(
  cwd: string,
  etiqueta?: string
): Promise<CheckpointDeCodigo | null> {
  return crearCheckpoint(git, cwd, etiqueta)
}

export function restaurarCheckpointDeCodigo(
  cwd: string,
  sha: string
): Promise<RestauracionDeCheckpoint> {
  return restaurarCheckpoint(git, cwd, sha)
}

export function cambiosDesdeCheckpoint(
  cwd: string,
  sha: string
): Promise<readonly { archivo: string; estado: string }[]> {
  return cambiosDesde(git, cwd, sha)
}

export function olvidarCheckpointDeCodigo(
  cwd: string,
  checkpoint: CheckpointDeCodigo
): Promise<void> {
  return olvidarCheckpoint(git, cwd, checkpoint)
}

export function checkpointsDelWorktree(
  cwd: string
): Promise<readonly { sha: string; ref: string }[]> {
  return checkpointsGuardados(git, cwd)
}
