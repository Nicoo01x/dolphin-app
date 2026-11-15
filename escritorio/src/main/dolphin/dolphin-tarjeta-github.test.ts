import { beforeEach, describe, expect, it, vi } from 'vitest'

const gh = vi.hoisted(() => ({
  exec: vi.fn(),
  preview: vi.fn(),
  bloqueado: false
}))

vi.mock('../github/gh-utils', () => ({
  ghExecFileAsync: gh.exec,
  ghRepoExecOptions: () => ({ cwd: '/repo' }),
  githubRepoContext: (repoPath: string) => ({ repoPath })
}))
vi.mock('../github/client/fetch/work-item-fetch', () => ({ fetchWorkItemPreview: gh.preview }))
vi.mock('../github/rate-limit', () => ({
  repositoryRateLimitGuard: () => ({ blocked: gh.bloqueado }),
  noteRepositoryRateLimitSpend: () => {}
}))

import { consultaDeTarjeta, fetchVistaPreviaDeTarjeta } from './dolphin-tarjeta-github'

const enterprise = { owner: 'acme', repo: 'web', host: 'github.acme.com' }
const item = { id: 'issue:4', type: 'issue', number: 4, title: 'x' }
const respuesta = (nodo: unknown) => ({
  stdout: JSON.stringify({ data: { repository: { issueOrPullRequest: nodo } } })
})

beforeEach(() => {
  gh.exec.mockReset()
  gh.preview.mockReset()
  gh.bloqueado = false
  gh.preview.mockResolvedValue(item)
})

describe('fetchVistaPreviaDeTarjeta', () => {
  it('suma el extra a la vista previa de la base y consulta en el host del link', async () => {
    gh.exec.mockResolvedValue(respuesta({ __typename: 'Issue', stateReason: 'COMPLETED' }))
    const resultado = await fetchVistaPreviaDeTarjeta('/repo', enterprise, 4, 'issue')
    expect(resultado).toEqual({ ...item, dolphinTarjeta: { motivoDeCierre: 'completado' } })
    expect(gh.exec).toHaveBeenCalledOnce()
    expect(gh.exec.mock.calls[0]![1]).toMatchObject({ host: 'github.acme.com' })
    expect(gh.exec.mock.calls[0]![0]).toContain('number=4')
  })

  it('si la consulta completa falla (un Enterprise viejo), repite sin los campos nuevos', async () => {
    gh.exec
      .mockRejectedValueOnce(new Error("Field 'stateReason' doesn't exist"))
      .mockResolvedValueOnce(respuesta({ __typename: 'Issue', milestone: { title: 'v2' } }))
    const resultado = await fetchVistaPreviaDeTarjeta('/repo', enterprise, 4, 'issue')
    expect(resultado).toMatchObject({ dolphinTarjeta: { hito: { titulo: 'v2', vence: null } } })
    const segunda = String(gh.exec.mock.calls[1]![0].find((a: string) => a.startsWith('query=')))
    expect(segunda).not.toContain('stateReason')
  })

  it('si GraphQL no contesta, la tarjeta igual tiene lo de la base', async () => {
    gh.exec.mockRejectedValue(new Error('boom'))
    expect(await fetchVistaPreviaDeTarjeta('/repo', enterprise, 4, 'issue')).toEqual(item)
  })

  it('con el cupo de GraphQL casi agotado no gasta la consulta', async () => {
    gh.bloqueado = true
    expect(await fetchVistaPreviaDeTarjeta('/repo', enterprise, 4, 'issue')).toEqual(item)
    expect(gh.exec).not.toHaveBeenCalled()
  })

  it('si la base no encontró nada, no inventa un item con sólo el extra', async () => {
    gh.preview.mockResolvedValue(null)
    gh.exec.mockResolvedValue(respuesta({ __typename: 'Issue', stateReason: 'COMPLETED' }))
    expect(await fetchVistaPreviaDeTarjeta('/repo', enterprise, 4, 'issue')).toBeNull()
  })
})

describe('consultaDeTarjeta', () => {
  it('la básica no pide lo que un GitHub Enterprise viejo no tiene', () => {
    expect(consultaDeTarjeta(true)).toContain('closedByPullRequestsReferences')
    expect(consultaDeTarjeta(false)).not.toContain('closedByPullRequestsReferences')
    expect(consultaDeTarjeta(false)).toContain('statusCheckRollup')
  })
})
