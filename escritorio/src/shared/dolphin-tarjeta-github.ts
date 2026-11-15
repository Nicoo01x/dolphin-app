/**
 * Lo que la tarjeta de GitHub del chat de Dolphin muestra además de lo que la base ya trae en su
 * vista previa (una sola llamada REST): por qué se cerró un issue, su hito, el PR que lo cierra, y
 * de un PR los checks con el nombre del primero que falló, la revisión y los comentarios.
 *
 * Viaja como un campo más (`dolphinTarjeta`) del work item que devuelve la consulta de la base, sin
 * tocar su tipo: así una puesta al día de la base no choca con esto, y quien no lo conoce lo ignora.
 * Todo es opcional: si un dato no llega, esa parte de la tarjeta no se dibuja.
 */
import type { GitHubPRReviewSummary, PRReviewDecision } from './github/pull-request-types'

export type DolphinEstadoDePr = 'open' | 'closed' | 'merged' | 'draft'

export type DolphinChecksDeTarjeta = {
  pasaron: number
  fallaron: number
  corriendo: number
  pendientes: number
  /** Omitidos, neutros o cancelados: no suman ni restan. */
  omitidos: number
  total: number
  /** El nombre del primero que falló, para decir cuál sin abrir GitHub. */
  primeroQueFallo: string | null
}

export type DolphinExtraDeTarjeta = {
  motivoDeCierre?: 'completado' | 'no-planeado' | 'duplicado'
  hito?: { titulo: string; vence: string | null }
  /** El PR que cierra este issue (el mergeado primero; si no, uno abierto). */
  cierraCon?: { numero: number; titulo: string; estado: DolphinEstadoDePr }
  checks?: DolphinChecksDeTarjeta
  comentarios?: number
  reviewDecision?: PRReviewDecision | null
  latestReviews?: GitHubPRReviewSummary[]
}

const LLAVE = 'dolphinTarjeta'

type Crudo = Record<string, unknown>

function objeto(valor: unknown): Crudo | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Crudo)
    : null
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : []
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor : null
}

function entero(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : undefined
}

function motivoDeCierre(valor: unknown): DolphinExtraDeTarjeta['motivoDeCierre'] {
  const crudo = typeof valor === 'string' ? valor.toUpperCase() : ''
  if (crudo === 'COMPLETED') {
    return 'completado'
  }
  if (crudo === 'NOT_PLANNED') {
    return 'no-planeado'
  }
  return crudo === 'DUPLICATE' ? 'duplicado' : undefined
}

function hito(valor: unknown): DolphinExtraDeTarjeta['hito'] {
  const crudo = objeto(valor)
  const titulo = texto(crudo?.title)
  return titulo ? { titulo, vence: texto(crudo?.dueOn) } : undefined
}

function estadoDePr(crudo: Crudo): DolphinEstadoDePr {
  const estado = String(crudo.state ?? '').toUpperCase()
  if (estado === 'MERGED') {
    return 'merged'
  }
  if (estado === 'CLOSED') {
    return 'closed'
  }
  return crudo.isDraft === true ? 'draft' : 'open'
}

/** Mergeado gana a abierto, y abierto a cerrado sin mergear: el que de verdad lo cierra. */
const PESO_DEL_CIERRE: Record<DolphinEstadoDePr, number> = {
  merged: 0,
  open: 1,
  draft: 2,
  closed: 3
}

function cierraCon(valor: unknown): DolphinExtraDeTarjeta['cierraCon'] {
  const candidatos = lista(objeto(valor)?.nodes).flatMap((nodo) => {
    const crudo = objeto(nodo)
    const numero = entero(crudo?.number)
    if (!crudo || numero === undefined) {
      return []
    }
    return [{ numero, titulo: texto(crudo.title) ?? '', estado: estadoDePr(crudo) }]
  })
  return candidatos.sort((a, b) => PESO_DEL_CIERRE[a.estado] - PESO_DEL_CIERRE[b.estado])[0]
}

type ClaseDeCheck = 'pasaron' | 'fallaron' | 'corriendo' | 'pendientes' | 'omitidos'

const FALLAS = new Set(['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'])

/** CheckRun trae status + conclusion; StatusContext (los checks viejos) sólo state. */
export function claseDeCheck(crudo: Crudo): ClaseDeCheck {
  const conclusion = String(crudo.conclusion ?? '').toUpperCase()
  const status = String(crudo.status ?? '').toUpperCase()
  const state = String(crudo.state ?? '').toUpperCase()
  if (conclusion) {
    if (conclusion === 'SUCCESS') {
      return 'pasaron'
    }
    return FALLAS.has(conclusion) ? 'fallaron' : 'omitidos'
  }
  if (status === 'IN_PROGRESS') {
    return 'corriendo'
  }
  if (status) {
    return status === 'COMPLETED' ? 'omitidos' : 'pendientes'
  }
  if (state === 'SUCCESS') {
    return 'pasaron'
  }
  if (FALLAS.has(state)) {
    return 'fallaron'
  }
  return state === 'PENDING' ? 'corriendo' : 'pendientes'
}

