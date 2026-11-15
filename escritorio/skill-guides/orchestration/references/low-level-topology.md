# Low-level topology

```text
DOLPHIN terminal create --worktree active --title <task_name> --command "<agent_command>" --json
DOLPHIN terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
DOLPHIN orchestration dispatch --task <task_id> --to <handle> --inject
```

To give a Task to a terminal or chat Dolphin did not start:

```text
DOLPHIN orchestration worker-start --task <task_id> --terminal <handle> --worktree <its_workspace> --json
```
