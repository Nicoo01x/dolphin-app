import { test, expect } from './helpers/dolphin-app'
import { waitForSessionReady } from './helpers/store'

test.describe('Settings sidebar search on the Shortcuts pane', () => {
  test('pane-title-only query keeps rows visible and local search usable', async ({ appPage }) => {
    await waitForSessionReady(appPage)

    await appPage.evaluate(async () => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      // Pin English instead of following the host locale.
      await store.getState().updateSettings({ uiLanguage: 'en' })
      store.getState().openSettingsPage()
    })

    const searchInput = appPage.getByPlaceholder('Search settings')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toBeFocused()
    await searchInput.fill('shortcuts')

    await expect(appPage.getByRole('heading', { name: 'Shortcuts', exact: true })).toBeVisible()

    // Regression: a pane-title-only query used to blank the whole list (0/112).
    await expect(appPage.getByText('Go to File', { exact: true })).toBeVisible()
    await expect(appPage.getByText('No shortcuts match those filters.')).not.toBeVisible()

    // Keep pane search working with a global query; the old empty base list broke their intersection.
    const localSearch = appPage.getByPlaceholder('Search command or keys')
    await localSearch.fill('go to')
    await expect(appPage.getByText('Go to File', { exact: true })).toBeVisible()
    await expect(appPage.getByText('Force Reload', { exact: true })).not.toBeVisible()

    await localSearch.clear()
    await searchInput.fill('worktree')
    await expect(appPage.getByText('Create worktree', { exact: true })).toBeVisible()
    await expect(appPage.getByText('Go to File', { exact: true })).not.toBeVisible()
  })
})
