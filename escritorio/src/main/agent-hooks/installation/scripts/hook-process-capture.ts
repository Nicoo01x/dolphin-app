/** Capture before Dolphin inserts its managed-script shell. */
export const HOOK_PARENT_CAPTURE = 'DOLPHIN_HOOK_AGENT_PID="${PPID:-}"; export DOLPHIN_HOOK_AGENT_PID; '

// Uncached, as no builtin tells a reused PID from its old process: Linux reads /proc, macOS runs only ps.
export function buildHookProcessCapture(): string[] {
  return [
    'dolphin_agent_process= dolphin_agent_pid="${DOLPHIN_HOOK_AGENT_PID:-}"',
    // Field 2 after the command name is ppid; field 20 is the start time in clock ticks since boot.
    'dolphin_agent_stat_fields() { dolphin_agent_ppid=${2-}; dolphin_agent_start=${20-}; }',
    '[ -z "${DOLPHIN_PANE_KEY:-}" ] || case "$dolphin_agent_pid" in ""|*[!0-9]*) ;; *)',
    '  if [ -r "/proc/$dolphin_agent_pid/stat" ]; then',
    '    dolphin_agent_stat= dolphin_agent_line= dolphin_agent_boot= dolphin_agent_start= dolphin_agent_ppid= dolphin_agent_cmdline=',
    // Read to EOF: a command name may contain a newline, and the strip below takes the last ") ".
    '    while IFS= read -r dolphin_agent_line || [ -n "$dolphin_agent_line" ]; do dolphin_agent_stat="$dolphin_agent_stat$dolphin_agent_line "; dolphin_agent_line=; done 2>/dev/null < "/proc/$dolphin_agent_pid/stat"',
    '    dolphin_agent_stat_fields ${dolphin_agent_stat##*) }',
    // agy runs hooks via `sh -c`; a shell that forks for it leaves $PPID on that short-lived wrapper.
    '    case "${dolphin_agent_stat%%) *}" in *" (sh"|*" (dash"|*" (bash"|*" (zsh")',
    '      while IFS= read -r dolphin_agent_line || [ -n "$dolphin_agent_line" ]; do dolphin_agent_cmdline="$dolphin_agent_cmdline$dolphin_agent_line "; dolphin_agent_line=; done 2>/dev/null < "/proc/$dolphin_agent_pid/cmdline"',
    '      case "$dolphin_agent_cmdline" in *DOLPHIN_HOOK_AGENT_PID=*)',
    '        case "$dolphin_agent_ppid" in ""|0|1|*[!0-9]*) ;; *)',
    '          if [ -r "/proc/$dolphin_agent_ppid/stat" ]; then',
    '            dolphin_agent_pid=$dolphin_agent_ppid dolphin_agent_stat= dolphin_agent_line= dolphin_agent_start=',
    '            while IFS= read -r dolphin_agent_line || [ -n "$dolphin_agent_line" ]; do dolphin_agent_stat="$dolphin_agent_stat$dolphin_agent_line "; dolphin_agent_line=; done 2>/dev/null < "/proc/$dolphin_agent_pid/stat"',
    '            dolphin_agent_stat_fields ${dolphin_agent_stat##*) }',
    '          fi ;; esac ;; esac ;; esac',
    '    IFS= read -r dolphin_agent_boot 2>/dev/null < /proc/sys/kernel/random/boot_id',
    '    case "$dolphin_agent_start" in ""|*[!0-9]*) ;; *)',
    '      [ -z "$dolphin_agent_boot" ] || dolphin_agent_process="{\\"pid\\":$dolphin_agent_pid,\\"platform\\":\\"linux\\",\\"startTime\\":\\"$dolphin_agent_boot:$dolphin_agent_start\\"}" ;; esac',
    // Bash sets OSTYPE on macOS; other shells still ask uname.
    '  elif case "${OSTYPE-}" in darwin*) ;; *) [ "$(uname -s 2>/dev/null)" = Darwin ] ;; esac; then',
    '    dolphin_agent_cmdline=$(exec /bin/ps -p "$dolphin_agent_pid" -o ppid=,args= 2>/dev/null)',
    '    dolphin_agent_cmdline=${dolphin_agent_cmdline#"${dolphin_agent_cmdline%%[! ]*}"}',
    '    dolphin_agent_ppid=${dolphin_agent_cmdline%% *}',
    '    dolphin_agent_cmdline=${dolphin_agent_cmdline#* }',
    '    dolphin_agent_cmdline=${dolphin_agent_cmdline#"${dolphin_agent_cmdline%%[! ]*}"}',
    // Match the shell on argv[0] only: an agent's prompt in its args can quote this wrapper.
    '    case "${dolphin_agent_cmdline%% *}" in sh|*/sh|dash|*/dash|bash|*/bash|zsh|*/zsh)',
    '      case "$dolphin_agent_cmdline" in *DOLPHIN_HOOK_AGENT_PID=*)',
    '        case "$dolphin_agent_ppid" in ""|0|1|*[!0-9]*) ;; *) dolphin_agent_pid=$dolphin_agent_ppid ;; esac ;; esac ;; esac',
    // Match the host probe's timezone when comparing local-time lstart strings.
    '    dolphin_agent_start=$(TZ=UTC0 LC_ALL=C exec /bin/ps -p "$dolphin_agent_pid" -o lstart= 2>/dev/null)',
    '    dolphin_agent_start=${dolphin_agent_start#"${dolphin_agent_start%%[! ]*}"}',
    '    dolphin_agent_start=${dolphin_agent_start%"${dolphin_agent_start##*[! ]}"}',
    '    [ -z "$dolphin_agent_start" ] || dolphin_agent_process="{\\"pid\\":$dolphin_agent_pid,\\"platform\\":\\"darwin\\",\\"startTime\\":\\"$dolphin_agent_start\\"}"',
    '  fi ;;',
    'esac',
    // A tmux pane's own server, socket and pane id; only a lookup hint for the host's attachment check.
    'dolphin_tmux_pane=',
    'case "${TMUX_PANE:-}" in %[0-9]*) [ -z "${TMUX:-}" ] || dolphin_tmux_pane="$TMUX_PANE ${TMUX%,*,*}" ;; esac'
  ]
}
