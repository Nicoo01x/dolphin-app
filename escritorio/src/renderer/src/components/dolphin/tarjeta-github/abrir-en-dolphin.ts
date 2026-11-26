import { useAppStore } from '@/store'
import { buildGitHubRepoUrl, type GitHubIssueOrPRLink } from '../../../../../shared/github/links'
import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import type { Repo } from '../../../../../shared/repo-types'
import { readCachedGitHubLinkPreview } from '../../native-chat/links/previews/native-chat-github-link-preview'

/**
 * Un issue o un PR del chat se abre en Tareas, no en el navegador (Nico, 26/11/2026: «que diga
 * abrir en Dolphin, no en el navegador»). Ctrl/Cmd+clic sigue yendo al navegador.
 *
 * Lo que ya trajo la tarjeta se reusa entero; si todavía no llegó, alcanza con lo que dice el link:
 * Tareas vuelve a pedir el detalle al abrirlo, como hace la tarjeta del espacio de trabajo.
 */
export function workItemParaTareas(
  repo: Pick<Repo, 'id'>,
  link: GitHubIssueOrPRLink,
  conocido: GitHubWorkItem | null
): GitHubWorkItem {
  if (conocido) {
    return { ...conocido, repoId: repo.id }
  }
  const base =
    buildGitHubRepoUrl(link.slug) ?? `https://github.com/${link.slug.owner}/${link.slug.repo}`
  const url = `${base}/${link.type === 'pr' ? 'pull' : 'issues'}/${link.number}`
  return {
    id: url,
    type: link.type,
    number: link.number,
    title: `#${link.number}`,
    state: 'open',
    url,
    labels: [],
    updatedAt: new Date().toISOString(),
    author: null,
    repoId: repo.id
  }
}

export function abrirEnDolphin(repo: Repo, link: GitHubIssueOrPRLink): void {
  abrirWorkItemEnDolphin(
    repo.id,
    workItemParaTareas(repo, link, readCachedGitHubLinkPreview(repo, link))
  )
}

export function abrirWorkItemEnDolphin(repoId: string, item: GitHubWorkItem): void {
  useAppStore.getState().openTaskPage({
    taskSource: 'github',
    preselectedRepoId: repoId,
    openGitHubWorkItem: { ...item, repoId }
  })
}

/** Sólo el clic simple abre en Dolphin; con un modificador queda lo de siempre (el navegador). */
export function esClicSimple(
  evento: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>
): boolean {
  return (
    evento.button === 0 && !evento.ctrlKey && !evento.metaKey && !evento.shiftKey && !evento.altKey
  )
}
