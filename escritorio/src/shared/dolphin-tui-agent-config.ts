import { getDolphinCliCommandNameForPlatform } from './dolphin-cli-command-name'
import type { TuiAgentConfig } from './agent-launch/catalog/tui-agent-config-types'

/**
 * Los dos modos que provee Dolphin, no un CLI que se instala aparte.
 *
 * `dolphin` es esta app: el motor con el que escribe (Claude, Codex, Antigravity) se elige al
 * abrirlo, así que no exige tener otro CLI para aparecer en el «+». `claude-agent-teams` es el modo
 * de Claude Code con paneles nativos, que sí necesita a Claude.
 *
 * Viven en su propio módulo por lo mismo que el catálogo del renderer está partido en dos: la tabla
 * de `tui-agent-config.ts` está en su tope de líneas y sumar un agente la pasaba.
 */
export const DOLPHIN_TUI_AGENT_CONFIGS = {
  dolphin: {
    detectCmd: 'dolphin',
    detectCmdAliases: ['dolphin-dev'],
    launchCmd: getDolphinCliCommandNameForPlatform('linux'),
    launchCmdByPlatform: {
      linux: getDolphinCliCommandNameForPlatform('linux'),
      win32: getDolphinCliCommandNameForPlatform('win32')
    },
    promptInjectionMode: 'stdin-after-start',
    pasteNeedsTypedRequest: true,
    preflightTrust: 'claude'
  },
  'claude-agent-teams': {
    // Why: a Dolphin-provided launch mode, not a separate binary; detection follows the Dolphin CLI.
    detectCmd: 'dolphin',
    // Why los nombres de antes: son los comandos que una instalación anterior dejó en el
    // PATH, y son los que hay que reconocer para no perder el agente en primer plano.
    detectCmdAliases: ['dolphin-dev', 'orca', 'orca-dev', 'orca-ide'],
    // Why: require Claude too so fresh installs (Dolphin shim always present) don't report Agent Teams without an agent CLI.
    detectRequiredCommands: ['claude'],
    // Why: Windows/WSL use Claude's in-process Agent Teams fallback, not this Dolphin native-pane/tmux-shim wrapper.
    detectUnsupportedRuntimes: ['win32', 'wsl'],
    launchCmd: 'dolphin claude-teams',
    launchCmdByPlatform: {
      linux: `${getDolphinCliCommandNameForPlatform('linux')} claude-teams`,
      win32: `${getDolphinCliCommandNameForPlatform('win32')} claude-teams`
    },
    expectedProcess: 'claude',
    promptInjectionMode: 'stdin-after-start',
    pasteNeedsTypedRequest: true,
    preflightTrust: 'claude',
    draftPasteReadySignal: 'claude-composer-prompt',
    workerStartReadsComposerMarker: true,
    // Why: runs the same Claude binary, so Ctrl+Enter must match `claude`.
    ctrlEnterEncoding: 'csi-u'
  }
} satisfies Record<
  'dolphin' | 'claude-agent-teams',
  Omit<TuiAgentConfig, 'expectedProcess'> & Partial<Pick<TuiAgentConfig, 'expectedProcess'>>
>
