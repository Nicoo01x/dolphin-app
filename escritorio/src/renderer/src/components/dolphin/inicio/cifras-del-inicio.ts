import type { WorktreeStatus } from '../../../../../shared/worktree-status-rollup'
import type { TarjetaDelTablero } from '../../../../../shared/dolphin-tablero-types'
import type { EspacioConEstado, EspacioDelInicio } from './estado-del-inicio'

/** Una cifra de la franja: el número grande y qué cuenta. */
export type Cifra =
  | { clave: 'corriendo' | 'para-revisar' | 'te-necesita'; valor: number; estado: WorktreeStatus }
  | { clave: 'proyectos'; valor: number }
  | { clave: 'ultima'; valor: number; unidad: 'ahora' | 'min' | 'h' | 'd' }

/** Lo que va arriba, sobre el grabado. */
export type ArribaDelInicio =
  | { tipo: 'nada' }
  /** Perfil nuevo: ninguna cifra en cero; el botón de agregar un proyecto. */
  | { tipo: 'accion' }
  | { tipo: 'cifras'; cifras: Cifra[] }

const CORRIENDO: ReadonlySet<WorktreeStatus> = new Set(['working', 'monitoring'])
const MINUTO = 60_000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

/** Cuánto pasó, en la unidad que se lee de lejos: «ahora», minutos, horas o días. */
export function haceCuanto(ms: number): Extract<Cifra, { clave: 'ultima' }> {
  if (ms < MINUTO) {
    return { clave: 'ultima', valor: 0, unidad: 'ahora' }
  }
  if (ms < HORA) {
    return { clave: 'ultima', valor: Math.floor(ms / MINUTO), unidad: 'min' }
  }
  if (ms < DIA) {
    return { clave: 'ultima', valor: Math.floor(ms / HORA), unidad: 'h' }
  }
  return { clave: 'ultima', valor: Math.floor(ms / DIA), unidad: 'd' }
}

/**
 * Las cifras de la franja del mundo. Con trabajo: lo que corre, lo que espera revisión y lo que te
 * necesita, sólo las que no son cero. Sin trabajo y con proyectos: cuántos y cuándo fue lo último.
 * Con un perfil nuevo no hay cifras (un «0 proyectos» no dice nada): va la acción.
 */
export function arribaDelInicio({
  listo,
  proyectos,
  espacios,
  estados,
  teNecesita,
  tarjetas,
  ahora
}: {
  listo: boolean
  proyectos: number
  espacios: readonly EspacioDelInicio[]
  estados: ReadonlyMap<string, WorktreeStatus>
  teNecesita: readonly EspacioConEstado[]
  /** Las del tablero, si hay; sin tablero, lo que espera revisión sale de los espacios. */
  tarjetas: readonly TarjetaDelTablero[] | null
  ahora: number
}): ArribaDelInicio {
  if (!listo) {
    return { tipo: 'nada' }
  }
  if (proyectos === 0) {
    return { tipo: 'accion' }
  }
  const estadoDe = (espacio: EspacioDelInicio): WorktreeStatus =>
    estados.get(espacio.id) ?? 'inactive'
  const corriendo = espacios.filter((espacio) => CORRIENDO.has(estadoDe(espacio))).length
  const paraRevisar = tarjetas
    ? tarjetas.filter((tarjeta) => tarjeta.columna === 'para-revisar').length
    : espacios.filter((espacio) => estadoDe(espacio) === 'done').length
  // Lo que terminó ya cuenta en «para revisar»: acá sólo lo que está frenado esperándote.
  const necesita = teNecesita.filter(({ estado }) => estado !== 'done').length
  const conTrabajo: Cifra[] = [
    ...(corriendo > 0
      ? [{ clave: 'corriendo' as const, valor: corriendo, estado: 'working' as const }]
      : []),
    ...(paraRevisar > 0
      ? [{ clave: 'para-revisar' as const, valor: paraRevisar, estado: 'done' as const }]
      : []),
    ...(necesita > 0
      ? [{ clave: 'te-necesita' as const, valor: necesita, estado: 'permission' as const }]
      : [])
  ]
  if (conTrabajo.length > 0) {
    return { tipo: 'cifras', cifras: conTrabajo }
  }
  const ultima = Math.max(0, ...espacios.map((espacio) => espacio.ultimaActividad))
  return {
    tipo: 'cifras',
    cifras: [
      { clave: 'proyectos', valor: proyectos },
      ...(ultima > 0 ? [haceCuanto(Math.max(0, ahora - ultima))] : [])
    ]
  }
}
