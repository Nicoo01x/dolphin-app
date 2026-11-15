import type { WorktreeStatus } from '../../../../../shared/worktree-status-rollup'

/** Un espacio de trabajo tal como lo necesita el inicio: lo mínimo para listarlo y abrirlo. */
export type EspacioDelInicio = {
  id: string
  repoId: string
  nombre: string
  proyecto: string
  /** La rama sin `refs/heads/`, o null en un HEAD suelto o una carpeta sin git. */
  rama: string | null
  ultimaActividad: number
  creado: number | null
  /**
   * La última actividad DE VERDAD: un agente que cambió de estado (`smartAt`), alguien que
   * escribió en su terminal (`lastTerminalUseAt`) o Dolphin que lo creó (`createdAt`); null si
   * nunca hubo ninguna. Es lo que decide «hoy».
   *
   * Why no `ultimaActividad`: la base sella `lastActivityAt` al DETECTAR un worktree, para que no se
   * hunda en Recientes. Agregar un repo con 16 worktrees los ponía a todos en «Hoy».
   *
   * Opcional sólo para los datos de ejemplo del inicio, que cuentan su actividad directo en
   * `ultimaActividad`; los espacios de verdad salen de `espaciosDelInicio` y siempre lo traen.
   */
  ultimoMovimiento?: number | null
}

/** Un espacio con el estado que ya muestra la barra lateral (el mismo punto, la misma fuente). */
export type EspacioConEstado = { espacio: EspacioDelInicio; estado: WorktreeStatus }

type WorktreeLeido = {
  id: string
  displayName: string
  branch?: string | null
  lastActivityAt?: number
  createdAt?: number
  smartAt?: number
  lastTerminalUseAt?: number
  isArchived?: boolean
  removing?: true
}

function ultimoMovimientoDe(worktree: WorktreeLeido): number | null {
  const marcas = [worktree.smartAt, worktree.lastTerminalUseAt, worktree.createdAt].filter(
    (marca): marca is number => typeof marca === 'number' && Number.isFinite(marca)
  )
  return marcas.length > 0 ? Math.max(...marcas) : null
}

function rutaComparable(ruta: string, sinMayusculas: boolean): string {
  const limpia = ruta.replace(/\\/g, '/').replace(/\/+$/, '')
  return sinMayusculas ? limpia.toLowerCase() : limpia
}

/**
 * Si el proyecto es la carpeta personal que la base agrega sola en un perfil nuevo: una carpeta (no
 * un repo git) cuya ruta es la del home. Se decide por la ruta y no por el nombre «~», que la
 * persona puede cambiar. Sin saber el home (`null`), nada es carpeta personal.
 */
export function esCarpetaPersonal(
  repo: { kind?: string; path?: string },
  carpetaPersonal: string | null,
  sinMayusculas: boolean
): boolean {
  if (!carpetaPersonal || repo.kind !== 'folder' || !repo.path) {
    return false
  }
  return rutaComparable(repo.path, sinMayusculas) === rutaComparable(carpetaPersonal, sinMayusculas)
}

/** `refs/heads/feat/x` → `feat/x`; la tarjeta del tablero guarda la rama corta. */
export function ramaCorta(branch: string | null | undefined): string | null {
  if (!branch) {
    return null
  }
  return branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch
}

/** Todos los espacios vivos de todos los proyectos, en el orden de los proyectos. */
export function espaciosDelInicio(
  repos: readonly { id: string; displayName: string }[],
  worktreesPorRepo: Readonly<Record<string, readonly WorktreeLeido[] | undefined>>
): EspacioDelInicio[] {
  return repos.flatMap((repo) =>
    (worktreesPorRepo[repo.id] ?? [])
      // Uno archivado o que se está borrando ya no es trabajo: no tiene por qué llamarte.
      .filter((worktree) => !worktree.isArchived && !worktree.removing)
      .map((worktree) => ({
        id: worktree.id,
        repoId: repo.id,
        nombre: worktree.displayName,
        proyecto: repo.displayName,
        rama: ramaCorta(worktree.branch),
        ultimaActividad: worktree.lastActivityAt ?? 0,
        creado: typeof worktree.createdAt === 'number' ? worktree.createdAt : null,
        ultimoMovimiento: ultimoMovimientoDe(worktree)
      }))
  )
}

