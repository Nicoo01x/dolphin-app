import { beforeEach, describe, expect, it, vi } from 'vitest'

const openTaskPage = vi.fn()
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ openTaskPage }) } }))
vi.mock('../../native-chat/links/previews/native-chat-github-link-preview', () => ({
  readCachedGitHubLinkPreview: () => null
}))

const { abrirWorkItemEnDolphin, esClicSimple, workItemParaTareas } =
  await import('./abrir-en-dolphin')

const link = { slug: { owner: 'o', repo: 'goin' }, number: 402, type: 'pr' as const }

beforeEach(() => openTaskPage.mockReset())

describe('abrir un issue o PR del chat en Dolphin', () => {
  it('sin detalle todavía, arma lo mínimo desde el link para que Tareas lo pida', () => {
    const item = workItemParaTareas({ id: 'repo-1' }, link, null)
    expect(item).toMatchObject({
      type: 'pr',
      number: 402,
      title: '#402',
      url: 'https://github.com/o/goin/pull/402',
      repoId: 'repo-1'
    })
  })

  it('con el detalle de la tarjeta, lo reusa entero y le pone el repo', () => {
    const conocido = workItemParaTareas({ id: 'otro' }, link, null)
    const item = workItemParaTareas({ id: 'repo-1' }, link, { ...conocido, title: 'El PR' })
    expect(item.title).toBe('El PR')
    expect(item.repoId).toBe('repo-1')
  })

  it('abre la página de Tareas con el work item y el repo elegido', () => {
    abrirWorkItemEnDolphin('repo-1', workItemParaTareas({ id: 'repo-1' }, link, null))
    expect(openTaskPage).toHaveBeenCalledWith({
      taskSource: 'github',
      preselectedRepoId: 'repo-1',
      openGitHubWorkItem: expect.objectContaining({ number: 402, repoId: 'repo-1' })
    })
  })

  it('sólo el clic simple; con Ctrl, Cmd, Shift o Alt queda el navegador', () => {
    const base = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }
    expect(esClicSimple(base)).toBe(true)
    expect(esClicSimple({ ...base, ctrlKey: true })).toBe(false)
    expect(esClicSimple({ ...base, metaKey: true })).toBe(false)
    expect(esClicSimple({ ...base, shiftKey: true })).toBe(false)
    expect(esClicSimple({ ...base, button: 1 })).toBe(false)
  })
})
