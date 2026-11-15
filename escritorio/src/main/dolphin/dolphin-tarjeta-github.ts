/**
 * La vista previa de la tarjeta de GitHub del chat de Dolphin: la de la base (una llamada REST) más
 * una consulta GraphQL con lo que REST no trae —checks, revisión, hito, por qué se cerró un issue y
 * el PR que lo cierra—. Las dos salen juntas, así la tarjeta tarda lo mismo que antes.
 *
 * Va por `gh`, con la sesión que la persona ya tiene y contra el host del link (un GitHub
 * Enterprise se consulta en su host, nunca en github.com). Sólo la llama la tarjeta: la consulta
 * de títulos de links en segundo plano sigue con la llamada liviana de la base.
 */
import {
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext,
  type LocalGitExecOptions
} from '../github/gh-utils'
import { githubHostExecOptions, type GitHubApiRepository } from '../github/github-api-repository'
import { noteRepositoryRateLimitSpend, repositoryRateLimitGuard } from '../github/rate-limit'
import { fetchWorkItemPreview } from '../github/client/fetch/work-item-fetch'
import type { MainWorkItem } from '../github/client/map/work-item-field-coercion'
import {
  conExtraDeTarjeta,
  extraDesdeGraphql,
  type DolphinExtraDeTarjeta
} from '../../shared/dolphin-tarjeta-github'

const DEL_ISSUE_BASICO = 'milestone { title dueOn }'
// stateReason y closedByPullRequestsReferences no existen en los GitHub Enterprise viejos: si la
// consulta entera falla por ellos, se repite sin ellos (ver leerExtra).
const DEL_ISSUE_COMPLETO = `${DEL_ISSUE_BASICO} stateReason
  closedByPullRequestsReferences(first: 3, includeClosedPrs: true) {
    nodes { number title state isDraft }
  }`

const DEL_PR = `milestone { title dueOn }
  reviewDecision
  comments { totalCount }
  latestReviews(first: 10) { nodes { state author { login avatarUrl } } }
  commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) {
    totalCount
    nodes {
      __typename
      ... on CheckRun { name status conclusion }
      ... on StatusContext { context state }
    }
  } } } } }`

export function consultaDeTarjeta(completa: boolean): string {
  return `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issueOrPullRequest(number: $number) {
      __typename
      ... on Issue { ${completa ? DEL_ISSUE_COMPLETO : DEL_ISSUE_BASICO} }
      ... on PullRequest { ${DEL_PR} }
    }
  }
}`
}

type OpcionesGh = ReturnType<typeof ghRepoExecOptions> & { host?: string }

async function consultar(
  repositorio: GitHubApiRepository,
  numero: number,
  opciones: OpcionesGh,
  completa: boolean
): Promise<DolphinExtraDeTarjeta | null> {
  noteRepositoryRateLimitSpend(repositorio, 'graphql', 1, opciones)
  const { stdout } = await ghExecFileAsync(
    [
      'api',
      'graphql',
      '-f',
      `query=${consultaDeTarjeta(completa)}`,
      '-f',
      `owner=${repositorio.owner}`,
      '-f',
      `repo=${repositorio.repo}`,
      '-F',
      `number=${numero}`
    ],
    opciones
  )
  const respuesta = JSON.parse(stdout) as {
    data?: { repository?: { issueOrPullRequest?: unknown } | null } | null
  }
  return extraDesdeGraphql(respuesta.data?.repository?.issueOrPullRequest)
}

/** Nunca falla: sin extra, la tarjeta se dibuja con lo que trajo REST. */
export async function leerExtra(
  repositorio: GitHubApiRepository,
  numero: number,
  opciones: OpcionesGh
): Promise<DolphinExtraDeTarjeta | null> {
  if (repositoryRateLimitGuard(repositorio, 'graphql', opciones).blocked) {
    return null
  }
  try {
    return await consultar(repositorio, numero, opciones, true)
  } catch {
    try {
      return await consultar(repositorio, numero, opciones, false)
    } catch {
      return null
    }
  }
}

/** Misma firma que `fetchWorkItemPreview` de la base, para cambiar sólo el nombre en la llamada. */
export async function fetchVistaPreviaDeTarjeta(
  repoPath: string,
  ownerRepo: GitHubApiRepository,
  number: number,
  type: 'issue' | 'pr',
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<MainWorkItem | null> {
  const opciones = {
    ...ghRepoExecOptions(githubRepoContext(repoPath, connectionId, localGitOptions)),
    ...githubHostExecOptions(ownerRepo)
  }
  const [item, extra] = await Promise.all([
    fetchWorkItemPreview(repoPath, ownerRepo, number, type, connectionId, localGitOptions),
    leerExtra(ownerRepo, number, opciones)
  ])
  return item ? conExtraDeTarjeta(item, extra) : item
}
