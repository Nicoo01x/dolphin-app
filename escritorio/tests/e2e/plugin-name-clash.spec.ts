/**
 * Invariant: two plugins that share a name, and themes that share a name, are told apart by the
 * Dolphin-derived publisher in the theme picker and the plugin list.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/dolphin-app'
import { disablePluginSystem, enableDevPlugins } from './helpers/plugin-smoke'

async function writeCatppuccinPlugin(root: string, publisher: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'dolphin-plugin.json'),
    JSON.stringify({
      manifestVersion: 1,
      id: 'catppuccin',
      publisher,
      name: 'Catppuccin for Dolphin',
      version: '1.0.0',
      engines: { dolphin: '>=1.0.0' },
      pluginApi: 1,
      contributes: { themes: [{ id: 'mocha', title: 'Catppuccin Mocha', path: 'app.json' }] }
    })
  )
  await writeFile(
    join(root, 'app.json'),
    JSON.stringify({
      base: 'dark',
      tokens: { '--background': '#1e1e2e', '--foreground': '#cdd6f4' }
    })
  )
}

async function openSettingsPane(page: Page, pane: 'appearance' | 'plugins'): Promise<void> {
  await page.evaluate((target) => {
    const state = window.__store?.getState()
    state?.openSettingsTarget({ pane: target, repoId: null })
    state?.openSettingsPage()
  }, pane)
  await expect(page.locator(`[data-settings-section="${pane}"]`)).toBeVisible()
}

test('plugins and themes sharing a name show their publishers', async ({ appPage }, testInfo) => {
  const root = await mkdtemp(join(tmpdir(), 'dolphin-name-clash-'))
  const proofDir = process.env.DOLPHIN_NAME_CLASH_PROOF_DIR
  try {
    await writeCatppuccinPlugin(join(root, 'acme'), 'acme')
    await writeCatppuccinPlugin(join(root, 'vale-c'), 'vale-c')
    await enableDevPlugins(appPage, [join(root, 'acme'), join(root, 'vale-c')])

    await openSettingsPane(appPage, 'appearance')
    await appPage.getByRole('combobox', { name: 'Dark theme', exact: true }).click()
    const options = appPage.getByRole('option', { name: /^Catppuccin Mocha/ })
    await expect(options).toHaveCount(2)
    await appPage.screenshot({
      path: join(proofDir ?? testInfo.outputPath(), 'theme-picker.png')
    })
    await expect(appPage.getByRole('option', { name: 'Catppuccin Mocha (acme)' })).toBeVisible()
    await expect(appPage.getByRole('option', { name: 'Catppuccin Mocha (vale-c)' })).toBeVisible()
    await appPage.keyboard.press('Escape')

    await openSettingsPane(appPage, 'plugins')
    const section = appPage.locator('[data-settings-section="plugins"]')
    await expect(section.getByText(/^Catppuccin for Dolphin/).first()).toBeVisible()
    await appPage.screenshot({
      path: join(proofDir ?? testInfo.outputPath(), 'plugin-list.png')
    })
    await expect(section.getByText('Catppuccin for Dolphin (acme)', { exact: true })).toBeVisible()
    await expect(section.getByText('Catppuccin for Dolphin (vale-c)', { exact: true })).toBeVisible()
  } finally {
    await disablePluginSystem(appPage).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})
