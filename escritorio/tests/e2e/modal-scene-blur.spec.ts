import { test, expect } from './helpers/dolphin-app'
import { openSidebarProjectDialog } from './helpers/sidebar-project-dialog'

test.use({ seedTestRepo: false, dolphinAppExtraEnv: { DOLPHIN_BACKGROUND_LAUNCH: '1' } })

for (const theme of ['dark', 'light'] as const) {
  test(`modal surfaces blur the live scene and stay sharp (${theme})`, async ({
    electronApp,
    appPage
  }, testInfo) => {
    const windows = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => ({
        visible: window.isVisible(),
        focused: window.isFocused()
      }))
    )
    expect(windows.every((window) => !window.visible && !window.focused)).toBe(true)
    await appPage.evaluate(async (theme) => {
      await window.__store?.getState().updateSettings({ theme, uiLanguage: 'en' })
    }, theme)

    const scene = appPage.locator('.app-layout > :first-child')
    await expect(scene).toHaveCSS('filter', 'none')
    await openSidebarProjectDialog(appPage)
    await expect(scene).toHaveCSS('filter', 'blur(2px)')
    await expect(appPage.locator('.app-layout')).toHaveCSS('filter', 'none')
    const dialog = appPage.getByRole('dialog', { name: /Add a project/i })
    await expect(dialog).toHaveCSS('filter', 'none')
    await expect(dialog).toHaveCSS('backdrop-filter', 'none')
    await expect(appPage.locator('[data-slot="dialog-overlay"]')).toHaveCSS(
      'backdrop-filter',
      'none'
    )
    await appPage.screenshot({ path: testInfo.outputPath(`dialog-blur-${theme}.png`) })
    await appPage.keyboard.press('Escape')
    await expect(scene).toHaveCSS('filter', 'none')

    await appPage.getByRole('button', { name: 'Search worktrees and browser tabs' }).click()
    const palette = appPage.locator('[data-slot="command-dialog-content"]')
    await expect(palette).toBeVisible()
    await expect(scene).toHaveCSS('filter', 'blur(2px)')
    await expect(palette).toHaveCSS('filter', 'none')
    await expect(palette).toHaveCSS('backdrop-filter', 'none')
    await appPage.keyboard.press('Escape')
    await expect(scene).toHaveCSS('filter', 'none')
  })
}

test('Space window dialogs blur their scene and release it on close', async ({
  electronApp,
  appPage
}, testInfo) => {
  const spaceWindow = electronApp.waitForEvent('window')
  await appPage.evaluate(async () => {
    await window.api.workspaceSpace.openWindow?.()
  })
  const spacePage = await spaceWindow
  await spacePage.waitForFunction(() => Boolean(window.__store))
  const scene = spacePage.locator('.app-layout > :first-child')
  await expect(scene).toHaveCSS('filter', 'none')
  await spacePage.evaluate(() => {
    window.__store?.getState().openModal('preserved-branch-review', {
      branches: [{ worktreeId: 'blur-preview', branchName: 'preview' }]
    })
  })
  const dialog = spacePage.getByRole('dialog', { name: 'Review kept branches' })
  await expect(dialog).toBeVisible()
  await expect(scene).toHaveCSS('filter', 'blur(2px)')
  await expect(dialog).toHaveCSS('filter', 'none')
  await expect(dialog).toHaveCSS('backdrop-filter', 'none')
  const windows = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      visible: window.isVisible(),
      focused: window.isFocused()
    }))
  )
  expect(windows.every((window) => !window.visible && !window.focused)).toBe(true)
  await spacePage.screenshot({ path: testInfo.outputPath('space-dialog-blur.png') })
  await spacePage.keyboard.press('Escape')
  await expect(scene).toHaveCSS('filter', 'none')
})

test.describe('onboarding scene blur', () => {
  test.use({ dismissOnboarding: false })

  test('onboarding stays sharp until a nested confirmation opens', async ({ appPage }) => {
    const scene = appPage.locator('.app-layout > :first-child')
    const onboarding = appPage.locator('[data-onboarding-overlay]')
    await expect(onboarding).toBeVisible()
    await expect(scene).toHaveCSS('filter', 'blur(2px)')
    await expect(onboarding).toHaveCSS('filter', 'none')
    await expect(onboarding).toHaveCSS('backdrop-filter', 'none')
    await onboarding.getByRole('button').first().focus()
    await appPage.keyboard.press('Escape')
    const confirmation = appPage.getByRole('dialog', { name: /Skip onboarding\?/i })
    await expect(confirmation).toBeVisible()
    await expect(confirmation).toHaveCSS('filter', 'none')
    await expect(onboarding).toHaveCSS('filter', 'blur(2px)')
    await confirmation.getByRole('button', { name: /No, keep going/i }).click()
    await expect(onboarding).toHaveCSS('filter', 'none')
    await expect(scene).toHaveCSS('filter', 'blur(2px)')
  })

  test('onboarding render recovery stays within the viewport', async ({ appPage }, testInfo) => {
    await expect(appPage.locator('[data-onboarding-overlay]')).toBeVisible()
    await appPage.evaluate(async () => {
      const onboarding = await window.api.onboarding.get()
      Object.defineProperty(onboarding, 'lastCompletedStep', {
        get() {
          throw new Error('Injected onboarding render failure')
        }
      })
      window.dispatchEvent(new CustomEvent('dolphin:onboarding-reopened', { detail: onboarding }))
    })

    const crashReport = appPage.getByRole('dialog').filter({
      has: appPage.getByRole('heading', { name: 'Dolphin hit a recoverable UI error' })
    })
    await crashReport.getByRole('button', { name: 'Close', exact: true }).click()
    const recovery = appPage.getByRole('alert').filter({ hasText: 'Onboarding hit an error.' })
    const retry = recovery.getByRole('button', { name: 'Retry', exact: true })
    await expect(retry).toBeInViewport()
    await appPage.screenshot({ path: testInfo.outputPath('onboarding-render-recovery.png') })

    await appPage.evaluate(async () => {
      window.dispatchEvent(
        new CustomEvent('dolphin:onboarding-reopened', { detail: await window.api.onboarding.get() })
      )
    })
    await retry.click()
    await expect(recovery).toHaveCount(0)
    await expect(appPage.locator('[data-onboarding-overlay]')).toBeVisible()
    await expect(appPage.locator('.app-layout > :first-child')).toHaveCSS('filter', 'blur(2px)')
  })
})
