import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/dolphin-app'
import { SIDEBAR_INPUTS_BUILD } from './helpers/sidebar-inputs-build'
import { waitForSessionReady } from './helpers/store'

async function setCollapsed(
  page: Page,
  key: string,
  collapsed: boolean,
  writer: string,
  seq: number
) {
  return page.evaluate((params) => window.api.runtime.call({ method: 'ui.setCollapsed', params }), {
    key,
    collapsed,
    opId: { writer, seq }
  })
}

function windowCollapsed(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window.__store?.getState().collapsedGroups ?? [])].sort())
}

test.describe('switch on', () => {
  test.skip(
    !SIDEBAR_INPUTS_BUILD,
    'ui.setCollapsed exists only in an DOLPHIN_SIDEBAR_INPUTS=main build'
  )

  test('ui.setCollapsed changes one section without undoing the window or a newer writer', async ({
    appPage
  }) => {
    await waitForSessionReady(appPage)

    // The window folds a section through its own whole-set write.
    await appPage.evaluate(() => window.__store?.getState().toggleCollapsedGroup('e2e:window'))
    expect(await setCollapsed(appPage, 'e2e:phone', true, 'phone-a', 1)).toMatchObject({
      ok: true,
      result: { collapsed: true, applied: true }
    })
    await expect.poll(() => windowCollapsed(appPage)).toEqual(['e2e:phone', 'e2e:window'])

    // Another writer unfolds it; phone A's retry of its already-applied fold must not undo that.
    await setCollapsed(appPage, 'e2e:phone', false, 'phone-b', 1)
    expect(await setCollapsed(appPage, 'e2e:phone', true, 'phone-a', 1)).toMatchObject({
      ok: true,
      result: { collapsed: false, applied: false }
    })
    await expect.poll(() => windowCollapsed(appPage)).toEqual(['e2e:window'])
  })
})

test.describe('switch off', () => {
  test.skip(SIDEBAR_INPUTS_BUILD, 'checks the shipped method set')

  test('a switch-off build registers no ui.setCollapsed', async ({ appPage }) => {
    await waitForSessionReady(appPage)
    const response = await setCollapsed(appPage, 'e2e:phone', true, 'phone-a', 1)
    expect(response).toMatchObject({ ok: false, error: { code: 'method_not_found' } })
    expect(await windowCollapsed(appPage)).not.toContain('e2e:phone')
  })
})
