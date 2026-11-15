/**
 * A WSL bridge shell reports its folder at each prompt (OSC 7), so the terminal daemon's emulator,
 * and every checkpoint, follows `cd` without a guest probe. Bridge bash and zsh send none
 * themselves. Only inside WSL. The path is encoded only when it changes, and re-sent every
 * prompt so a foreign report (an ssh session that set its own) cannot stick. Bytes outside the
 * URI's unreserved set are percent-encoded as UTF-8, masked for bash 3.2's signed chars.
 */
export const BASH_WSL_CWD_REPORT_BLOCK = `__dolphin_wsl_cwd_report() {
  [[ -n "\${WSL_DISTRO_NAME:-}" ]] || return 0
  if [[ "$PWD" != "\${__dolphin_wsl_cwd_reported-}" ]]; then
    __dolphin_wsl_cwd_reported=$PWD
    local LC_ALL=C __dolphin_e= __dolphin_c __dolphin_i
    for (( __dolphin_i = 0; __dolphin_i < \${#PWD}; __dolphin_i++ )); do
      __dolphin_c=\${PWD:__dolphin_i:1}
      case $__dolphin_c in
        [A-Za-z0-9/._~-]) __dolphin_e+=$__dolphin_c ;;
        *) printf -v __dolphin_c '%d' "'$__dolphin_c"; printf -v __dolphin_c '%%%02X' $(( __dolphin_c & 255 )); __dolphin_e+=$__dolphin_c ;;
      esac
    done
    __dolphin_wsl_cwd_encoded=$__dolphin_e
  fi
  printf '\\033]7;file://%s\\007' "\${__dolphin_wsl_cwd_encoded-}"
}`

export const ZSH_WSL_CWD_REPORT_BLOCK = `__dolphin_wsl_cwd_report() {
  builtin emulate -L zsh
  builtin setopt no_multibyte
  [[ -n \${WSL_DISTRO_NAME:-} ]] || return 0
  if [[ $PWD != \${__dolphin_wsl_cwd_reported-} ]]; then
    builtin typeset -g __dolphin_wsl_cwd_reported=$PWD
    local __dolphin_e= __dolphin_c __dolphin_i
    for (( __dolphin_i = 1; __dolphin_i <= $#PWD; __dolphin_i++ )); do
      __dolphin_c=$PWD[__dolphin_i]
      case $__dolphin_c in
        ([A-Za-z0-9/._~-]) __dolphin_e+=$__dolphin_c ;;
        (*) builtin printf -v __dolphin_c '%d' "'$__dolphin_c"; builtin printf -v __dolphin_c '%%%02X' $(( __dolphin_c & 255 )); __dolphin_e+=$__dolphin_c ;;
      esac
    done
    builtin typeset -g __dolphin_wsl_cwd_encoded=$__dolphin_e
  fi
  builtin printf '\\033]7;file://%s\\007' "\${__dolphin_wsl_cwd_encoded-}"
}`

/**
 * A WSL bridge sh/dash/ash pane's ENV file (read once, by interactive shells only, after the login
 * profile). It first hands ENV back to the user's own value, so children see theirs, and sources it.
 * Then, inside WSL, it prefixes PS1 with the folder report; dash has no prompt hook, so the report
 * runs in a command substitution and re-encodes $PWD byte by byte every prompt. bash and busybox
 * ash (fancy prompt, on in Alpine's and Debian's builds) get it inside \\[ \\] so the invisible bytes
 * do not count toward the prompt's width; dash has no line editor to miscount, and would print \\[.
 */
export const SH_WSL_ENV_FILE = `# Dolphin WSL bridge sh ENV: restore the user's ENV, then report the folder (OSC 7) at each prompt.
if [ -n "\${DOLPHIN_WSL_USER_ENV:-}" ]; then
  ENV=$DOLPHIN_WSL_USER_ENV
  unset DOLPHIN_WSL_USER_ENV
  # The shell expands ENV's value before reading it; a here-document does the same without
  # parsing the user's quotes as shell syntax.
  eval "IFS= read -r __dolphin_user_env <<__DOLPHIN_USER_ENV_EOF
$ENV
__DOLPHIN_USER_ENV_EOF
"
  if [ -r "$__dolphin_user_env" ]; then
    . "$__dolphin_user_env"
  fi
  unset __dolphin_user_env
else
  unset ENV DOLPHIN_WSL_USER_ENV
fi
if [ -n "\${WSL_DISTRO_NAME:-}" ]; then
  __dolphin_wsl_cwd_report() {
    LC_ALL=C
    __dolphin_p=$PWD
    __dolphin_e=
    while [ -n "$__dolphin_p" ]; do
      __dolphin_r=\${__dolphin_p#?}
      __dolphin_c=\${__dolphin_p%"$__dolphin_r"}
      __dolphin_p=$__dolphin_r
      case $__dolphin_c in
        [A-Za-z0-9/._~-]) __dolphin_e=$__dolphin_e$__dolphin_c ;;
        *) __dolphin_e=$__dolphin_e$(printf '%%%02X' $(( $(printf '%d' "'$__dolphin_c") & 255 ))) ;;
      esac
    done
    printf '\\033]7;file://%s\\007' "$__dolphin_e"
  }
  case $PS1 in
    *__dolphin_wsl_cwd_report*) ;;
    *)
      if [ -n "\${BASH_VERSION:-}" ] || [ -n "\${BB_ASH_VERSION:-}" ]; then
        PS1='\\[$(__dolphin_wsl_cwd_report)\\]'"$PS1"
      else
        PS1='$(__dolphin_wsl_cwd_report)'"$PS1"
      fi
      ;;
  esac
fi
`
