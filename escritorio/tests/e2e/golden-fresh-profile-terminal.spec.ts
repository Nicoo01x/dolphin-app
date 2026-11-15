import type { Page } from '@stablyai/playwright-test'
import { DOLPHIN_SIEMBRA_CARPETA_PERSONAL } from '../../src/shared/dolphin-brand'
import { test, expect } from './helpers/dolphin-app'
import { chooseOnboardingAgentSurface } from './helpers/onboarding-navigation'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  focusActiveTerminalInput,
  getTerminalContent,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

test.use({ dismissOnboarding: false, seedTestRepo: false })
// Dolphin: a new profile no longer gets the home folder as a project, so there is no Home terminal
// to open. A new profile is covered by golden-core-flows ("New-user golden core flow").
test.skip(
  !DOLPHIN_SIEMBRA_CARPETA_PERSONAL,
  'A new Dolphin profile does not seed the home folder (DOLPHIN_SIEMBRA_CARPETA_PERSONAL).'
)

async function completeOnboarding(page: Page): Promise<void> {
  const footer = page.locator('[data-onboarding-modal] footer')
  const heading = page.locator('[data-onboarding-modal]').getByRole('heading').first()
  for (let step = 0; step < 5; step += 1) {
    const title = await heading.innerText()
    await footer.getByRole('button', { name: /^Continue\b/ }).click()
    if (/Set up notifications/i.test(title)) {
      break
    }
    await expect(heading).not.toHaveText(title)
  }
  await expect(page.locator('[data-onboarding-overlay]')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: /Add a project/i })).toHaveCount(0)
}

test('fresh profile opens a live Home terminal @golden', async ({ electronApp, appPage }) => {
  await waitForSessionReady(appPage)
  await expect(appPage.locator('#root')).toBeVisible()
  await chooseOnboardingAgentSurface(appPage)

  await completeOnboarding(appPage)
  const homePath = await electronApp.evaluate(({ app }) => app.getPath('home'))
  await waitForActiveWorktree(appPage)
  await ensureTerminalVisible(appPage, 30_000)
  await waitForActiveTerminalManager(appPage, 30_000)
  const ptyId = await waitForActivePanePtyId(appPage, 30_000)
  await expect.poll(() => appPage.evaluate((id) => window.api.pty.hasPty(id), ptyId)).toBe(true)

  const marker = `dolphin-e2e-fresh-${Date.now()}`
  await focusActiveTerminalInput(appPage)
  await appPage.keyboard.type(`echo ${marker}`)
  await appPage.keyboard.press('Enter')
  await expect
    .poll(async () => (await getTerminalContent(appPage)).split(marker).length - 1, {
      message: 'marker should appear in both the echoed command and command output'
    })
    .toBeGreaterThanOrEqual(2)

  const begin = `dolphin-cwd-begin-${Date.now()}`
  const end = `dolphin-cwd-end-${Date.now()}`
  const normalizePath = (value: string): string => {
    const normalized = value.trim().replaceAll('\\', '/')
    const withoutTrailingSeparator =
      normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
    return process.platform === 'win32'
      ? withoutTrailingSeparator.toLowerCase()
      : withoutTrailingSeparator
  }
  await focusActiveTerminalInput(appPage)
  await appPage.keyboard.type(`echo "${begin}$(pwd)${end}"`)
  await appPage.keyboard.press('Enter')
  await expect
    .poll(
      async () => {
        const content = await getTerminalContent(appPage)
        return [...content.matchAll(new RegExp(`${begin}(.*?)${end}`, 'gs'))].map((match) =>
          normalizePath(match[1].replace(/[\r\n]/g, ''))
        )
      },
      { message: 'fresh Home terminal should report exactly the home directory' }
    )
    .toContain(normalizePath(homePath))
})
