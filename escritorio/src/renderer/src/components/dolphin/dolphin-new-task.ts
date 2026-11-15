import type { Repo } from '../../../../shared/repo-types'

export function textoDeNuevaTareaDolphin(title: string, body: string | undefined, url: string): string {
  const cuerpo = (body ?? '').slice(0, 4000)
  return `${title}\n\n${cuerpo}${cuerpo ? '\n\n' : ''}${url}`
}

export function destinoDolphinDeRepo(repo: Pick<Repo, 'path' | 'displayName'>): {
  path: string
  label: string
} {
  return { path: repo.path, label: repo.displayName }
}
