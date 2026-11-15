import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Checkpoints de código: volver el proyecto al estado en que estaba cuando pediste algo.
 *
 * El problema que resuelven: un agente escribe en veinte archivos y la cuarta vuelta deja todo peor
 * que la primera. Hoy la única salida es leer el diff entero y deshacer a mano, o perder lo bueno
 * junto con lo malo. Un checkpoint por turno convierte eso en un botón.
 *
 * Cómo está hecho, y por qué así:
 *
 *  - **No toca el índice.** Cada operación usa su propio `GIT_INDEX_FILE` en el temporal. Hacer
 *    `git add -A` sobre el índice de verdad le pisaría a la persona lo que tenía preparado para
 *    commitear, que es trabajo suyo que nadie le pidió entregar.
 *  - **No toca el stash.** El stash es una pila compartida entre worktrees y entre sesiones: meter
 *    algo ahí es meterle la mano en el bolsillo a otro proceso.
 *  - **No mueve HEAD ni crea ramas.** El checkpoint es un `commit-tree` suelto, guardado bajo
 *    `refs/dolphin/checkpoints/<id>`. Fuera de la vista de `git branch`, y con una ref para que el
 *    recolector de basura no se lo lleve.
 *  - **Respeta .gitignore.** Va por `git add -A`, así que `node_modules` y los build no entran.
 *  - **Restaurar es reversible.** Antes de escribir un solo archivo, guarda un checkpoint del
 *    estado actual y lo devuelve. Una restauración que pierde trabajo sin vuelta no es una función,
 *    es una trampa.
 */

/** El prefijo de las refs. Propio para que no aparezca entre las ramas de nadie. */
export const REFS_DE_CHECKPOINTS = 'refs/dolphin/checkpoints'

export type EjecutarGit = (
  args: readonly string[],
  opciones: { cwd: string; env?: NodeJS.ProcessEnv }
) => Promise<{ stdout: string }>

export type CheckpointDeCodigo = {
  /** El commit suelto que guarda el árbol entero. */
  readonly sha: string
  /** La ref que lo sostiene, para poder borrarlo cuando ya no haga falta. */
  readonly ref: string
  readonly cuando: number
}

export type RestauracionDeCheckpoint = {
  /** El checkpoint del estado anterior: con esto se deshace la restauración. */
  readonly deshacer: CheckpointDeCodigo
  readonly archivosEscritos: number
  readonly archivosBorrados: readonly string[]
}

function indiceTemporal(): string {
  return join(tmpdir(), `dolphin-checkpoint-${randomUUID()}.index`)
}

async function conIndicePropio<T>(trabajo: (env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
  const indice = indiceTemporal()
  try {
    return await trabajo({ GIT_INDEX_FILE: indice })
  } finally {
    // Si falla el borrado no importa: es el temporal del sistema.
    await rm(indice, { force: true }).catch(() => {})
  }
}

function lineas(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean)
}

/**
 * Guarda el estado del proyecto tal como está ahora.
 *
 * Devuelve null si el worktree no tiene HEAD (un repo recién iniciado sin un solo commit): sin
 * padre no hay contra qué comparar, y un checkpoint que no se puede diffear no sirve de nada.
 */
export async function crearCheckpoint(
  git: EjecutarGit,
  cwd: string,
  etiqueta = 'checkpoint'
): Promise<CheckpointDeCodigo | null> {
  const cabeza = await git(['rev-parse', 'HEAD'], { cwd }).catch(() => null)
  const padre = cabeza ? cabeza.stdout.trim() : null
  if (!padre) {
    return null
  }
  const sha = await conIndicePropio(async (env) => {
    // Se siembra desde HEAD y después se agrega todo: así el árbol tiene también lo que no cambió.
    await git(['read-tree', padre], { cwd, env })
    await git(['add', '-A'], { cwd, env })
    const arbol = (await git(['write-tree'], { cwd, env })).stdout.trim()
    const commit = await git(['commit-tree', arbol, '-p', padre, '-m', `dolphin: ${etiqueta}`], {
      cwd,
      env
    })
    return commit.stdout.trim()
  })
  const ref = `${REFS_DE_CHECKPOINTS}/${randomUUID()}`
  // La ref es lo que lo salva del recolector de basura: un commit suelto se puede ir solo.
  await git(['update-ref', ref, sha], { cwd })
  return { sha, ref, cuando: Date.now() }
}

