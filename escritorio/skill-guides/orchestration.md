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
  Otherwise prefer your own subagents, including for long or parallel work. Use
  `dolphin-cli` to hand work off with nothing expected back ("hand off", "give
  this to another agent", "another worktree"), and for terminals, shell commands
  and worktree management.
---

# Dolphin orchestration

If your prompt has a preamble with Task and Dispatch IDs, you are a worker:
follow the preamble. To ask your coordinator, run `ask`, then end your turn;
Dolphin wakes you with the answer. To hand work off with nothing back, use `dolphin-cli`.

## Recipe

`DOLPHIN` stands for the executable you used to run `skills get`; type it in its
place and use it for every command.

```text
DOLPHIN orchestration worker-start --spec "<task>" --worktree current --agent codex
```

- Start every independent worker, then **end your turn**. "Report back" and
  "tell me when it's done" still mean end your turn; Dolphin wakes you and you
  report then.
- If a receipt has `next`, follow it. When Dolphin has nothing for you, end your
  turn.
- `--worktree current` uses your workspace. Use a new one only when the user
  asks or sharing would conflict: `--worktree new-child --name <short-name>`
  nests it under yours. For one with no parent, use
  `--worktree new-top-level --repo id:<repoId> --name <short-name>`
  (`DOLPHIN repo list --json` gives the id). If nothing needs to come back to you
  (the user will work in those chats), don't start workers; per workspace run
  `DOLPHIN worktree create --name <name> --no-parent --agent <agent> --prompt "<brief>" --json`
  and end your turn.
- Add `--model` only if the user named one.
- If `worker-start` fails, do not rerun it; read `failedStage` and load
  `references/recovery-and-cleanup.md`.
- To talk to a worker, use
  `DOLPHIN orchestration send --to dispatch:<dispatch_id> --subject "<topic>" --body "<message>"`
  in any state: a working worker gets it when its current turn ends; a finished
  or closed one gets it as a follow-up Task and reports with `worker_done`. The
  receipt says which.
  Except on a paired server: a finished worker there refuses `send`, so start
  new work there with `worker-start --on <server>` (load
  `references/placement-and-remote.md` first).

## Delegar a otro motor y que la persona lo vea

«Delegá a Codex/ChatGPT/GPT/OpenAI», «pasale esto a Gemini», «que lo haga Claude» o «abrí otro
agente»: dentro de Dolphin es siempre un agente de Dolphin. ChatGPT, GPT y OpenAI son `--agent codex`.

**La regla:** dentro de Dolphin, delegar a Codex/ChatGPT/GPT/OpenAI es
`DOLPHIN agent launch --agent codex --surface chat …` + `DOLPHIN chat wait/read`, o un worker de
esta guía, y **no** el plugin `codex:rescue` ni ningún comando que corra Codex fuera de Dolphin.

- Una tarea y su respuesta, con el chat a la vista:
  `DOLPHIN agent delegate --agent codex --prompt "<tarea>" --wait --json` (los pasos sueltos
  están en la guía `dolphin-cli`, «Delegar a otro motor»).
- Que Dolphin te despierte con el resultado, o varias tareas:
  `DOLPHIN orchestration worker-start --spec "<tarea>" --worktree current --agent codex --keep-open`,
  y terminá el turno. `--keep-open` deja el chat de Codex abierto para que la persona lo use.
- Si el otro agente pide una aprobación, es de la persona: decíselo, no la esperes.

Never:

- Poll or run watch scripts: a script's plain `check` takes your mail, so it is
  hidden from you and Dolphin has nothing to wake you with. Dolphin wakes you.
- Steer through a worker's terminal; use `send`.
- Make checkouts yourself; let `worker-start` create a worker's workspace.

## When Dolphin wakes you

- In a chat, each message arrives whole as its own message: act on it. A wake
  that names a `check` command (a terminal, or one message too large for a chat
  message) means run that command. Answer a `question` with
  `DOLPHIN orchestration reply --id <message_id> --body "<answer>"` when the answer
  follows from the task or the user's instructions; otherwise ask the user first.
- An `escalation` with `stopReason` means the worker stopped without
  `worker_done`: steer it with `send`, stop and retry it, or tell the user.
- An `escalation` with an `approval` is a worker's permission prompt that only a
  person can allow: carry on with other work until its closing message arrives,
  and deny it with a reason only if it is holding up the task.
- A `worker_done` settles its Task; never mark a reported failure completed.
- When every worker has settled, report to the user per Task: outcome,
  evidence, open blockers.
- Lost track? `DOLPHIN orchestration inbox --terminal run:<run_id> --limit 50`
  shows mail `check` already handled.

Finished workers close on their own unless `worker-list` gives one a `next`; follow
it. Kept-open workers, including new-workspace ones, stay open for the user.
`send` reopens a closed worker when you need it again.
Start a worker in your workspace with `--keep-open` when the user will keep using
its chat after it reports: they want to watch it or talk to it. To keep one already
started, run
`DOLPHIN orchestration worker-keep-open --dispatch <dispatch_id>`.

## Task spec

Make each spec self-contained: the target, the change, constraints, what the
worker may edit, and the evidence that proves it is done. Say whether a
non-zero exit means the Task failed or capturing it is the deliverable. Send
fixes to a worker unless the user gave them to you.

Fetch this guide once. Summarize the worker's evidence; rerun checks only for a
gap or contradiction.

## Safety

Silence, a timeout, or `unverifiable` liveness alone never proves exit or authorizes
autonomous recovery. For explicit user cancellation or assignment abandonment,
load `references/recovery-and-cleanup.md`: requesting a guarded stop or fencing an
assignment does not prove its agent stopped.

## References

`DOLPHIN skills get orchestration --reference references/<file>.md`

| Situation                                      | Reference                            |
| ---------------------------------------------- | ------------------------------------ |
| Task DAGs, several Runs                        | `references/coordinator-loop.md`     |
| Child worktrees, SSH, WSL, a connected server  | `references/placement-and-remote.md` |
| Group messages                                 | `references/messaging-and-gates.md`  |
| A failed or unknown worker; retry, stop, reset | `references/recovery-and-cleanup.md` |
| Custom argv or terminal layout                 | `references/low-level-topology.md`   |
