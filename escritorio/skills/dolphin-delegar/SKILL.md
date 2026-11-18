---
name: dolphin-delegar
description: >-
  Split the user's request into tasks and run each one as a visible Dolphin agent (its own tab,
  showing which AI it is: Claude, Codex, Gemini...), then collect their results. Use inside
  Dolphin when the user says "delegá las tareas", "delegá", "repartí las tareas", "repartilo",
  "usá subagentes", "armá un equipo", "hacelo en paralelo", "que lo hagan varios agentes",
  "delegate the tasks", "use subagents", "split this up" or "in parallel". Inside Dolphin these
  mean Dolphin workers the user can watch, never your own built-in subagent or task tool and never
  a plugin that runs another agent outside Dolphin: those are invisible to the user. ChatGPT, GPT
  and OpenAI mean the codex agent. Never starts agents with permissions skipped unless the user
  asks for it.
---

# Dolphin: delegar las tareas

This discovery stub loads the version-matched guide from the Dolphin executable used for this session.

Dentro de Dolphin, «delegá las tareas», «repartí», «usá subagentes» o «en paralelo» quiere decir:
partir el pedido y lanzar cada tarea como un agente de Dolphin que la persona ve en su propia
pestaña (`DOLPHIN orchestration worker-start --spec-file - --task-title "<título>" --agent <motor>
--keep-open`), una por tarea, y terminar el turno hasta que reporten. Nunca tu herramienta interna
de subagentes ni un plugin que corra otro motor por fuera de Dolphin: la persona no los ve. Nunca
con los permisos salteados si la persona no lo pidió.

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
DOLPHIN skills get dolphin-delegar
```

It covers splitting the request, checking which agents are installed (`DOLPHIN agent list`),
where each one works, launching them, telling the user where to watch, and collecting results.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Dolphin is not running, start it with `DOLPHIN open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `DOLPHIN open` or restart Dolphin. If
`skills get` is unknown, explain that updating Dolphin restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
