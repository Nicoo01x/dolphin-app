import { ORPHAN_WORKTREE_ID } from '../../shared/constants'
import type { LoQueMasPesa } from '../../shared/modo-poca-ram'
import type { MemorySnapshot } from '../../shared/process-stats-types'

/**
 * Debajo de esto un espacio de trabajo no se nombra: mandar al servidor algo de 100 MB no le
 * devuelve aire a nadie, y el aviso quedaría prometiendo un alivio que no existe.
 */
export const MINIMO_PARA_NOMBRAR = 256 * 1024 ** 2

/**
 * Qué es lo que más memoria usa, para ponerle nombre en el cartel.
 *
 * La foto de memoria ya reparte cada terminal (y todo lo que corre adentro: el agente, el build,
 * el servidor de desarrollo) en su espacio de trabajo. Los terminales que no son de ningún espacio
 * no se nombran: no hay nada que correr en otro lado. Si nada pasa el mínimo, se habla de Dolphin
 * entero, que es lo único cierto que se puede decir.
 */
export function loQueMasPesa(
  foto: Pick<MemorySnapshot, 'worktrees' | 'totalMemory'>
): LoQueMasPesa {
  let mayor: MemorySnapshot['worktrees'][number] | null = null
  for (const espacio of foto.worktrees) {
    if (espacio.worktreeId === ORPHAN_WORKTREE_ID || !Number.isFinite(espacio.memory)) {
      continue
    }
    if (!mayor || espacio.memory > mayor.memory) {
      mayor = espacio
    }
  }
  if (mayor && mayor.memory >= MINIMO_PARA_NOMBRAR) {
    return {
      tipo: 'espacio',
      worktreeId: mayor.worktreeId,
      nombre: mayor.worktreeName,
      repoId: mayor.repoId,
      repoNombre: mayor.repoName,
      bytes: mayor.memory
    }
  }
  return { tipo: 'dolphin', bytes: Math.max(0, foto.totalMemory) }
}
