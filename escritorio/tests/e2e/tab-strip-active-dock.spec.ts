import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/dolphin-app'
import { waitForSessionReady, waitForActiveWorktree, ensureTerminalVisible } from './helpers/store'

const STRIP = '.terminal-tab-strip'

function slotSelector(tabId: string): string {
  return `${STRIP} > [data-tab-strip-slot="${tabId}"]`
}

async function createBackgroundTerminalTab(page: Page, worktreeId: string): Promise<string> {
  return page.evaluate(
    (wId) =>
      window.__store!.getState().createTab(wId, undefined, undefined, { activate: false }).id,
    worktreeId
  )
}

async function readStripSlotIds(page: Page): Promise<string[]> {
  return page.$$eval(`${STRIP} > [data-tab-strip-slot]`, (nodes) =>
    nodes.map((node) => node.getAttribute('data-tab-strip-slot') ?? '')
  )
}

/** Where `tabId` is drawn relative to the strip's visible viewport, in px. */
async function readSlotViewportSpan(
  page: Page,
  tabId: string
): Promise<{ left: number; right: number; viewLeft: number; viewRight: number }> {
  return page.evaluate(
    ({ strip, slot }) => {
      const stripEl = document.querySelector<HTMLElement>(strip)!
      const slotRect = document.querySelector<HTMLElement>(slot)!.getBoundingClientRect()
      const viewLeft = stripEl.getBoundingClientRect().left + stripEl.clientLeft
      return {
        left: slotRect.left,
        right: slotRect.right,
        viewLeft,
        viewRight: viewLeft + stripEl.clientWidth
      }
    },
    { strip: STRIP, slot: slotSelector(tabId) }
  )
}

async function isSlotInView(page: Page, tabId: string): Promise<boolean> {
  const span = await readSlotViewportSpan(page, tabId)
  return span.left >= span.viewLeft - 1 && span.right <= span.viewRight + 1
}

async function nextFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(async (frames) => {
    for (let i = 0; i < frames; i++) {
      await new Promise(requestAnimationFrame)
    }
  }, count)
}

test.describe('Tab strip active-tab dock', () => {
  test.beforeEach(async ({ appPage }) => {
    await waitForSessionReady(appPage)
    await waitForActiveWorktree(appPage)
    await ensureTerminalVisible(appPage)
  })

  for (const edge of ['start', 'end'] as const) {
    test(`keeps inactive tabs clickable in a strip too narrow for the ${edge} dock`, async ({
      appPage
    }) => {
      const worktreeId = await waitForActiveWorktree(appPage)
      for (let i = 0; i < 3; i++) {
        await createBackgroundTerminalTab(appPage, worktreeId)
      }
      const ids = await readStripSlotIds(appPage)
      const activeTabId = (edge === 'start' ? ids.at(0) : ids.at(-1))!
      const inactiveTabId = (edge === 'start' ? ids.at(-1) : ids.at(0))!
      const activeTab = appPage.locator(
        `${slotSelector(activeTabId)} [data-testid="sortable-tab"]`
      )
      const inactiveTab = appPage.locator(
        `${slotSelector(inactiveTabId)} [data-testid="sortable-tab"]`
      )
      await activeTab.click()

      const strip = appPage.locator(STRIP).first()
      await strip.evaluate((el) => {
        el.style.maxWidth = '200px'
      })
      await expect(strip).toHaveAttribute('data-active-tab-dock-disabled', '')
      await strip.evaluate((el, side) => {
        el.scrollLeft = side === 'start' ? el.scrollWidth : 0
      }, edge)
      await expect.poll(() => isSlotInView(appPage, inactiveTabId)).toBe(true)
      await inactiveTab.click()
      await expect(inactiveTab).toHaveAttribute('data-active', 'true')
      await activeTab.locator('[data-tab-close-button]').click()
      await expect(activeTab).toHaveCount(0)

      await strip.evaluate((el) => {
        el.style.maxWidth = '400px'
      })
      await expect(strip).not.toHaveAttribute('data-active-tab-dock-disabled')
      await strip.evaluate((el, side) => {
        el.scrollLeft = side === 'start' ? 0 : el.scrollWidth
      }, edge)
      await expect(strip).toHaveAttribute(
        'data-active-tab-docked',
        edge === 'start' ? 'end' : 'start'
      )
      expect(await isSlotInView(appPage, inactiveTabId)).toBe(true)
    })
  }

  test('keeps inactive tabs clickable after cancelling a drag that scrolled a narrow strip', async ({
    appPage
  }) => {
    const worktreeId = await waitForActiveWorktree(appPage)
    for (let i = 0; i < 3; i++) {
      await createBackgroundTerminalTab(appPage, worktreeId)
    }
    const ids = await readStripSlotIds(appPage)
    const activeSlot = appPage.locator(slotSelector(ids[0]))
    const activeTab = activeSlot.locator('[data-testid="sortable-tab"]')
    const inactiveTab = appPage.locator(`${slotSelector(ids[1])} [data-testid="sortable-tab"]`)
    await activeTab.click()

    const strip = appPage.locator(STRIP).first()
    await strip.evaluate((el) => {
      el.style.maxWidth = '200px'
    })
    await expect(strip).toHaveAttribute('data-active-tab-dock-disabled', '')
    await strip.evaluate((el) => {
      el.scrollLeft = 0
    })
    await expect.poll(() => isSlotInView(appPage, ids[0])).toBe(true)

    const box = (await activeTab.boundingBox())!
    const y = box.y + box.height / 2
    await appPage.mouse.move(box.x + 20, y)
    await appPage.mouse.down()
    await appPage.mouse.move(box.x + 34, y)
    await appPage.mouse.move(box.x + 38, y)
    await expect(strip.locator('[data-active-tab-dock]')).toHaveCount(0)

    // Hidden-window drag overlays can intercept native wheel input before it reaches the strip.
    await strip.evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 144, cancelable: true }))
    })
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(144)
    await nextFrames(appPage, 2)
    await appPage.evaluate(() => window.dispatchEvent(new Event('blur')))
    await appPage.mouse.up()

    await expect(activeSlot).toHaveAttribute('data-active-tab-dock', '')
    await expect(strip).toHaveAttribute('data-active-tab-dock-disabled', '')
    await inactiveTab.click()
    await expect(inactiveTab).toHaveAttribute('data-active', 'true')
  })
})
