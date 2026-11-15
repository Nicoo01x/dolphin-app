---
name: dolphin-computer-use
description: >-
  Drives the GUI of a visible local app window through `dolphin computer`: accessibility
  tree, clicks, typing, menus, dialogs, and screenshots in native apps and external
  browser windows (Chrome, Edge, Safari) or webviews. Prefer a programmatic path
  (shell, filesystem, git, HTTP, existing CLIs) whenever it can complete the task.
  Use only when a visible window needs GUI control those cannot reach. Do not use
  for Dolphin's embedded browser (`dolphin-cli`).
---

# Dolphin Computer Use

This discovery stub loads the version-matched guide from the Dolphin executable used for this session.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `DOLPHIN_CLI_COMMAND` environment variable is set, use its value, even when another
  `dolphin` comes first on `PATH`. Dolphin sets it to its own CLI in the terminals and chats it
  starts, including managed WSL sessions. Quote it if the path has spaces (`& "<path>"` in
  PowerShell).
- Otherwise, in a dev checkout whose session exposes `DOLPHIN_DEV_REPO_ROOT`, use `dolphin-dev`.
- Otherwise, use `dolphin`.

Below, `DOLPHIN` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `DOLPHIN` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Dolphin build.

## Load the version-matched guide before running Dolphin commands

```text
DOLPHIN skills get computer-use
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Dolphin is not running, start it with `DOLPHIN open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `DOLPHIN open` or restart Dolphin. If
`skills get` is unknown, explain that updating Dolphin restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
