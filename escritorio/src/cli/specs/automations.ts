import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const AUTOMATION_TARGET_FLAGS = [
  'repo',
  'workspace',
  'project',
  'host',
  'project-host-setup',
  'source-context',
  'workspace-mode',
  'base-branch',
  'setup'
]
const AUTOMATION_SCHEDULE_FLAGS = ['trigger', 'schedule', 'time', 'day', 'timezone']
const AUTOMATION_PRECHECK_FLAGS = ['precheck', 'precheck-timeout']
const AUTOMATION_STATE_FLAGS = [
  'enabled',
  'disabled',
  'missed-run-grace-minutes',
  'reuse-session',
  'fresh-session'
]

export const AUTOMATION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['automations', 'list'],
    summary: 'List scheduled Dolphin automations',
    usage: 'dolphin automations list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['dolphin automations list', 'dolphin automations list --json']
  },
  {
    path: ['automations', 'show'],
    summary: 'Show one Dolphin automation',
    usage: 'dolphin automations show <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id'],
    examples: ['dolphin automations show 2f9e...', 'dolphin automations show --id 2f9e... --json']
  },
  {
    path: ['automations', 'create'],
    summary: 'Create a scheduled Dolphin automation',
    usage:
      'dolphin automations create --name <name> --trigger <preset|cron|rrule> --prompt <text> --provider <agent> [--precheck <command>] [--setup run|skip] [--repo <selector>|--workspace <selector>|--project <id-or-name> [--host <host>]|--project-host-setup <id>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'name',
      'prompt',
      'provider',
      'extra-agent-args',
      ...AUTOMATION_PRECHECK_FLAGS,
      ...AUTOMATION_TARGET_FLAGS,
      ...AUTOMATION_SCHEDULE_FLAGS,
      ...AUTOMATION_STATE_FLAGS
    ],
    notes: [
      'Trigger accepts hourly, daily, weekdays, weekly, a 5-field cron expression, or an RRULE string.',
      'When --repo is omitted, the CLI uses the enclosing Dolphin worktree when one can be resolved from cwd.',
      'Use --project, or --project-host-setup, to run on a specific project host setup. --project takes the project id or the display name from `dolphin project list`, and --host is only needed when the project is set up on more than one host.',
      '--host takes local, ssh:<target-id>, runtime:<environment-id>, or the bare host name `dolphin host list` prints for any of them.',
      'Use --source-context with a JSON TaskSourceContext when task/provider data should come from a specific host/account; pass null on edit to clear it.',
      'Use --workspace to run in an existing worktree. With --repo or a project target, the automation creates a new worktree per run; with no target, a local create runs in the current Dolphin worktree unless you pass --workspace-mode new-per-run.',
      'Use --setup run|skip for repository setup on new-per-run automations. Explicit choices override the repository setup policy and need a host running current Dolphin. When omitted on create, no choice is saved; current Dolphin skips setup.',
      'Use --precheck to run a command only before scheduled runs; exit code 0 continues, any other exit, error, or timeout skips the run.',
      'Use --precheck-timeout <seconds> to set the time limit (default 60 seconds). Skips appear in Dolphin run history and dolphin automations runs --id <automation-id> as skipped_precheck.',
      'Run now in Dolphin and dolphin automations run intentionally bypass the precheck so you can test or override the scheduled condition.',
      'Use --reuse-session only with existing-workspace automations to submit later runs to the previous live automation session when it is still available. Use --fresh-session to disable reuse.',
      'Use --extra-agent-args="--model opus --effort high" to add arguments after the host\'s default agent Arguments on each fresh run. Only model, effort, and a few safe options are accepted (Antigravity, Claude, Codex, CodeBuddy, Cursor, Grok, OMP, Pi); extras cannot be combined with --reuse-session. On edit, --extra-agent-args= clears them.'
    ],
    examples: [
      'dolphin automations create --name "Daily review" --trigger daily --prompt "Review open changes" --provider codex',
      'dolphin automations create --name "Weekday triage" --trigger "0 9 * * 1-5" --prompt "Triage issues" --provider claude --repo my-repo',
      'dolphin automations create --name "PR review" --trigger hourly --precheck "gh pr list --json number -q .[0].number" --prompt "Review requested PRs" --provider codex',
      'dolphin automations create --name "Docs pass" --trigger daily --prompt "Tidy the docs" --provider claude --extra-agent-args="--model opus --effort high --add-dir docs"'
    ]
  },
  {
    path: ['automations', 'edit'],
    summary: 'Edit a Dolphin automation',
    usage:
      'dolphin automations edit <id> [--name <name>] [--trigger <preset|cron|rrule>] [--setup run|skip] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'id',
      'name',
      'prompt',
      'provider',
      'extra-agent-args',
      ...AUTOMATION_PRECHECK_FLAGS,
      ...AUTOMATION_TARGET_FLAGS,
      ...AUTOMATION_SCHEDULE_FLAGS,
      ...AUTOMATION_STATE_FLAGS
    ],
    positionalArgs: ['id'],
    notes: [
      'Use --setup run|skip only for new-per-run automations. Omit it to preserve the saved setup choice.'
    ],
    examples: [
      'dolphin automations edit 2f9e... --disabled',
      'dolphin automations edit --id 2f9e... --trigger "30 * * * *" --json',
      'dolphin automations edit 2f9e... --extra-agent-args='
    ]
  },
  {
    path: ['automations', 'remove'],
    destructive: true,
    summary: 'Remove a Dolphin automation and its run history',
    usage: 'dolphin automations remove <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id'],
    examples: [
      'dolphin automations remove 2f9e...',
      'dolphin automations remove --id 2f9e... --json'
    ]
  },
  {
    path: ['automations', 'run'],
    summary: 'Run a Dolphin automation now',
    usage: 'dolphin automations run <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id'],
    notes: [
      'Use the full automation UUID from dolphin automations list; shortened prefixes are not accepted.',
      'Like Run now in Dolphin, this manually starts a run without executing the precheck; prechecks gate scheduled runs only.',
      'A queued or dispatching run has been accepted but may not have a workspace or terminal yet. Use dolphin automations runs --id <automation-id> to follow its progress.'
    ],
    examples: [
      'dolphin automations run 497bafa9-5a97-4f85-9e48-2b211b8f31fa',
      'dolphin automations run --id 497bafa9-5a97-4f85-9e48-2b211b8f31fa --json'
    ]
  },
  {
    path: ['automations', 'runs'],
    summary: 'List automation run history',
    usage:
      'dolphin automations runs [--id <automation-id>] [--limit <n>] [--cursor <cursor>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'limit', 'cursor'],
    notes: [
      'Without --limit or --cursor, reads the whole history in pages, so a large history from a paired server still fits in its replies.',
      'With --limit or --cursor, prints one page (newest first, at most 100 runs) and its nextCursor; pass that as --cursor for the next page.'
    ],
    examples: [
      'dolphin automations runs',
      'dolphin automations runs --id 2f9e... --json',
      'dolphin automations runs --limit 20 --json'
    ]
  }
]
