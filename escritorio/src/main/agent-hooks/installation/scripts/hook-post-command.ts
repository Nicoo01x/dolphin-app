import type { AgentHookSource } from '../../../../shared/agent-hook-listener/transport/agent-hook-relay'
import { DOLPHIN_HOOK_RAW_JSON_TRANSPORT } from '../../../../shared/agent-hook-listener/configuration/agent-hook-types'
import { AGENT_HOOK_METADATA_CACHE_DIR } from '../../../../shared/agent-hook-listener/transport/agent-hook-spool'

// Older curl needs C numeric parsing; keep the parent script's UTF-8 locale unchanged.
export function posixCurlCommand(curlCommand = 'curl'): string {
  return `LC_ALL= LC_NUMERIC=C ${curlCommand}`
}

const PACK_HOOK_METADATA = `printf '%s\\037%s\\037%s\\037%s\\037%s\\037%s' "$DOLPHIN_PANE_KEY" "$DOLPHIN_TAB_ID" "$DOLPHIN_AGENT_LAUNCH_TOKEN" "$DOLPHIN_WORKTREE_ID" "$DOLPHIN_AGENT_HOOK_ENV" "$DOLPHIN_AGENT_HOOK_VERSION" | base64 | tr -d '\\n'`

/** Defines `dolphin_hook_pack_metadata`, which reuses a pane's packed header while every input matches. */
export function buildPosixHookMetadataCacheLines(): string[] {
  return [
    'dolphin_hook_pack_metadata() {',
    // Length prefixes keep different inputs from forming the same key.
    '  dolphin_hook_meta_key="${#DOLPHIN_PANE_KEY}:$DOLPHIN_PANE_KEY ${#DOLPHIN_TAB_ID}:$DOLPHIN_TAB_ID ${#DOLPHIN_AGENT_LAUNCH_TOKEN}:$DOLPHIN_AGENT_LAUNCH_TOKEN ${#DOLPHIN_WORKTREE_ID}:$DOLPHIN_WORKTREE_ID ${#DOLPHIN_AGENT_HOOK_ENV}:$DOLPHIN_AGENT_HOOK_ENV ${#DOLPHIN_AGENT_HOOK_VERSION}:$DOLPHIN_AGENT_HOOK_VERSION"',
    '  dolphin_hook_meta_file=',
    // A stale variable must not create state for an absent Dolphin installation.
    '  if [ -r "${DOLPHIN_AGENT_HOOK_ENDPOINT:-}" ]; then',
    '    dolphin_hook_meta_id=$DOLPHIN_PANE_KEY',
    // Name it like the spool file, which may sit on a Windows drive under WSL.
    '    while :; do case "$dolphin_hook_meta_id" in *[/:]*) dolphin_hook_meta_id="${dolphin_hook_meta_id%%[/:]*}_${dolphin_hook_meta_id#*[/:]}" ;; *) break ;; esac; done',
    `    dolphin_hook_meta_file="\${DOLPHIN_AGENT_HOOK_ENDPOINT%/*}/${AGENT_HOOK_METADATA_CACHE_DIR}/pane-$dolphin_hook_meta_id"`,
    '    dolphin_hook_meta_line=',
    '    IFS= read -r dolphin_hook_meta_line 2>/dev/null < "$dolphin_hook_meta_file"',
    '    dolphin_hook_metadata=${dolphin_hook_meta_line%% *}',
    '    [ -z "$dolphin_hook_metadata" ] || [ "${dolphin_hook_meta_line#* }" != "$dolphin_hook_meta_key" ] || return 0',
    '  fi',
    `  dolphin_hook_metadata=$(${PACK_HOOK_METADATA}) && [ -n "$dolphin_hook_metadata" ] || return 1`,
    '  [ -n "$dolphin_hook_meta_file" ] || return 0',
    '  [ -d "${dolphin_hook_meta_file%/*}" ] || mkdir -m 700 "${dolphin_hook_meta_file%/*}" 2>/dev/null || return 0',
    // Rename so a concurrent event never reads half a line.
    `  printf '%s %s\\n' "$dolphin_hook_metadata" "$dolphin_hook_meta_key" 2>/dev/null > "$dolphin_hook_meta_file.$$" && mv -f "$dolphin_hook_meta_file.$$" "$dolphin_hook_meta_file" 2>/dev/null`,
    '  return 0',
    '}'
  ]
}

