/**
 * Lo que la tarjeta de GitHub decide antes de dibujar, sin React: qué estado mostrar y con qué
 * tono, cómo se reparte la barra de cambios, cómo se arma la tira de checks y quién revisa. Vive
 * aparte para poder probarlo sin montar nada.
 */
import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import type { DolphinExtraDeTarjeta } from '../../../../../shared/dolphin-tarjeta-github'

export type TonoDeEstado = 'verde' | 'violeta' | 'rojo' | 'gris' | 'ambar'

export type ClaveDeEstado =
  | 'abierto'
  | 'borrador'
  | 'mergeado'
  | 'cerrado'
  | 'completado'
  | 'no-planeado'
  | 'duplicado'

export type EstadoDeTarjeta = { clave: ClaveDeEstado; tono: TonoDeEstado }

/** Los colores son los de GitHub para cada estado: el color significa estado y nada más. */
export function estadoDeTarjeta(
  item: Pick<GitHubWorkItem, 'type' | 'state'>,
  extra: DolphinExtraDeTarjeta
): EstadoDeTarjeta {
  if (item.type === 'pr') {
    if (item.state === 'merged') {
      return { clave: 'mergeado', tono: 'violeta' }
    }
    if (item.state === 'closed') {
      return { clave: 'cerrado', tono: 'rojo' }
    }
    return item.state === 'draft'
      ? { clave: 'borrador', tono: 'gris' }
      : { clave: 'abierto', tono: 'verde' }
  }
  if (item.state !== 'closed') {
    return { clave: 'abierto', tono: 'verde' }
  }
  if (extra.motivoDeCierre === 'no-planeado') {
    return { clave: 'no-planeado', tono: 'gris' }
  }
  if (extra.motivoDeCierre === 'duplicado') {
    return { clave: 'duplicado', tono: 'gris' }
  }
  // Sin motivo (un GitHub Enterprise viejo) se lee como completado, que es lo que GitHub asume.
  return { clave: 'completado', tono: 'violeta' }
}

export function tonoDePr(estado: 'open' | 'closed' | 'merged' | 'draft'): TonoDeEstado {
  return estadoDeTarjeta({ type: 'pr', state: estado }, {}).tono
}

/** Una parte que existe nunca queda más angosta que esto: +1 contra −900 igual se ve. */
const PARTE_MINIMA = 0.06

export type RepartoDeCambios = { agregadas: number; quitadas: number }

/** Fracciones (0..1) de la barra; null cuando no hay ningún número que dibujar. */
export function repartoDeCambios(
  agregadas: number | undefined,
  quitadas: number | undefined
): RepartoDeCambios | null {
  const mas = agregadas ?? 0
  const menos = quitadas ?? 0
  const total = mas + menos
  if (agregadas === undefined && quitadas === undefined) {
    return null
  }
  if (total === 0) {
    return { agregadas: 0, quitadas: 0 }
  }
  let parteMas = mas / total
  if (mas > 0 && menos > 0) {
    parteMas = Math.min(1 - PARTE_MINIMA, Math.max(PARTE_MINIMA, parteMas))
  }
  return { agregadas: parteMas, quitadas: 1 - parteMas }
}

export type ClaseDeSegmento = 'pasaron' | 'fallaron' | 'corriendo' | 'pendientes' | 'omitidos'

export const ORDEN_DE_CHECKS: readonly ClaseDeSegmento[] = [
  'pasaron',
  'fallaron',
  'corriendo',
  'pendientes',
  'omitidos'
]

export const TONO_DE_CHECK: Record<ClaseDeSegmento, TonoDeEstado> = {
  pasaron: 'verde',
  fallaron: 'rojo',
  corriendo: 'ambar',
  pendientes: 'gris',
  omitidos: 'gris'
}

/** Hasta este número de checks, cada uno es su propia celda; arriba, se agrupan por clase. */
export const CELDAS_MAXIMAS = 24

export type SegmentoDeChecks = { clase: ClaseDeSegmento; peso: number }

