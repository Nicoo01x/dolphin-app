import { posixCurlCommand } from '../agent-hooks/installation/scripts/hook-post-command'
import { buildHookProcessCapture } from '../agent-hooks/installation/scripts/hook-process-capture'
import {
  buildPosixHookPayloadCapture,
  POSIX_HOOK_JSON_STDIN,
  buildPosixHookSpoolLines,
  buildWindowsHookEnvironmentGuardLines
} from '../agent-hooks/installation/scripts/hook-stdin-contract'
import { ANTIGRAVITY_PRE_TOOL_USE_DECISION } from './hook-events'

export function getManagedScript(
  target: 'local' | 'posix' = 'local',
  windowsRuntimePath = process.execPath
): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      // Delayed expansion corrupts literal ! characters in paths and hook coordinates.
      'setlocal DisableDelayedExpansion',
      'if /I "%DOLPHIN_ANTIGRAVITY_EVENT%"=="Stop" (',
      '  echo {"decision":""}',
      ') else if /I "%DOLPHIN_ANTIGRAVITY_EVENT%"=="PreToolUse" (',
      `  echo ${ANTIGRAVITY_PRE_TOOL_USE_DECISION}`,
      ') else (',
      '  echo {}',
      ')',
      'if defined DOLPHIN_AGENT_HOOK_ENDPOINT if exist "%DOLPHIN_AGENT_HOOK_ENDPOINT%" call "%DOLPHIN_AGENT_HOOK_ENDPOINT%" 2>nul',
      ...buildWindowsHookEnvironmentGuardLines(),
      'set "ELECTRON_RUN_AS_NODE=1"',
      `if not defined DOLPHIN_AGENT_HOOK_NODE set "DOLPHIN_AGENT_HOOK_NODE=${windowsRuntimePath.replaceAll('%', '%%')}"`,
      '"%DOLPHIN_AGENT_HOOK_NODE%" "%~dp0dolphin-antigravity-hook-post.cjs" >nul 2>nul',
      'exit /b 0',
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    'case "$DOLPHIN_ANTIGRAVITY_EVENT" in',
    '  Stop)',
    '    printf \'{"decision":""}\\n\'',
    '    ;;',
    '  PreToolUse)',
    `    printf '${ANTIGRAVITY_PRE_TOOL_USE_DECISION}\\n'`,
    '    ;;',
    '  *)',
    '    printf "{}\\n"',
    '    ;;',
    'esac',
    // Events without stdin still need a status post.
    ...buildPosixHookPayloadCapture('empty-object', POSIX_HOOK_JSON_STDIN),
    ...buildHookProcessCapture(),
    ...buildPosixHookSpoolLines('antigravity', 'DOLPHIN_ANTIGRAVITY_EVENT'),
    'if [ -n "$DOLPHIN_AGENT_HOOK_ENDPOINT" ] && [ -r "$DOLPHIN_AGENT_HOOK_ENDPOINT" ]; then',
    '  . "$DOLPHIN_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    'if [ -z "$DOLPHIN_AGENT_HOOK_PORT" ] || [ -z "$DOLPHIN_AGENT_HOOK_TOKEN" ] || [ -z "$DOLPHIN_PANE_KEY" ]; then',
    '  spool_hook_event',
    '  exit 0',
    'fi',
    // Keep large payloads off command lines to avoid EDR false positives.
    `printf '%s' "$payload" | ${posixCurlCommand()} -sS -X POST "http://127.0.0.1:\${DOLPHIN_AGENT_HOOK_PORT}/hook/antigravity" \\`,
    '  --connect-timeout 0.5 --max-time 1.5 \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-Dolphin-Agent-Hook-Token: ${DOLPHIN_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${DOLPHIN_PANE_KEY}" \\',
    '  --data-urlencode "tabId=${DOLPHIN_TAB_ID}" \\',
    '  --data-urlencode "launchToken=${DOLPHIN_AGENT_LAUNCH_TOKEN}" \\',
    '  --data-urlencode "worktreeId=${DOLPHIN_WORKTREE_ID}" \\',
    '  --data-urlencode "env=${DOLPHIN_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${DOLPHIN_AGENT_HOOK_VERSION}" \\',
    '  --data-urlencode "hook_event_name=${DOLPHIN_ANTIGRAVITY_EVENT}" \\',
    '  --data-urlencode "agentProcess=${dolphin_agent_process}" \\',
    '  --data-urlencode "tmuxPane=${dolphin_tmux_pane}" \\',
    '  --data-urlencode "payload@-" >/dev/null 2>&1 || spool_hook_event',
    'exit 0',
    ''
  ].join('\n')
}

export function getWindowsWrapperScript(eventName: string): string {
  return [
    '@echo off',
    // Preserve literal ! characters in the percent-expanded hooks path.
    'setlocal DisableDelayedExpansion',
    `set "DOLPHIN_ANTIGRAVITY_EVENT=${eventName}"`,
    'set "DOLPHIN_ANTIGRAVITY_CORE=%~dp0dolphin-antigravity-hook.cmd"',
    'if exist "%DOLPHIN_ANTIGRAVITY_CORE%" (',
    '  call "%DOLPHIN_ANTIGRAVITY_CORE%"',
    '  exit /b 0',
    ')',
    'if /I "%DOLPHIN_ANTIGRAVITY_EVENT%"=="Stop" (',
    '  echo {"decision":""}',
    ') else if /I "%DOLPHIN_ANTIGRAVITY_EVENT%"=="PreToolUse" (',
    `  echo ${ANTIGRAVITY_PRE_TOOL_USE_DECISION}`,
    ') else (',
    '  echo {}',
    ')',
    ...buildWindowsHookEnvironmentGuardLines(),
    'exit /b 0',
    ''
  ].join('\r\n')
}