/** Los archivos que el checkpoint tiene guardados. */
async function archivosDe(git: EjecutarGit, cwd: string, sha: string): Promise<Set<string>> {
  const salida = await git(['ls-tree', '-r', '--name-only', '-z', sha], { cwd })
  return new Set(salida.stdout.split('\0').filter(Boolean))
}

/** Lo que hay ahora en el proyecto, sin lo que .gitignore excluye. */
async function archivosDeAhora(git: EjecutarGit, cwd: string): Promise<Set<string>> {
  const salida = await git(['ls-files', '-c', '-o', '--exclude-standard', '-z'], { cwd })
  return new Set(salida.stdout.split('\0').filter(Boolean))
}

/**
 * Vuelve el proyecto al estado del checkpoint.
 *
 * Primero guarda dónde estaba, y ese checkpoint es lo que devuelve: es lo que hace que esto se
 * pueda deshacer. Los archivos que aparecieron después del checkpoint se borran —si no, restaurar
 * dejaría a medias, con archivos de dos momentos distintos conviviendo—, pero solo los que git ve:
 * nada de lo que .gitignore excluye se toca.
 */
export async function restaurarCheckpoint(
  git: EjecutarGit,
  cwd: string,
  sha: string
): Promise<RestauracionDeCheckpoint> {
  const deshacer = await crearCheckpoint(git, cwd, 'antes de restaurar')
  if (!deshacer) {
    throw new Error('no se puede restaurar sin HEAD')
  }
  const guardados = await archivosDe(git, cwd, sha)
  const ahora = await archivosDeAhora(git, cwd)
  const sobrantes = [...ahora].filter((archivo) => !guardados.has(archivo)).sort()

  await conIndicePropio(async (env) => {
    await git(['read-tree', sha], { cwd, env })
    // `-a -f`: escribe todo lo del árbol, pisando lo que haya. El índice es el temporal.
    await git(['checkout-index', '-a', '-f'], { cwd, env })
  })
  for (const sobrante of sobrantes) {
    await rm(join(cwd, sobrante), { force: true }).catch(() => {})
  }
  return { deshacer, archivosEscritos: guardados.size, archivosBorrados: sobrantes }
}

/** Suelta la ref: el commit queda para el recolector de basura. No toca archivos. */
export async function olvidarCheckpoint(
  git: EjecutarGit,
  cwd: string,
  checkpoint: CheckpointDeCodigo
): Promise<void> {
  await git(['update-ref', '-d', checkpoint.ref, checkpoint.sha], { cwd }).catch(() => {})
}

/** Qué cambió entre el checkpoint y lo que hay ahora, por archivo. */
export async function cambiosDesde(
  git: EjecutarGit,
  cwd: string,
  sha: string
): Promise<readonly { archivo: string; estado: string }[]> {
  const actual = await crearCheckpoint(git, cwd, 'comparación')
  if (!actual) {
    return []
  }
  try {
    const salida = await git(['diff', '--name-status', '-z', sha, actual.sha], { cwd })
    const partes = salida.stdout.split('\0').filter(Boolean)
    const cambios: { archivo: string; estado: string }[] = []
    for (let i = 0; i + 1 < partes.length; i += 2) {
      cambios.push({ estado: partes[i]!, archivo: partes[i + 1]! })
    }
    return cambios
  } finally {
    await olvidarCheckpoint(git, cwd, actual)
  }
}

/** Los checkpoints que todavía tienen su ref, de este worktree. */
export async function checkpointsGuardados(
  git: EjecutarGit,
  cwd: string
): Promise<readonly { sha: string; ref: string }[]> {
  const salida = await git(
    ['for-each-ref', '--format=%(objectname) %(refname)', REFS_DE_CHECKPOINTS],
    { cwd }
  ).catch(() => ({ stdout: '' }))
  return lineas(salida.stdout).flatMap((linea) => {
    const [sha, ref] = linea.split(' ')
    return sha && ref ? [{ sha, ref }] : []
  })
}
