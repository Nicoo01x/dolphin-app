export function leerEnvDolphin(name: string, env: Readonly<Record<string, string>>): string
export function leerEnvDolphin(
  name: string,
  env?: Readonly<Record<string, unknown>>
): string | undefined
export function leerEnvDolphin(
  name: string,
  env: Readonly<Record<string, unknown>> | undefined = process.env
): string | undefined {
  if (!env) {
    return undefined
  }
  // Why: the short name is only a key, never a variable to read. CODEX_HOME, NODE_OPTIONS or
  // OPENCODE_CONFIG_DIR also exist bare, set by the user for their own tools; reading those as
  // Dolphin's own made every terminal take the user's Codex home for Dolphin's overlay.
  const base = name.replace(/^DOLPHIN_/, '')
  const dolphinName = `DOLPHIN_${base}`
  return typeof env[dolphinName] === 'string' ? env[dolphinName] : undefined
}

/**
 * Escribe una variable de identidad de la terminal: `DOLPHIN_X`, y nada más.
 *
 * Acá había un alias con el nombre viejo, y existía por un solo programa: el hook nativo de
 * Windows (`native/windows-agent-hook`), que está escrito en Rust y leía el nombre viejo sin
 * respaldo. Si no lo encontraba se iba sin leer stdin, Dolphin nunca se enteraba del id de sesión,
 * el panel del chat resolvía `sessionId: null` y la respuesta del agente no se veía.
 *
 * El comentario que estaba acá decía que el alias se podía sacar cuando hubiera toolchain de Rust
 * para tocar el hook. El 08/11/2026 lo hubo: el hook ahora lee `DOLPHIN_PANE_KEY`,
 * `DOLPHIN_TAB_ID`, `DOLPHIN_AGENT_LAUNCH_TOKEN` y `DOLPHIN_WORKTREE_ID`, y manda su cabecera como
 * `X-Dolphin-Agent-Hook-Token`. Los dos lados cambian juntos y viajan en el mismo paquete, así que
 * no hay ventana en la que uno espere lo que el otro ya no manda.
 * `spawn-pane-env.identidad-del-hook.test.ts` compara esto contra el binario que se publica.
 */
export function ponerEnvDolphin(env: Record<string, string>, base: string, value: string): void {
  env[`DOLPHIN_${base}`] = value
}

/** La contracara de `ponerEnvDolphin`. */
export function borrarEnvDolphin(env: Record<string, string | undefined>, base: string): void {
  delete env[`DOLPHIN_${base}`]
}

/**
 * What a terminal exports to every child: pane, tab, hook, runtime, agent overlay and orchestration
 * identity. Lo que un proceso hereda bajo estos nombres de la terminal que lo arrancó se leería
 * como propio —la identidad de otro panel, otro hook, otro perfil—, así que se saca antes de
 * empezar.
 *
 * Exact names, never a prefix: CODEX_CONTRACT_*, TERMINAL_PERF_BENCH or CODEX_ISOLATE share a
 * prefix with these and are knobs someone sets on purpose.
 */
const IDENTIDAD_DE_TERMINAL = new Set([
  'AGENT_HOOK_ENDPOINT',
  'AGENT_HOOK_ENV',
  'AGENT_HOOK_NODE',
  'AGENT_HOOK_OPENCODE_TUI',
  'AGENT_HOOK_PORT',
  'AGENT_HOOK_TOKEN',
  'AGENT_HOOK_TRANSPORT',
  'AGENT_HOOK_VERSION',
  'AGENT_LAUNCH',
  'AGENT_LAUNCH_TOKEN',
  'AGENT_PANE',
  'AGENT_SESSION_ID',
  'AGENT_TEAMS_LEADER_PANE',
  'AGENT_TEAMS_SHIM_BIN',
  'AGENT_TEAMS_SHIM_DIR',
  'AGENT_TEAMS_TEAM_ID',
  'AGENT_TEAMS_TOKEN',
  'APP_VERSION',
  'CLAUDE_INJECTED_CONFIG_DIR',
  'CLAUDE_PROFILE_POINTER',
  'CLI_COMMAND',
  'CODEX_HOME',
  'CODEX_LAUNCH_PREFLIGHT',
  'DATA_ACCOUNT_DATA_HOME',
  'DATA_ACCOUNT_STATE_HOME',
  'DATA_ACCOUNT_PROVIDER',
  'ENVIRONMENT',
  'HISTFILE',
  'IMAGE_PROTOCOL',
  'MIMOCODE_HOME',
  'MIMOCODE_SOURCE_HOME',
  'OMP_CODING_AGENT_DIR',
  'OMP_SOURCE_AGENT_DIR',
  'OMP_STATUS_EXTENSION',
  'OPENCODE_AGENT',
  'OPENCODE_CONFIG_DIR',
  'OPENCODE_SOURCE_CONFIG_DIR',
  'ORIG_ZDOTDIR',
  'PAIRING_CODE',
  'PANE_KEY',
  'PI_CODING_AGENT_DIR',
  'PI_SOURCE_AGENT_DIR',
  'PRIME_AGENT_SOURCE_AGENT_DIR',
  'PRIME_AGENT_STATUS_EXTENSION',
  'PROJECT_GROUP_ID',
  'ROOT_PATH',
  'RUNTIME_SOURCE_ID',
  'RUNTIME_SOURCE_INCARNATION',
  'RUNTIME_SOURCE_PROFILE_PATH',
  'SHELL_FEATURES',
  'SHELL_READY_ROOT',
  'STRUCTURED_SESSION',
  'TAB_ID',
  'TERMINAL_HANDLE',
  'USER_DATA_PATH',
  'WORKSPACE_ID',
  'WORKSPACE_ROOT',
  'WORKTREE_ID',
  'WORKTREE_PATH',
  'WSL_CLI_DIR',
  'ZSHENV_SOURCE_DIR'
])

/** Drops the inherited terminal identity whose name starts with one of `prefixes`. */
export function quitarIdentidadDeTerminal(
  env: Record<string, string | undefined>,
  prefixes: readonly 'DOLPHIN_'[]
): void {
  for (const name of Object.keys(env)) {
    const prefix = prefixes.find((candidate) => name.startsWith(candidate))
    if (prefix && IDENTIDAD_DE_TERMINAL.has(name.slice(prefix.length))) {
      delete env[name]
    }
  }
}

export function leerEnvDolphinNoVacio(
  name: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const value = leerEnvDolphin(name, env)?.trim() ?? ''
  return value.length > 0 ? value : null
}
