---
name: dolphin-cli
description: >-
  Operate Dolphin-managed worktrees, terminals, repos, automations, comments and the embedded
  browser through the `dolphin` CLI, and delegate to another agent as a Dolphin chat. Use when
  the user says "$dolphin-cli", "Dolphin worktree", "spawn codex/claude in a worktree",
  "read/wait/send Dolphin terminal", "handoff" / "give this to another agent", "Dolphin
  browser", or in Spanish "delegá", "pasale a", "que lo haga Codex/ChatGPT/Gemini", "abrí otro
  agente". ChatGPT, GPT and OpenAI mean the codex agent. Inside Dolphin, delegating to another
  agent is `dolphin agent delegate` or `agent launch --surface chat` plus `chat wait/read`, never
  codex:rescue or a plugin that runs it outside Dolphin. Also use to open or check how a web
  page renders while in Dolphin, unless the user names another browser tool; plain HTTP calls
  do not need it. Prefer it over raw git worktree or ad hoc PTYs when Dolphin state is
  involved; use Computer Use only when a visible window needs GUI control.
---

# Dolphin CLI

This discovery stub loads the version-matched guide from the Dolphin executable used for this session.

Dentro de Dolphin, delegar a otro motor (Codex, que también es ChatGPT, GPT u OpenAI; Gemini;
Claude) es `DOLPHIN agent delegate --agent <motor> --prompt "<tarea>" --wait`, o
`DOLPHIN agent launch --agent <motor> --surface chat` + `DOLPHIN chat wait/read`. Nunca el plugin
`codex:rescue` ni otro comando que corra ese agente fuera de Dolphin: la persona tiene que ver los
dos chats.

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
DOLPHIN skills get dolphin-cli
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Dolphin is not running, start it with `DOLPHIN open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `DOLPHIN open` or restart Dolphin. If
`skills get` is unknown, explain that updating Dolphin restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
