// A Codex async question skipped (Ctrl+]) in a managed SSH terminal clears on the desktop: dolphind on
// the host tracks the question, so the desktop must hand the keystroke to it.
import { expect, test } from './helpers/dolphin-app'
import {
  echoMarker,
  launchManagedWorkspace,
  openTerminalTab,
  skipUnlessManagedDockerHost,
  typeInTerminal,
  withManagedHost
} from './helpers/dolphind-managed-workspace'
import { quotePosixShell } from '../../src/shared/shell/launch/shell-argument-quoting'

skipUnlessManagedDockerHost()
test.skip(process.platform === 'win32', 'The Docker SSH host uses POSIX tooling')

function postCodexHook(payload: Record<string, unknown>): string {
  return [
    'curl -sS -X POST "http://127.0.0.1:${DOLPHIN_AGENT_HOOK_PORT}/hook/codex"',
    '-H "X-Dolphin-Agent-Hook-Token: ${DOLPHIN_AGENT_HOOK_TOKEN}"',
    '--data-urlencode "paneKey=${DOLPHIN_PANE_KEY}" --data-urlencode "tabId=${DOLPHIN_TAB_ID}"',
    '--data-urlencode "worktreeId=${DOLPHIN_WORKTREE_ID}" --data-urlencode "env=${DOLPHIN_AGENT_HOOK_ENV}"',
    '--data-urlencode "version=${DOLPHIN_AGENT_HOOK_VERSION}"',
    `--data-urlencode ${quotePosixShell(`payload=${JSON.stringify(payload)}`)} >>/tmp/dolphin-hook.log 2>&1`
  ].join(' ')
}

test('skipping a Codex async question in a managed SSH terminal clears its waiting row', async (// oxlint-disable-next-line no-empty-pattern -- Owns its app launch through a restart session.
{}, testInfo) => {
  // Provisions a Docker SSH host and deploys dolphind before the app launches.
  test.setTimeout(10 * 60_000)
  await withManagedHost(testInfo, async (fixture) => {
    const { page, seeded } = await launchManagedWorkspace(fixture)
    const tabId = await openTerminalTab(page, seeded.worktreeId)
    await echoMarker(page, tabId, 'SKIP_READY')
    const prompt = `dolphin codex skip ${Date.now()}`
    const ask = {
      hook_event_name: 'PreToolUse',
      turn_id: 'turn-1',
      tool_name: 'request_user_input_async',
      tool_use_id: 'call_1',
      tool_input: { questions: [{ title: 'Which database?', options: ['Postgres', 'SQLite'] }] }
    }
    // Backgrounded: a foreground post ends the shell command, which rightly clears the turn.
    await typeInTerminal(
      page,
      tabId,
      `( sleep 0.2; ${[
        postCodexHook({ hook_event_name: 'UserPromptSubmit', turn_id: 'turn-1', prompt }),
        postCodexHook(ask),
        postCodexHook({
          ...ask,
          hook_event_name: 'PostToolUse',
          tool_response: '{"accepted":true}'
        })
      ].join('; ')} ) &`
    )
    const rowState = () =>
      page.evaluate(
        (prompt) =>
          Object.values(window.__store?.getState().agentStatusByPaneKey ?? {}).find(
            (entry) => entry.prompt === prompt && entry.agentType === 'codex'
          )?.state ?? null,
        prompt
      )
    await expect
      .poll(rowState, { timeout: 30_000, message: 'the open question never reached the desktop' })
      .toBe('waiting')

    // Codex's TUI drops the question on Ctrl+] and reports nothing; only the keystroke tells.
    await page.keyboard.press('Control+BracketRight')
    await expect
      .poll(rowState, { timeout: 30_000, message: 'the skipped question stayed pending' })
      .toBe('working')
    await page.screenshot({ path: testInfo.outputPath('codex-question-skipped.png') })
  })
})