export function segmentosDeChecks(
  checks: Record<ClaseDeSegmento, number> & { total: number }
): SegmentoDeChecks[] {
  if (checks.total <= 0) {
    return []
  }
  const porCelda = checks.total <= CELDAS_MAXIMAS
  return ORDEN_DE_CHECKS.flatMap((clase) => {
    const cantidad = checks[clase]
    if (cantidad <= 0) {
      return []
    }
    return porCelda
      ? Array.from({ length: cantidad }, () => ({ clase, peso: 1 }))
      : [{ clase, peso: cantidad }]
  })
}

export type EstadoDeRevisor = 'aprobo' | 'pidio-cambios' | 'comento' | 'esperando'

export type Revisor = { login: string; avatarUrl: string | null; estado: EstadoDeRevisor }

function estadoDeRevisor(estado: string | null | undefined): EstadoDeRevisor {
  const crudo = (estado ?? '').toUpperCase()
  if (crudo === 'APPROVED') {
    return 'aprobo'
  }
  return crudo === 'CHANGES_REQUESTED' ? 'pidio-cambios' : 'comento'
}

/** Los que ya revisaron primero (su última revisión), después los que todavía esperan. */
export function revisoresDe(
  item: Pick<GitHubWorkItem, 'latestReviews' | 'reviewRequests'>,
  extra: DolphinExtraDeTarjeta
): Revisor[] {
  const vistos = new Set<string>()
  const revisores: Revisor[] = []
  for (const revision of extra.latestReviews ?? item.latestReviews ?? []) {
    const clave = revision.login.toLowerCase()
    if (!vistos.has(clave)) {
      vistos.add(clave)
      revisores.push({
        login: revision.login,
        avatarUrl: revision.avatarUrl ?? null,
        estado: estadoDeRevisor(revision.state)
      })
    }
  }
  for (const pedido of item.reviewRequests ?? []) {
    const clave = pedido.login.toLowerCase()
    if (!vistos.has(clave)) {
      vistos.add(clave)
      revisores.push({
        login: pedido.login,
        avatarUrl: pedido.avatarUrl || null,
        estado: 'esperando'
      })
    }
  }
  return revisores
}

export type EstadoDeRevision = 'aprobado' | 'cambios' | 'esperando'

export function estadoDeRevision(
  item: Pick<GitHubWorkItem, 'reviewDecision' | 'state'>,
  extra: DolphinExtraDeTarjeta,
  revisores: readonly Revisor[]
): EstadoDeRevision | null {
  if (item.state === 'merged' || item.state === 'closed') {
    return null
  }
  const decision = extra.reviewDecision !== undefined ? extra.reviewDecision : item.reviewDecision
  if (decision === 'APPROVED') {
    return 'aprobado'
  }
  if (decision === 'CHANGES_REQUESTED') {
    return 'cambios'
  }
  if (decision === 'REVIEW_REQUIRED' || revisores.some((r) => r.estado === 'esperando')) {
    return 'esperando'
  }
  return null
}

export type Etiqueta = { nombre: string; color: string | null }

export function etiquetasDe(item: Pick<GitHubWorkItem, 'labels' | 'labelColors'>): Etiqueta[] {
  return item.labels.map((nombre) => {
    const hex = item.labelColors?.[nombre]
    return { nombre, color: hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : null }
  })
}

const UNIDADES: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
]

const formateadores = new Map<string, Intl.RelativeTimeFormat>()

/** «hace 3 días», «3 days ago»: en el idioma de la app, estilo corto. Null si la fecha no sirve. */
export function tiempoRelativo(
  iso: string,
  locale: string,
  ahora: number = Date.now()
): string | null {
  const momento = new Date(iso).getTime()
  if (!iso || Number.isNaN(momento)) {
    return null
  }
  let formateador = formateadores.get(locale)
  if (!formateador) {
    formateador = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
    formateadores.set(locale, formateador)
  }
  const segundos = (momento - ahora) / 1000
  for (const [unidad, tamano] of UNIDADES) {
    if (Math.abs(segundos) >= tamano) {
      return formateador.format(Math.round(segundos / tamano), unidad)
    }
  }
  return formateador.format(0, 'second')
}
