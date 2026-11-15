import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from './helpers/dolphin-app'
import { waitForSessionReady } from './helpers/store'
import { openSidebarProjectDialog } from './helpers/sidebar-project-dialog'
import { runProcess } from '@dolphin/process-host'

test.use({ seedTestRepo: false })

async function runFixtureGit(spec: Parameters<typeof runProcess>[0]): Promise<void> {
  const result = await runProcess(spec)
  expect(result.code, result.stderr).toBe(0)
}

test('Add Project opens a folder and preserves its workspace when Git appears', async ({
  electronApp,
  appPage,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  const folderPath = realpathSync(mkdtempSync(join(tmpdir(), 'dolphin-folder-upgrade-')))
  registerPostElectronShutdownCleanup(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(folderPath, { recursive: true, force: true })
  })
  await waitForSessionReady(appPage)
  await electronApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path], bookmarks: [] })
  }, folderPath)
  await openSidebarProjectDialog(appPage)
  await appPage.getByRole('button', { name: /Browse folder/i }).click()
  const dialog = appPage.getByRole('dialog', { name: 'Open as Folder' })
  await expect(dialog).toBeVisible()
  await appPage.screenshot({ path: testInfo.outputPath('open-folder.png') })
  await dialog.getByRole('button', { name: 'Open as Folder', exact: true }).click()
  await expect
    .poll(() => appPage.evaluate(() => window.__store!.getState().repos[0]?.kind))
    .toBe('folder')
  await expect
    .poll(() =>
      appPage.evaluate(() => {
        const state = window.__store!.getState()
        return state.worktreesByRepo[state.repos[0].id]?.[0]?.id
      })
    )
    .toBeTruthy()
  const before = await appPage.evaluate(() => {
    const state = window.__store!.getState()
    const repo = state.repos[0]
    return { repoId: repo.id, worktreeId: state.worktreesByRepo[repo.id]?.[0]?.id }
  })
  await appPage.screenshot({ path: testInfo.outputPath('folder-workspace.png') })
  await runFixtureGit({ program: 'git', args: ['init', folderPath] })
  await expect
    .poll(() => appPage.evaluate(() => window.__store!.getState().repos[0]?.kind), {
      timeout: 30_000
    })
    .toBe('git')
  await expect
    .poll(
      () =>
        appPage.evaluate(() => {
          const state = window.__store!.getState()
          const repo = state.repos[0]
          return { repoId: repo.id, worktreeId: state.worktreesByRepo[repo.id]?.[0]?.id }
        }),
      { timeout: 30_000 }
    )
    .toEqual(before)
  await appPage.screenshot({ path: testInfo.outputPath('git-workspace.png') })
})
