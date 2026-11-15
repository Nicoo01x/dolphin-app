// Phone reads/saves use disk even when desktop has unsaved text; preserve the desktop edit and show its changed-on-disk banner.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import type { RuntimeMobileSessionTabsResult } from '../../src/shared/runtime-session-contracts'
import type {
  RuntimeMarkdownReadTabResult,
  RuntimeMarkdownSaveTabResult
} from '../../src/shared/mobile-markdown-document'
import { expect, test } from './helpers/dolphin-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  cleanupMarkdownFixture,
  createMarkdownFixture,
  getActiveWorktreeContext,
  openMarkdownFixture,
  waitForRichMarkdownEditor
} from './helpers/markdown-editor-fixture'
import { createDesktopMobilePairingOffer } from './helpers/paired-electron-client'
import { pairMobileClient } from './helpers/paired-mobile-client'

const DISK = '# Shared notes\n\nOn disk.\n'
const DRAFT_LINE = 'unsaved desktop line'
const PHONE = '# Shared notes\n\nSaved from the phone.\n'
const BANNER = 'This file changed on disk while you have unsaved edits.'

test('a phone saves a Markdown tab the desktop has unsaved edits in, without touching them', async ({
  appPage
}, testInfo) => {
  test.setTimeout(180_000)
  await waitForSessionReady(appPage)
  await waitForActiveWorktree(appPage)
  const context = await getActiveWorktreeContext(appPage)
  const filePath = await createMarkdownFixture(
    context,
    '.dolphin-e2e-phone-markdown',
    'desktop-draft',
    testInfo.workerIndex,
    DISK
  )
  const phone = pairMobileClient(await createDesktopMobilePairingOffer(appPage))
  try {
    await openMarkdownFixture(appPage, context, filePath)
    const editor = await waitForRichMarkdownEditor(appPage)
    await expect(editor).toContainText('On disk.')
    await editor.click()
    await appPage.keyboard.press('ControlOrMeta+End')
    await appPage.keyboard.press('Enter')
    await appPage.keyboard.insertText(DRAFT_LINE)
    const desktopDraft = () =>
      appPage.evaluate((path) => {
        const state = window.__store!.getState()
        const file = state.openFiles.find((entry) => entry.filePath === path)
        return {
          draft: file ? state.editorDrafts[file.id] : undefined,
          isDirty: file?.isDirty === true,
          externalMutation: file?.externalMutation ?? null
        }
      }, filePath)
    await expect.poll(async () => (await desktopDraft()).draft ?? '').toContain(DRAFT_LINE)
    const before = await desktopDraft()
    expect(before.isDirty).toBe(true)

    const worktree = `id:${context.worktreeId}`
    let tabId = ''
    await expect
      .poll(
        async () => {
          const listed = await phone.call<RuntimeMobileSessionTabsResult>('session.tabs.list', {
            worktree
          })
          const tab = listed.tabs.find(
            (entry) => entry.type === 'markdown' && entry.sourceFilePath === filePath
          )
          tabId = tab?.id ?? ''
          return tab?.type === 'markdown' && tab.isDirty
        },
        { timeout: 30_000, message: 'the desktop never listed its dirty Markdown tab' }
      )
      .toBe(true)

    // Poll through the debounced desktop session write that makes the tab discoverable.
    let read: RuntimeMarkdownReadTabResult | null = null
    await expect
      .poll(
        async () => {
          const response = await phone.request<RuntimeMarkdownReadTabResult>('markdown.readTab', {
            worktree,
            tabId
          })
          read = response.ok ? response.result : null
          return response.ok ? 'read' : `${response.error.code}: ${response.error.message}`
        },
        { timeout: 30_000 }
      )
      .toBe('read')
    expect(read).toMatchObject({
      tabId,
      filePath,
      content: DISK,
      source: 'file',
      isDirty: true,
      editable: true
    })

    const saved = await phone.call<RuntimeMarkdownSaveTabResult>('markdown.saveTab', {
      worktree,
      tabId,
      baseVersion: read!.version,
      content: PHONE
    })
    expect(saved).toMatchObject({ tabId, isDirty: false, content: PHONE })
    expect(readFileSync(filePath, 'utf8')).toBe(PHONE)

    await expect(appPage.getByText(BANNER)).toBeVisible({ timeout: 30_000 })
    await testInfo.attach('desktop-after-phone-save', {
      body: await appPage.screenshot(),
      contentType: 'image/png'
    })
    const after = await desktopDraft()
    expect(after).toEqual({ ...before, externalMutation: 'changed' })
    await expect(editor).toContainText(DRAFT_LINE)
    expect(readFileSync(filePath, 'utf8')).toBe(PHONE)
  } finally {
    phone.dispose()
    await cleanupMarkdownFixture(filePath)
  }
})

