/**
 * Issues y PR de ejemplo para el fixture y los tests de la tarjeta: uno por estado que importa,
 * más uno con datos a medias (lo que contesta un GitHub Enterprise viejo o una consulta caída).
 */
import type { GitHubIssueOrPRLink } from '../../../../../shared/github/links'
import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import {
  conExtraDeTarjeta,
  type DolphinExtraDeTarjeta
} from '../../../../../shared/dolphin-tarjeta-github'

const HACE_TRES_DIAS = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
const HACE_DOS_HORAS = new Date(Date.now() - 2 * 3600 * 1000).toISOString()

export const linkDeIssue: GitHubIssueOrPRLink = {
  slug: { owner: 'tienda-ejemplo', repo: 'tienda-web' },
  number: 45,
  type: 'issue'
}

export const linkDePr: GitHubIssueOrPRLink = {
  slug: { owner: 'tienda-ejemplo', repo: 'tienda-web' },
  number: 52,
  type: 'pr'
}

const base: GitHubWorkItem = {
  id: 'issue:45',
  type: 'issue',
  number: 45,
  title: 'El IVA del carrito redondea mal los centavos con tres productos o más',
  state: 'open',
  url: 'https://github.com/tienda-ejemplo/tienda-web/issues/45',
  labels: ['idea', 'pagos', 'carrito'],
  labelColors: { idea: 'a2eeef', pagos: 'd73a4a', carrito: '0e8a16' },
  updatedAt: HACE_TRES_DIAS,
  author: 'ana-dev',
  commentCount: 1,
  assignees: [
    { login: 'ana-dev', name: null, avatarUrl: '' },
    { login: 'lucas-p', name: null, avatarUrl: '' }
  ],
  repoId: 'repo-ejemplo'
}

function con(item: GitHubWorkItem, extra: DolphinExtraDeTarjeta): GitHubWorkItem {
  return conExtraDeTarjeta(item, extra)
}

export const issueAbierto = con(base, {
  hito: { titulo: 'Black Friday', vence: null },
  cierraCon: { numero: 52, titulo: 'Redondeo del IVA por renglón', estado: 'open' }
})

export const issueCompletado = con(
  { ...base, state: 'closed', labels: ['bug'], labelColors: { bug: 'd73a4a' } },
  {
    motivoDeCierre: 'completado',
    cierraCon: { numero: 52, titulo: 'Redondeo del IVA por renglón', estado: 'merged' }
  }
)

export const issueNoPlaneado = con(
  { ...base, state: 'closed', labels: [], assignees: [], commentCount: 12 },
  { motivoDeCierre: 'no-planeado' }
)

const pr: GitHubWorkItem = {
  ...base,
  id: 'pr:52',
  type: 'pr',
  number: 52,
  title: 'Redondeo del IVA por renglón, no sobre el total',
  url: 'https://github.com/tienda-ejemplo/tienda-web/pull/52',
  labels: ['pagos'],
  labelColors: { pagos: 'd73a4a' },
  updatedAt: HACE_DOS_HORAS,
  branchName: 'dolphin/redondeo-iva',
  baseRefName: 'main',
  additions: 1240,
  deletions: 380,
  changedFiles: 14,
  mergeable: 'MERGEABLE',
  reviewRequests: [{ login: 'lucas-p', name: null, avatarUrl: '' }]
}

export const prAbierto = con(pr, {
  comentarios: 4,
  reviewDecision: 'CHANGES_REQUESTED',
  latestReviews: [{ login: 'ana-dev', state: 'CHANGES_REQUESTED', avatarUrl: null }],
  checks: {
    pasaron: 7,
    fallaron: 1,
    corriendo: 2,
    pendientes: 0,
    omitidos: 1,
    total: 11,
    primeroQueFallo: 'test (ubuntu-latest, node 20)'
  }
})

export const prBorradorConConflictos = con(
  { ...pr, state: 'draft', mergeable: 'CONFLICTING', additions: 12, deletions: 0, changedFiles: 1 },
  {
    reviewDecision: null,
    checks: {
      pasaron: 0,
      fallaron: 0,
      corriendo: 0,
      pendientes: 3,
      omitidos: 0,
      total: 3,
      primeroQueFallo: null
    }
  }
)

export const prMergeado = con(
  { ...pr, state: 'merged', reviewRequests: [] },
  {
    comentarios: 9,
    reviewDecision: 'APPROVED',
    latestReviews: [
      { login: 'ana-dev', state: 'APPROVED', avatarUrl: null },
      { login: 'lucas-p', state: 'APPROVED', avatarUrl: null }
    ],
    checks: {
      pasaron: 64,
      fallaron: 0,
      corriendo: 0,
      pendientes: 0,
      omitidos: 4,
      total: 68,
      primeroQueFallo: null
    }
  }
)

export const prCerrado = con({ ...pr, state: 'closed', reviewRequests: [] }, {})

/** Sólo lo que trae REST: sin extra, sin números de cambios, sin autor. */
export const prDatosParciales: GitHubWorkItem = {
  id: 'pr:53',
  type: 'pr',
  number: 53,
  title: 'Datos a medias: esta tarjeta no tiene checks, revisión ni tamaño',
  state: 'open',
  url: 'https://github.com/tienda-ejemplo/tienda-web/pull/53',
  labels: [],
  updatedAt: '',
  author: null,
  repoId: 'repo-ejemplo'
}
