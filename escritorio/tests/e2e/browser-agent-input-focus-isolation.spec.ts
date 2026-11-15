/**
 * Agent browser input must reach its page without touching the user's keyboard focus (#20595).
 * Runs hidden; browser-agent-input-focus-isolation-native.spec.ts repeats it in a visible window.
 */

import { test } from './helpers/dolphin-app'
import {
  runAgentClicksScenario,
  runAgentCrossSiteFrameScenario,
  runAgentKeysScenario,
  runAgentShortcutsScenario
} from './helpers/browser-agent-focus-scenarios'
import { runAgentClickDuringUserCompositionScenario } from './helpers/browser-agent-composition-scenario'

test('agent keys and text reach the page without leaving the user’s terminal', async ({
  appPage
}) => {
  test.setTimeout(120_000)
  await runAgentKeysScenario(appPage)
})

test('agent clicks and presses reach the page without leaving the user’s terminal', async ({
  appPage
}) => {
  test.setTimeout(120_000)
  await runAgentClicksScenario(appPage)
})

test('agent shortcut keys stay in the page instead of running Dolphin shortcuts', async ({
  appPage
}) => {
  test.setTimeout(120_000)
  await runAgentShortcutsScenario(appPage)
})

test('agent keys and text reach a focused cross-site frame without moving the user’s focus', async ({
  appPage
}) => {
  test.setTimeout(120_000)
  await runAgentCrossSiteFrameScenario(appPage)
})

test('an agent click is refused while the user composes with an IME in the terminal', async ({
  appPage
}) => {
  test.setTimeout(120_000)
  await runAgentClickDuringUserCompositionScenario(appPage)
})