function checks(valor: unknown): DolphinChecksDeTarjeta | undefined {
  const contextos = objeto(valor)
  if (!contextos) {
    return undefined
  }
  const cuenta: DolphinChecksDeTarjeta = {
    pasaron: 0,
    fallaron: 0,
    corriendo: 0,
    pendientes: 0,
    omitidos: 0,
    total: 0,
    primeroQueFallo: null
  }
  for (const nodo of lista(contextos.nodes)) {
    const crudo = objeto(nodo)
    if (!crudo) {
      continue
    }
    const clase = claseDeCheck(crudo)
    cuenta[clase] += 1
    cuenta.total += 1
    if (clase === 'fallaron' && !cuenta.primeroQueFallo) {
      cuenta.primeroQueFallo = texto(crudo.name) ?? texto(crudo.context)
    }
  }
  // Más de una página de checks: los que no vinieron se cuentan como pendientes, nunca como pasados.
  const totalDeclarado = entero(contextos.totalCount)
  if (totalDeclarado !== undefined && totalDeclarado > cuenta.total) {
    cuenta.pendientes += totalDeclarado - cuenta.total
    cuenta.total = totalDeclarado
  }
  return cuenta.total > 0 ? cuenta : undefined
}

function revisiones(valor: unknown): GitHubPRReviewSummary[] | undefined {
  const nodos = objeto(valor)?.nodes
  if (!Array.isArray(nodos)) {
    return undefined
  }
  return nodos.flatMap((nodo) => {
    const crudo = objeto(nodo)
    const autor = objeto(crudo?.author)
    const login = texto(autor?.login)
    return login ? [{ login, state: texto(crudo?.state), avatarUrl: texto(autor?.avatarUrl) }] : []
  })
}

function decision(valor: unknown): PRReviewDecision | null {
  return valor === 'APPROVED' || valor === 'CHANGES_REQUESTED' || valor === 'REVIEW_REQUIRED'
    ? valor
    : null
}

/** Lo que contesta la consulta GraphQL de main (ver dolphin-tarjeta-github.ts de main). */
export function extraDesdeGraphql(nodo: unknown): DolphinExtraDeTarjeta | null {
  const crudo = objeto(nodo)
  if (!crudo) {
    return null
  }
  const extra: DolphinExtraDeTarjeta = {}
  const motivo = motivoDeCierre(crudo.stateReason)
  const elHito = hito(crudo.milestone)
  if (motivo) {
    extra.motivoDeCierre = motivo
  }
  if (elHito) {
    extra.hito = elHito
  }
  if (crudo.__typename === 'Issue') {
    const pr = cierraCon(crudo.closedByPullRequestsReferences)
    if (pr) {
      extra.cierraCon = pr
    }
    return extra
  }
  const ultimoCommit = objeto(lista(objeto(crudo.commits)?.nodes)[0])
  const losChecks = checks(objeto(objeto(ultimoCommit?.commit)?.statusCheckRollup)?.contexts)
  const comentarios = entero(objeto(crudo.comments)?.totalCount)
  const lasRevisiones = revisiones(crudo.latestReviews)
  if (losChecks) {
    extra.checks = losChecks
  }
  if (comentarios !== undefined) {
    extra.comentarios = comentarios
  }
  if ('reviewDecision' in crudo) {
    extra.reviewDecision = decision(crudo.reviewDecision)
  }
  if (lasRevisiones) {
    extra.latestReviews = lasRevisiones
  }
  return extra
}

/** Pega el extra en el work item sin tocar su tipo; un extra vacío no agrega nada. */
export function conExtraDeTarjeta<T extends object>(
  item: T,
  extra: DolphinExtraDeTarjeta | null
): T {
  return extra && Object.keys(extra).length > 0 ? { ...item, [LLAVE]: extra } : item
}

/**
 * Lo lee del lado del renderer; cualquier cosa que no sea un objeto se trata como ausente.
 * Why genérico: es la contracara de `conExtraDeTarjeta` y recibe lo mismo que esa devuelve.
 */
export function leerExtraDeTarjeta<T extends object>(item: T): DolphinExtraDeTarjeta {
  const crudo = (item as Record<string, unknown>)[LLAVE]
  return (objeto(crudo) as DolphinExtraDeTarjeta | null) ?? {}
}
