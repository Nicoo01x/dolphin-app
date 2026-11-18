import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_LAUNCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'launch'],
    summary: 'Start an agent in an existing workspace, as a chat or a terminal',
    usage:
      'dolphin agent launch --agent <id> [--worktree <selector>] [--prompt <text>] [--model <id>] [--effort <level>] [--surface chat|terminal] [--focus] [--retry-launch <operationId>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'agent',
      'worktree',
      'prompt',
      'model',
      'effort',
      'surface',
      'focus',
      'retry-launch'
    ],
    notes: [
      '--agent takes an agent id; chatgpt, gpt and openai are accepted as codex.',
      'Starts the agent the way a new agent tab does: as a chat when your Chat | CLI choice for the agent is Chat and the agent and host support it, otherwise as a terminal. The result says which (`outcome.kind`) and why (`receipt.detail`).',
      '--surface chat|terminal picks for this launch instead of your setting. --surface terminal always runs the agent CLI; --surface chat is refused when Dolphin can establish before starting anything that this agent cannot open as a chat there. If support cannot be checked, the launch can fall back to a terminal. If chat becomes unavailable after creating a workspace, Dolphin keeps the workspace, setup and default tabs, then opens a terminal; the receipt explains the fallback.',
      '--worktree defaults to the native folder workspace or worktree containing the current directory. For a new checkout with its agent, use `dolphin worktree create --agent`.',
      '--model takes a provider model id (OMP also takes its model roles and selectors) and --effort a reasoning effort for that model; --effort requires --model. They apply to either surface.',
      'The tab opens without switching focus; pass --focus to switch to it.',
      'If the launch reply is lost, re-issue the same command from the same directory on the same host with --retry-launch <operationId> from the error. Never retry as a fresh launch; older hosts require inspecting the workspace first.'
    ],
    examples: [
      'dolphin agent launch --agent codex --json',
      'dolphin agent launch --agent codex --model gpt-6-astra --effort high --prompt "Write the design doc" --json',
      'dolphin agent launch --agent claude --worktree path:/projects/myapp --focus'
    ]
  },
  {
    path: ['agent', 'delegate'],
    summary: 'Hand a task to another agent as a chat here, and get its answer back',
    usage:
      'dolphin agent delegate --agent <id> (--prompt <text> | --prompt-file <path|->) [--worktree <selector>] [--model <id>] [--effort <level>] [--wait] [--timeout-ms <ms>] [--focus] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'agent',
      'prompt',
      'prompt-file',
      'worktree',
      'model',
      'effort',
      'wait',
      'timeout-ms',
      'focus'
    ],
    notes: [
      'Starts the agent as a chat in the current workspace (like `agent launch --surface chat`) with the task as its first message. The user sees both chats.',
      '--agent takes an agent id; chatgpt, gpt and openai are accepted as codex.',
      '--wait waits like `chat wait` and returns `settled` plus `reply`, the agent\'s last message. "blocked" means it is asking the user for an approval or a question: tell the user, do not wait on it. "blocked", "held" and "timeout" exit 1.',
      'Without --wait it returns once the chat has the task; read it later with `chat wait --session <session>` or `chat read`.',
      'If Dolphin can only open the agent as a terminal, or the task did not reach it, it exits 1 and names the handle.',
      'Use this inside Dolphin instead of plugins or subagents that run another agent outside Dolphin.'
    ],
    examples: [
      'dolphin agent delegate --agent codex --prompt "Review the diff and list bugs" --wait --timeout-ms 900000 --json',
      'dolphin agent delegate --agent chatgpt --prompt "Write the migration" --json',
      'cat brief.md | dolphin agent delegate --agent gemini --prompt-file - --wait --json'
    ]
  },
  {
    path: ['agent', 'list'],
    summary: 'List the agents Dolphin can start in this workspace',
    usage: 'dolphin agent list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Lists the agent CLIs found on the host of the workspace that contains the current directory (its WSL distro or SSH host included), the same list the new-agent menu shows. Outside a workspace it lists this host.',
      'Each entry is the id `--agent` takes in `agent launch`, `agent delegate` and `orchestration worker-start`, with its name and the aliases it accepts.',
      'Found means installed, not signed in: an agent that needs a login says so in its own tab.'
    ],
    examples: ['dolphin agent list', 'dolphin agent list --json']
  }
]
