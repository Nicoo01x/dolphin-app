export const DOLPHIN_CLI_POSIX_PATH_RESTORE = `DOLPHIN_CLI_BIN_DIR="\${DOLPHIN_CLI_BIN_DIR:-\${DOLPHIN_CLI_BIN_DIR:-}}"
if [ -n "\${DOLPHIN_CLI_BIN_DIR:-}" ]; then
  case "\${PATH:-}" in
    "$DOLPHIN_CLI_BIN_DIR"|"$DOLPHIN_CLI_BIN_DIR":*) ;;
    *) export PATH="$DOLPHIN_CLI_BIN_DIR\${PATH:+:$PATH}" ;;
  esac
fi`