type PosixAgentHookPostOptions = {
  curlCommand?: string
  indent?: string
  decisionHeaderVar?: string
  /** Take the header from `buildPosixHookMetadataCacheLines` instead of packing it every event. */
  cachedMetadata?: boolean
}

export function buildPosixAgentHookPostCommand(
  source: AgentHookSource,
  options: PosixAgentHookPostOptions = {}
): string[] {
  const curlCommand = posixCurlCommand(options.curlCommand ?? 'curl')
  const indent = options.indent ?? '  '
  // Only Claude's capture sets this; the host checks the attachment itself before trusting it.
  const tmux = source === 'claude'
  // Names the decision format the script prints; absent, Dolphin never waits on plugins.
  const decision = options.decisionHeaderVar
    ? [`  ${indent}-H "X-Dolphin-Hook-Decision: \${${options.decisionHeaderVar}:-}" \\`]
    : []
  const url = `"http://127.0.0.1:\${DOLPHIN_AGENT_HOOK_PORT}/hook/${source}"`
  const packMetadata = options.cachedMetadata
    ? ['  dolphin_hook_pack_metadata && \\']
    : [
        `  dolphin_hook_metadata=$(${PACK_HOOK_METADATA}) && \\`,
        '  [ -n "$dolphin_hook_metadata" ] && \\'
      ]
  return [
    `if [ "\${DOLPHIN_AGENT_HOOK_TRANSPORT:-}" = "${DOLPHIN_HOOK_RAW_JSON_TRANSPORT}" ] && command -v base64 >/dev/null 2>&1 && command -v tr >/dev/null 2>&1; then`,
    ...packMetadata,
    `  printf '%s' "$payload" | ${curlCommand} -sS -X POST ${url} \\`,
    `  ${indent}--connect-timeout "\${connect_timeout:-0.5}" --max-time "\${max_time:-1.5}" \\`,
    `  ${indent}--noproxy "127.0.0.1" \\`,
    `  ${indent}-H "Content-Type: application/json" \\`,
    `  ${indent}-H "X-Dolphin-Agent-Hook-Token: \${DOLPHIN_AGENT_HOOK_TOKEN}" \\`,
    `  ${indent}-H "X-Dolphin-Agent-Hook-Meta-Encoding: base64" \\`,
    `  ${indent}-H "X-Dolphin-Agent-Hook-Meta: \${dolphin_hook_metadata}" \\`,
    `  ${indent}-H "X-Dolphin-Agent-Process: \${dolphin_agent_process:-}" \\`,
    ...(tmux ? [`  ${indent}-H "X-Dolphin-Tmux-Pane: \${dolphin_tmux_pane:-}" \\`] : []),
    ...decision,
    `  ${indent}--data-binary @-`,
    'else',
    `  printf '%s' "$payload" | ${curlCommand} -sS -X POST ${url} \\`,
    `  ${indent}--connect-timeout "\${connect_timeout:-0.5}" --max-time "\${max_time:-1.5}" \\`,
    `  ${indent}--noproxy "127.0.0.1" \\`,
    `  ${indent}-H "Content-Type: application/x-www-form-urlencoded" \\`,
    `  ${indent}-H "X-Dolphin-Agent-Hook-Token: \${DOLPHIN_AGENT_HOOK_TOKEN}" \\`,
    ...decision,
    `  ${indent}--data-urlencode "paneKey=\${DOLPHIN_PANE_KEY}" \\`,
    `  ${indent}--data-urlencode "tabId=\${DOLPHIN_TAB_ID}" \\`,
    `  ${indent}--data-urlencode "launchToken=\${DOLPHIN_AGENT_LAUNCH_TOKEN}" \\`,
    `  ${indent}--data-urlencode "worktreeId=\${DOLPHIN_WORKTREE_ID}" \\`,
    `  ${indent}--data-urlencode "env=\${DOLPHIN_AGENT_HOOK_ENV}" \\`,
    `  ${indent}--data-urlencode "version=\${DOLPHIN_AGENT_HOOK_VERSION}" \\`,
    `  ${indent}--data-urlencode "agentProcess=\${dolphin_agent_process:-}" \\`,
    ...(tmux ? [`  ${indent}--data-urlencode "tmuxPane=\${dolphin_tmux_pane:-}" \\`] : []),
    `  ${indent}--data-urlencode "payload@-"`,
    'fi'
  ]
}