/**
 * Qué estados piden que alguien mire: el agente espera un permiso, falló, no se pudo confirmar en
 * qué quedó, o terminó y su rama espera revisión. El número es el orden: primero lo que está
 * frenado, después lo que ya se puede revisar.
 */
const PRIORIDAD_DEL_AVISO: Partial<Record<WorktreeStatus, number>> = {
  permission: 0,
  failed: 1,
  unconfirmed: 2,
  done: 3
}

const masReciente = (a: EspacioConEstado, b: EspacioConEstado): number =>
  b.espacio.ultimaActividad - a.espacio.ultimaActividad

export function loQueTeNecesita(
  espacios: readonly EspacioDelInicio[],
  estados: ReadonlyMap<string, WorktreeStatus>
): EspacioConEstado[] {
  return espacios
    .flatMap((espacio) => {
      const estado = estados.get(espacio.id)
      return estado !== undefined && PRIORIDAD_DEL_AVISO[estado] !== undefined
        ? [{ espacio, estado }]
        : []
    })
    .sort(
      (a, b) =>
        (PRIORIDAD_DEL_AVISO[a.estado] ?? 0) - (PRIORIDAD_DEL_AVISO[b.estado] ?? 0) ||
        masReciente(a, b)
    )
}

/** La medianoche local del día de `ahora`. */
export function inicioDelDia(ahora: number): number {
  const dia = new Date(ahora)
  dia.setHours(0, 0, 0, 0)
  return dia.getTime()
}

/** Cuándo se movió de verdad (ver `ultimoMovimiento`), o 0 si nunca. */
function movimientoDe(espacio: EspacioDelInicio): number {
  const movimiento =
    espacio.ultimoMovimiento === undefined
      ? Math.max(espacio.ultimaActividad, espacio.creado ?? 0)
      : espacio.ultimoMovimiento
  return movimiento ?? 0
}

/**
 * Lo que trabajó hoy, lo último arriba: un agente que cambió de estado o está trabajando ahora,
 * alguien que escribió en su terminal, o un espacio que Dolphin creó hoy. Que la app lo haya visto
 * por primera vez hoy no es actividad. Deja afuera lo que ya está en «te necesita»: el mismo
 * espacio dos veces en la misma pantalla no es énfasis, es ruido.
 */
export function loDeHoy(
  espacios: readonly EspacioDelInicio[],
  estados: ReadonlyMap<string, WorktreeStatus>,
  ahora: number,
  yaAvisados: ReadonlySet<string>
): EspacioConEstado[] {
  const desde = inicioDelDia(ahora)
  return espacios
    .filter(
      (espacio) =>
        !yaAvisados.has(espacio.id) &&
        (movimientoDe(espacio) >= desde || estados.get(espacio.id) === 'working')
    )
    .map((espacio) => ({ espacio, estado: estados.get(espacio.id) ?? 'inactive' }))
    .sort((a, b) => movimientoDe(b.espacio) - movimientoDe(a.espacio) || masReciente(a, b))
}

/**
 * El espacio que trabaja cada rama de un proyecto: con eso una tarjeta del tablero dice en qué anda
 * el agente que la tiene. Si dos espacios tienen la misma rama, gana el de actividad más reciente.
 */
export function espaciosPorRama(
  espacios: readonly EspacioDelInicio[],
  repoId: string,
  estados: ReadonlyMap<string, WorktreeStatus>
): Map<string, EspacioConEstado> {
  const porRama = new Map<string, EspacioConEstado>()
  for (const espacio of espacios) {
    if (espacio.repoId !== repoId || !espacio.rama) {
      continue
    }
    const previo = porRama.get(espacio.rama)
    if (!previo || previo.espacio.ultimaActividad < espacio.ultimaActividad) {
      porRama.set(espacio.rama, { espacio, estado: estados.get(espacio.id) ?? 'inactive' })
    }
  }
  return porRama
}