test("a phone reads the desktop's unsaved untitled Markdown tab read-only and never saves it", async ({
  appPage
}, testInfo) => {
  test.setTimeout(180_000)
  await waitForSessionReady(appPage)
  await waitForActiveWorktree(appPage)
  const context = await getActiveWorktreeContext(appPage)
  const phone = pairMobileClient(await createDesktopMobilePairingOffer(appPage))
  let untitledPath = ''
  try {
    untitledPath = await appPage.evaluate(async (worktreeId) => {
      const store = window.__store!
      const before = new Set(store.getState().openFiles.map((file) => file.id))
      const groupId = store.getState().activeGroupIdByWorktree[worktreeId] ?? ''
      await store.getState().openNewMarkdownInActiveWorkspace(groupId)
      const created = store
        .getState()
        .openFiles.find((file) => !before.has(file.id) && file.isUntitled === true)
      if (!created) {
        throw new Error('No untitled Markdown tab was created')
      }
      return created.filePath
    }, context.worktreeId)
    const editor = await waitForRichMarkdownEditor(appPage)
    await editor.click()
    await appPage.keyboard.insertText(DRAFT_LINE)
    await expect
      .poll(() =>
        appPage.evaluate((path) => {
          const state = window.__store!.getState()
          const file = state.openFiles.find((entry) => entry.filePath === path)
          return file?.isDirty === true && file.isUntitled === true
        }, untitledPath)
      )
      .toBe(true)

    const worktree = `id:${context.worktreeId}`
    let tabId = ''
    await expect
      .poll(
        async () => {
          const listed = await phone.call<RuntimeMobileSessionTabsResult>('session.tabs.list', {
            worktree
          })
          const tab = listed.tabs.find(
            (entry) => entry.type === 'markdown' && entry.sourceFilePath === untitledPath
          )
          tabId = tab?.id ?? ''
          return tab?.type === 'markdown' && tab.isDirty
        },
        { timeout: 30_000, message: 'the desktop never listed its dirty untitled Markdown tab' }
      )
      .toBe(true)

    // Poll through the debounced desktop session write that makes the tab discoverable.
    let read: RuntimeMarkdownReadTabResult | null = null
    await expect
      .poll(
        async () => {
          const response = await phone.request<RuntimeMarkdownReadTabResult>('markdown.readTab', {
            worktree,
            tabId
          })
          read = response.ok ? response.result : null
          return response.ok ? 'read' : `${response.error.code}: ${response.error.message}`
        },
        { timeout: 30_000 }
      )
      .toBe('read')
    const disk = readFileSync(untitledPath, 'utf8')
    expect(read).toMatchObject({
      tabId,
      filePath: untitledPath,
      content: disk,
      source: 'file',
      isDirty: true,
      editable: false,
      readOnlyReason: 'unsupported_untitled'
    })
    expect(JSON.stringify(read)).not.toContain(DRAFT_LINE)

    const save = await phone.request('markdown.saveTab', {
      worktree,
      tabId,
      baseVersion: read!.version,
      content: PHONE
    })
    expect(save).toMatchObject({ ok: false, error: { message: 'unsupported_untitled' } })
    expect(readFileSync(untitledPath, 'utf8')).toBe(disk)

    rmSync(untitledPath)
    const missingRead = await phone.request('markdown.readTab', { worktree, tabId })
    testInfo.annotations.push({
      type: 'untitled-missing-read',
      description: JSON.stringify(missingRead.ok ? missingRead.result : missingRead.error)
    })
    expect(missingRead.ok).toBe(false)
    const missingSave = await phone.request('markdown.saveTab', {
      worktree,
      tabId,
      baseVersion: read!.version,
      content: PHONE
    })
    expect(missingSave).toMatchObject({ ok: false, error: { message: 'unsupported_untitled' } })
    expect(existsSync(untitledPath)).toBe(false)
  } finally {
    phone.dispose()
    if (untitledPath) {
      await cleanupMarkdownFixture(untitledPath)
    }
  }
})
