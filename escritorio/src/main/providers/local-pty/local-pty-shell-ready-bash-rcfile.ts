/** Bash has one --rcfile wrapper, so login startup, OSC hooks and readiness share this file. */
import { BASH_PROMPT_COMMAND_COMPOSITION_BLOCK } from '../../pty/shell-startup/bash-prompt-command-composition'
import { DOLPHIN_CLI_POSIX_PATH_RESTORE } from '../../../shared/dolphin-cli-shell-path'
import { MANAGED_DATA_ACCOUNT_POSIX_RESTORE } from '../../../shared/managed-data-account-shell'
import { WSL_MANAGED_CLI_PATH_RESTORE } from '../../wsl/execution/wsl-managed-cli-path-restore'
import { getPosixOmpShellWrapper } from '../../pty/shell-startup/omp-shell-wrapper'
import { getPosixCodexShellLaunchPreflight } from '../../../shared/codex-shell-function'
import { getPosixClaudeShellFunction } from '../../../shared/claude-shell-function'
import { getBashStartupCommandPromptBlock } from '../../pty/shell-startup/posix-shell-startup-command'
import {
  BASH_FEATURE_CHANNEL_BLOCK,
  SHELL_STARTUP_IDENTITY_MARKER_BLOCK
} from '../../pty/shell-startup/shell-templates'
import { SHELL_READY_MARKER_ESCAPED } from './local-pty-shell-ready-marker'
import { BASH_WSL_CWD_REPORT_BLOCK } from '../../wsl/filesystem/wsl-shell-cwd-report'

