import { getPosixOmpShellWrapper } from '../../pty/shell-startup/omp-shell-wrapper'
import { DOLPHIN_CLI_POSIX_PATH_RESTORE } from '../../../shared/dolphin-cli-shell-path'
import { MANAGED_DATA_ACCOUNT_POSIX_RESTORE } from '../../../shared/managed-data-account-shell'
import { getPosixCodexShellLaunchPreflight } from '../../../shared/codex-shell-function'
import { getPosixClaudeShellFunction } from '../../../shared/claude-shell-function'
import { BASH_PROMPT_COMMAND_COMPOSITION_BLOCK } from '../../pty/shell-startup/bash-prompt-command-composition'
import {
  BASH_FEATURE_CHANNEL_BLOCK,
  SHELL_STARTUP_IDENTITY_MARKER_BLOCK
} from '../../pty/shell-startup/shell-templates'

export function getDaemonBashShellReadyRcfileContent(): string {
  return `# Dolphin daemon bash shell-ready wrapper
${BASH_FEATURE_CHANNEL_BLOCK}
${SHELL_STARTUP_IDENTITY_MARKER_BLOCK}
# Consume the feature channel before profiles so child processes cannot inherit the selection.
__dolphin_ready_marker=""
__dolphin_has_feature ready && __dolphin_ready_marker=1
unset _dolphin_shell_features
unset -f __dolphin_has_feature
# A system bashrc may already run ble.sh; it never exports this state, so exported copies are inherited.
for __dolphin_ble_var in _ble_attached _ble_decode_bind_state; do
  [[ -n "\${!__dolphin_ble_var+set}" ]] || continue
  case "$(declare -p "$__dolphin_ble_var" 2>/dev/null)" in "declare -x"*) unset "$__dolphin_ble_var" ;; esac
done
unset __dolphin_ble_var
[[ -f /etc/profile ]] && source /etc/profile
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bash_login" ]]; then
  source "$HOME/.bash_login"
elif [[ -f "$HOME/.profile" ]]; then
  source "$HOME/.profile"
fi
# Force bracketed paste on older readline so multiline startup prompts remain one literal paste.
[[ $- == *i* ]] && bind 'set enable-bracketed-paste on' 2>/dev/null
__dolphin_restore_agent_teams_path() {
  [[ -n "\${DOLPHIN_AGENT_TEAMS_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${DOLPHIN_AGENT_TEAMS_SHIM_DIR}"|"\${DOLPHIN_AGENT_TEAMS_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${DOLPHIN_AGENT_TEAMS_SHIM_DIR}:$PATH"
}
__dolphin_restore_agent_teams_path
${DOLPHIN_CLI_POSIX_PATH_RESTORE}
# Restore the managed OpenCode config after user profiles may have replaced it.
[[ -n "\${DOLPHIN_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${DOLPHIN_OPENCODE_CONFIG_DIR}"
${MANAGED_DATA_ACCOUNT_POSIX_RESTORE}
[[ -n "\${DOLPHIN_MIMOCODE_CONFIG_DIR:-}" ]] && export MIMOCODE_CONFIG_DIR="\${DOLPHIN_MIMOCODE_CONFIG_DIR}"
${getPosixOmpShellWrapper()}
# Preserve the managed CODEX_HOME after user profiles.
[[ -n "\${DOLPHIN_CODEX_HOME:-}" ]] && export CODEX_HOME="\${DOLPHIN_CODEX_HOME}"
${getPosixCodexShellLaunchPreflight() + getPosixClaudeShellFunction()}
# OSC 133 C/D clears stale agent status when a CLI exits without a stop hook.
__dolphin_initializing_wrapper=1
__dolphin_osc133_precmd() {
  local exit_code=$?
  __dolphin_in_prompt_command=1
  if [[ -n "\${__dolphin_in_command:-}" ]]; then
    printf "\\033]133;D;%s\\007" "$exit_code"
    unset __dolphin_in_command
  fi
  printf "\\033]133;A\\007"
  return "$exit_code"
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
          '(( __dolphin_exit_code == 0 ))'|'__dolphin_restore_prompt_status "$__dolphin_exit_code"'|'eval "$__dolphin_prompt_part"'|'eval "$__dolphin_final_prompt_command"'|__dolphin_dispatching_user_prompt_command=*|__dolphin_osc133_precmd|__dolphin_osc133_epilogue) return 0 ;;
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
  case "\${FUNCNAME[1]:-}" in
    __dolphin_osc133_*|__dolphin_restore_prompt_status|__bp_*) return 0 ;;
  esac
  case "$BASH_COMMAND" in
    __dolphin_osc133_precmd|__dolphin_osc133_epilogue) return 0 ;;
    # The prefix is only special while bash-preexec prompt hooks run.
    __bp_*) [[ -n "\${__dolphin_in_prompt_command:-}" ]] && return 0 ;;
  esac
  __dolphin_run_user_debug_trap
  # Chain the framework trap captured before each prompt's lifecycle re-arm.
  if [[ -n "\${__dolphin_chained_debug_trap:-}" ]]; then
    eval "$__dolphin_chained_debug_trap" || true
  fi
  [[ -z "\${__dolphin_in_prompt_command:-}" ]] || return 0
  # Emit C once per foreground command, excluding prompt hooks and repeated chained-trap calls.
  [[ -z "\${__dolphin_in_command:-}" ]] || return 0
  printf "\\033]133;C\\007"
  __dolphin_in_command=1
}
# Adopt the latest user trap before reclaiming lifecycle ownership.
__dolphin_osc133_epilogue() {
  unset __dolphin_in_prompt_command
  __dolphin_adopt_outer_debug_trap
  trap '__dolphin_osc133_preexec' DEBUG
  # Readline renders PS1 after entering raw mode; prompt hooks still run in cooked mode.
  if [[ -n "$__dolphin_ready_marker" ]]; then
    # Attached ble.sh (0.3+) discards Bash's own prompt output and owns the TTY, so print directly.
    if [[ -n "\${_ble_attached-}" ]]; then
      # Its first render runs this before the key decoder attaches; wait for a later prompt.
      if [[ "\${_ble_decode_bind_state:-none}" != none ]]; then
        printf "\\033]777;dolphin-shell-ready\\007"
        __dolphin_ready_marker=""
      fi
    else
      PS1="\${PS1-}"'\\[\\e]777;dolphin-shell-ready\\a\\]'
      __dolphin_ready_marker=""
    fi
  fi
}
${BASH_PROMPT_COMMAND_COMPOSITION_BLOCK}
__dolphin_prepend_prompt_command "__dolphin_osc133_precmd"
__dolphin_append_prompt_command '__dolphin_in_debug_capture=1; __dolphin_prompt_had_functrace=""; if [[ -o functrace ]]; then __dolphin_prompt_had_functrace=1; set +T; fi; __dolphin_outer_debug_trap_spec="$(trap -p DEBUG)"; [[ -z "$__dolphin_prompt_had_functrace" ]] || set -T; unset __dolphin_prompt_had_functrace __dolphin_in_debug_capture'
__dolphin_append_prompt_command "__dolphin_osc133_epilogue"
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
# Arm DEBUG after setup so rcfile commands cannot emit a fake lifecycle before the first prompt.
__dolphin_initial_prompt=1
trap '__dolphin_osc133_preexec' DEBUG
unset __dolphin_initializing_wrapper
`
}
