/**
 * Cómo arma cada uno su isla: qué secciones se ven y en qué orden. Lo guarda main (ver
 * use-preferencias-isla.ts); acá está solo la lógica, pura.
 */

export type SeccionDeIsla = 'agentes' | 'bandeja' | 'notas' | 'estudio'
export type ArmadoDeIsla = { orden: SeccionDeIsla[]; ocultas: SeccionDeIsla[] }

export const SECCIONES: readonly SeccionDeIsla[] = ['agentes', 'bandeja', 'notas', 'estudio']
export const ARMADO_DE_FABRICA: ArmadoDeIsla = { orden: [...SECCIONES], ocultas: [] }

const esSeccion = (valor: unknown): valor is SeccionDeIsla =>
  typeof valor === 'string' && (SECCIONES as readonly string[]).includes(valor)

/**
 * Lo guardado, sano: solo secciones que existen, cada una una vez, las que falten al final (una
 * sección nueva aparece sola) y nunca todas ocultas.
 */
export function sanearArmado(valor: unknown): ArmadoDeIsla {
  const crudo = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>
  const guardado = Array.isArray(crudo.orden) ? crudo.orden.filter(esSeccion) : []
  const orden = [...new Set([...guardado, ...SECCIONES])]
  const ocultas = Array.isArray(crudo.ocultas) ? [...new Set(crudo.ocultas.filter(esSeccion))] : []
  return ocultas.length >= orden.length ? ARMADO_DE_FABRICA : { orden, ocultas }
}

export function seccionesVisibles(armado: ArmadoDeIsla): SeccionDeIsla[] {
  return armado.orden.filter((seccion) => !armado.ocultas.includes(seccion))
}

/** Un lugar más arriba (-1) o más abajo (1); en el borde no se mueve. */
export function moverSeccion(
  armado: ArmadoDeIsla,
  seccion: SeccionDeIsla,
  hacia: -1 | 1
): ArmadoDeIsla {
  const desde = armado.orden.indexOf(seccion)
  const hasta = desde + hacia
  if (desde === -1 || hasta < 0 || hasta >= armado.orden.length) {
    return armado
  }
  const orden = [...armado.orden]
  ;[orden[desde], orden[hasta]] = [orden[hasta], orden[desde]]
  return { ...armado, orden }
}

/** Mostrar u ocultar; la última que se ve no se oculta, o la isla abierta quedaría vacía. */
export function alternarSeccion(armado: ArmadoDeIsla, seccion: SeccionDeIsla): ArmadoDeIsla {
  if (armado.ocultas.includes(seccion)) {
    return { ...armado, ocultas: armado.ocultas.filter((s) => s !== seccion) }
  }
  if (seccionesVisibles(armado).length <= 1) {
    return armado
  }
  return { ...armado, ocultas: [...armado.ocultas, seccion] }
}