export function getBashShellReadyRcfileContent(): string {
  return `# Dolphin bash shell-ready wrapper
${BASH_FEATURE_CHANNEL_BLOCK}
${SHELL_STARTUP_IDENTITY_MARKER_BLOCK}
# Consume feature selection before startup files can inherit it into children.
__dolphin_ready_marker=""
__dolphin_has_feature ready && __dolphin_ready_marker=1
unset _dolphin_shell_features
unset -f __dolphin_has_feature
[[ -f /etc/profile ]] && source /etc/profile
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bash_login" ]]; then
  source "$HOME/.bash_login"
elif [[ -f "$HOME/.profile" ]]; then
  source "$HOME/.profile"
fi
# Older readline needs explicit bracketed paste so multiline prompts do not submit each newline.
[[ $- == *i* ]] && bind 'set enable-bracketed-paste on' 2>/dev/null
# Login profiles may already source .bashrc; sourcing it again would duplicate PATH, hooks and prompt setup.
__dolphin_restore_agent_teams_path() {
  [[ -n "\${DOLPHIN_AGENT_TEAMS_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${DOLPHIN_AGENT_TEAMS_SHIM_DIR}"|"\${DOLPHIN_AGENT_TEAMS_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${DOLPHIN_AGENT_TEAMS_SHIM_DIR}:$PATH"
}
__dolphin_restore_agent_teams_path
${DOLPHIN_CLI_POSIX_PATH_RESTORE}
${WSL_MANAGED_CLI_PATH_RESTORE}
# Restore Dolphin-managed config after user startup files may override it.
[[ -n "\${DOLPHIN_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${DOLPHIN_OPENCODE_CONFIG_DIR}"
${MANAGED_DATA_ACCOUNT_POSIX_RESTORE}
[[ -n "\${DOLPHIN_MIMOCODE_CONFIG_DIR:-}" ]] && export MIMOCODE_CONFIG_DIR="\${DOLPHIN_MIMOCODE_CONFIG_DIR}"
${getPosixOmpShellWrapper()}
# Profile scripts must not replace Dolphin's runtime CODEX_HOME.
[[ -n "\${DOLPHIN_CODEX_HOME:-}" ]] && export CODEX_HOME="\${DOLPHIN_CODEX_HOME}"
${getPosixCodexShellLaunchPreflight() + getPosixClaudeShellFunction()}
${BASH_WSL_CWD_REPORT_BLOCK}
# OSC 133 C/D clears agent status after interrupted CLIs exit without sending Stop/SessionEnd hooks.
__dolphin_initializing_wrapper=1
__dolphin_osc133_precmd() {
  local exit_code=$?
  __dolphin_in_prompt_command=1
  if [[ -n "\${__dolphin_in_command:-}" ]]; then
    printf "\\033]133;D;%s\\007" "$exit_code"
    unset __dolphin_in_command
  fi
  printf "\\033]133;A\\007"
  __dolphin_wsl_cwd_report
  return "$exit_code"
}
__dolphin_osc133_prompt_done() {
  unset __dolphin_in_prompt_command
  __dolphin_adopt_outer_debug_trap
  trap '__dolphin_osc133_preexec' DEBUG
}
__dolphin_osc133_preexec() {
  if [[ -n "\${__dolphin_prompt_status_capture_command:-}" && "$BASH_COMMAND" == "$__dolphin_prompt_status_capture_command" ]]; then
    unset __dolphin_initial_prompt
    __dolphin_in_legacy_prompt_wrapper=1
    return 0
  fi
  if [[ -n "\${__dolphin_initializing_wrapper:-}\${__dolphin_in_debug_capture:-}\${__dolphin_initial_prompt:-}\${__dolphin_in_prompt_dispatch:-}\${__dolphin_in_legacy_prompt_wrapper:-}\${__dolphin_in_prompt_command:-}" ]]; then
    [[ -z "\${__dolphin_initializing_wrapper:-}\${__dolphin_in_debug_capture:-}" ]] || return 0
    if [[ -n "\${__dolphin_initial_prompt:-}" && "$BASH_COMMAND" == "__dolphin_osc133_precmd" ]]; then
      unset __dolphin_initial_prompt; return 0
    fi
    if [[ -n "\${__dolphin_in_prompt_dispatch:-}" ]]; then
      [[ -n "\${__dolphin_dispatching_user_prompt_command:-}" ]] || return 0
      if [[ "\${FUNCNAME[1]:-}" == "__dolphin_run_prompt_command_array" ]]; then
        case "$BASH_COMMAND" in
          '(( __dolphin_exit_code == 0 ))'|'__dolphin_restore_prompt_status "$__dolphin_exit_code"'|'eval "$__dolphin_prompt_part"'|'eval "$__dolphin_final_prompt_command"'|__dolphin_dispatching_user_prompt_command=*|__dolphin_osc133_precmd|__dolphin_osc133_prompt_done|__dolphin_prompt_mark) return 0 ;;
        esac
      fi
    elif [[ "\${FUNCNAME[1]:-}" == "__dolphin_run_prompt_command_array" || "$BASH_COMMAND" == "__dolphin_run_prompt_command_array" ]]; then
      return 0
    fi
    [[ -z "\${__dolphin_in_legacy_prompt_wrapper:-}" || -n "\${__dolphin_dispatching_user_prompt_command:-}" ]] || return 0
    if [[ -n "\${__dolphin_in_prompt_command:-}" && "$BASH_COMMAND" == "__dolphin_in_debug_capture=1" ]]; then
      return 0
    fi
  fi
  case "\${FUNCNAME[1]:-}" in __dolphin_osc133_*|__dolphin_prompt_mark|__dolphin_restore_prompt_status) return 0 ;; esac
  case "$BASH_COMMAND" in __dolphin_osc133_precmd|__dolphin_osc133_prompt_done|__dolphin_prompt_mark) return 0 ;; esac
  __dolphin_run_user_debug_trap
  [[ -z "\${__dolphin_in_prompt_command:-}" ]] || return 0
  [[ -z "\${__dolphin_in_command:-}" ]] || return 0
  # DEBUG runs per simple command; chained traps may reenter for the same foreground command.
  printf "\\033]133;C\\007"
  __dolphin_in_command=1
}
# Capture $? before the user's PROMPT_COMMAND chain mutates it.
${BASH_PROMPT_COMMAND_COMPOSITION_BLOCK}
__dolphin_prepend_prompt_command "__dolphin_osc133_precmd"
# Mark readiness after user prompt setup without rerunning startup files.
if [[ -n "$__dolphin_ready_marker" ]]; then
  __dolphin_prompt_mark() {
    printf "${SHELL_READY_MARKER_ESCAPED}"
  }
  __dolphin_append_prompt_command "__dolphin_prompt_mark"
fi
__dolphin_append_prompt_command '__dolphin_in_debug_capture=1; __dolphin_prompt_had_functrace=""; if [[ -o functrace ]]; then __dolphin_prompt_had_functrace=1; set +T; fi; __dolphin_outer_debug_trap_spec="$(trap -p DEBUG)"; [[ -z "$__dolphin_prompt_had_functrace" ]] || set -T; unset __dolphin_prompt_had_functrace __dolphin_in_debug_capture'
__dolphin_append_prompt_command "__dolphin_osc133_prompt_done"
${getBashStartupCommandPromptBlock()}
__dolphin_had_functrace=""
[[ -o functrace ]] && __dolphin_had_functrace=1
set +T
__dolphin_debug_trap_spec="$(trap -p DEBUG)"
[[ -z "$__dolphin_had_functrace" ]] || set -T
if [[ -n "$__dolphin_debug_trap_spec" && "$__dolphin_debug_trap_spec" != "trap -- '__dolphin_osc133_preexec' DEBUG" ]]; then
  __dolphin_debug_trap_command="\${__dolphin_debug_trap_spec#trap -- }"
  __dolphin_debug_trap_command="\${__dolphin_debug_trap_command% DEBUG}"
  eval "__dolphin_user_debug_trap=$__dolphin_debug_trap_command"
fi
unset __dolphin_debug_trap_spec __dolphin_debug_trap_command __dolphin_had_functrace
unset -f __dolphin_normalize_prompt_command_part __dolphin_normalize_prompt_command __dolphin_prepend_prompt_command __dolphin_append_prompt_command
unset __dolphin_prompt_command_normalized
# Arm DEBUG after wrapper setup to avoid fake foreground C/D events before the first prompt.
__dolphin_initial_prompt=1
trap '__dolphin_osc133_preexec' DEBUG
unset __dolphin_initializing_wrapper
`
}
