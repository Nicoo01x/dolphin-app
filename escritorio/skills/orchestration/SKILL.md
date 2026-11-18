---
name: orchestration
description: >-
  Run work in separate Dolphin worker agents and get their results back. Use when
  the user asks for Dolphin workers or supervision (monitor, task DAGs, ask/reply,
  decision gates), or when the work needs a different agent (such as Codex from
  Claude) or its own Dolphin workspace. "Have Codex (or Claude) review this and
  report back" means a Dolphin worker of that agent, even when you have your own
  subagents; so do "delegá", "pasale a", "que lo haga Codex/ChatGPT/Gemini" and
  "abrí otro agente". ChatGPT, GPT and OpenAI mean the codex agent; never use
  codex:rescue or a plugin that runs it outside Dolphin. Also use when you are a
  dispatched worker (a prompt with Task and Dispatch IDs: ask, worker_done).
  When the user asks to split the work ("delegá las tareas", "usá subagentes",
  "en paralelo"), follow `dolphin skills get dolphin-delegar`: Dolphin workers
  the user can watch.
  Otherwise prefer your own subagents for work nobody asked to see. Use
  `dolphin-cli` to hand work off with nothing expected back ("hand off", "give
  this to another agent", "another worktree"), and for terminals, shell commands
  and worktree management.
---

# Dolphin Orchestration

This discovery stub loads the version-matched guide from the Dolphin executable used for this session.

Never substitute a non-Dolphin subagent tool when the user asked for Dolphin orchestration.
Dentro de Dolphin, «delegá a Codex/ChatGPT/GPT/OpenAI» es un agente de Dolphin
(`agent delegate`, `agent launch --surface chat` o `worker-start`), nunca el plugin `codex:rescue`.

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
DOLPHIN skills get orchestration
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers the normal local coordinator loop and dispatched-worker
obligations. For a conditional action gate such as remote placement, uncertain release
recovery, or expanded DAG work, load only the reference that gate names with
`DOLPHIN skills get orchestration --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`DOLPHIN skills get orchestration --full` and read the named bundled reference before acting.

Use the selected executable's `--help` for commands or flags the guide does not cover. If a
command reports that Dolphin is not running, start it with `DOLPHIN open --json` and retry. If it
fails with `runtime_access_denied`, your sandbox blocked the connection: re-run it with
escalated permissions, and do not run `DOLPHIN open` or restart Dolphin. If `skills get` is unknown,
explain that updating Dolphin restores the guide; use `--help` for read-only discovery and do not
guess unsupported commands.
