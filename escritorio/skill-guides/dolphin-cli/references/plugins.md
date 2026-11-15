# Plugin commands

Use these to make, check, load, install and manage Dolphin plugins (themes, terminal themes, icon
themes, syntaxes, language packs, custom editors, panels, TSX component panels). All commands take
`--json`; branch on `error.code`, not on wording.

```text
DOLPHIN plugin create <dir> --template <theme|terminal-theme|icon-theme|syntax|language-pack|editor|panel|components|worker-panel> [--id <id>] [--name <name>] --json
DOLPHIN plugin types <dir> --json
DOLPHIN plugin validate <dir|dolphin-plugin.json|dolphin-catalog.json> --json
DOLPHIN plugin inspect <dir> --json
DOLPHIN plugin release-entry <dir> --json
DOLPHIN plugin test [dir] --json
DOLPHIN plugin check [dir] --json
DOLPHIN plugin dev watch <dir> [--check] [--shot <out-dir> [--shot-panel <id>]] [--approve <fingerprint>] --json
DOLPHIN plugin dev load <dir> [--approve <fingerprint>] --json
DOLPHIN plugin dev reload [<dir>] [--approve <fingerprint>] --json
DOLPHIN plugin dev emit <dir|plugin-key> <event> [--data <json>] --json
DOLPHIN plugin dev request <dir|plugin-key> <name> [--data <json>] [--panel <id>] [--timeout-ms <ms>] --json
DOLPHIN plugin dev unload <dir|plugin-key> --json
DOLPHIN plugin list --json
DOLPHIN plugin logs <plugin-key> --json
DOLPHIN plugin enable <plugin-key> [--approve <fingerprint>] --json
DOLPHIN plugin disable <plugin-key> --json
DOLPHIN plugin system on|off --json
DOLPHIN plugin restart <plugin-key> --json
DOLPHIN plugin open <plugin-key> [--panel <id> | --editor <file>] --json
DOLPHIN plugin shot <plugin-key> [--panel <id>] [--theme light|dark] [--width <px>] [--act '<json>'] [--out <file.png>] --json
DOLPHIN plugin shot <dir> --scenario <name> [--panel <id>] [--theme light|dark] [--width <px>] [--out <file.png>] --json
DOLPHIN plugin install <publisher.id|owner/repo[@ref]|git-url|page-url|dir> [--ref <ref>] [--catalog <name>] [--approve <fingerprint>] --json
DOLPHIN plugin update <plugin-key|--all> [--approve <fingerprint>] --json
DOLPHIN plugin uninstall <plugin-key> --json
DOLPHIN plugin catalog list --json
DOLPHIN plugin catalog add <owner/repo|git-url> [--ref <branch>] [--approve <fingerprint>] --json
DOLPHIN plugin catalog rm <id|name|url> --json   # alias: catalog remove
```

Exit codes: `0` ok, `1` error, `2` `plugin_invalid`, `3` `approval_required` or `approval_stale`.

## Make and load a plugin

1. `plugin create` into a new folder. Leave out `--publisher`: Dolphin names the publisher after the
   repository owner (`local` for a folder); an `dolphin-` id prefix is reserved. `components` is a TSX
   panel with no build step; `.ts`/`.tsx` files load as written, importing only `dolphin` and
   relative files. `plugin types <dir>` (also run by `plugin dev load`) writes the typings to
   `.dolphin/types/`, which the plugin's `tsconfig.json` extends.
2. Edit the files. Field rules: `docs/reference/plugin-manifest.md`, `plugin-themes.md`,
   `plugin-theme-tokens.md`, `plugin-syntax.md` and `plugin-authoring.md` in the Dolphin repository.
3. `plugin validate` until it passes. It is offline and never runs plugin code. For components
   panels, `plugin check` also renders each panel once in Node and reports runtime errors with
   file:line, and `plugin test` runs the plugin's `*.test.ts(x)` files with `dolphin/testing`
   (see `docs/reference/plugin-declarative-ui.md`, "Testing"). Both run the plugin's code
   unsandboxed on this machine: use them only on code you trust.
4. `plugin dev load <dir>` adds the folder to Settings → Plugins → Development folders on the
   Dolphin host and loads it. Dolphin reloads it, and restarts its worker, when its files change; run
   `plugin dev reload <dir>` if a change was missed. `plugin restart <plugin-key>` stops a
   worker so its next command or event reruns its startup code. `plugin logs` shows what a worker printed and a panel's or editor's
   console errors, warnings and uncaught exceptions as `[frame] <file>:<line> <message>`.
   `plugin dev inspect <plugin-key>` opens DevTools windows for its open frames; run it only
   when the user asks. `plugin dev watch <dir> --json` does the load, then stays running and
   prints one JSON object per line (`type`: `loaded`, `log`, `reloaded`, `status`, `approval`,
   `check`, `shot`, `shot_skipped`, `warning`, `disconnected`, `unloaded`) as logs arrive and saves reload it;
   run it in a background terminal and read its output. Ctrl-C unloads the folder it loaded.
   `plugin dev emit <dir|plugin-key> <event> --data '<json>'` fires a test event at a
   development plugin's worker (if it lists the event in `contributes.events`) and its open
   panels that subscribed with `dolphin.on`; the payload is checked against the event's schema.
   Handler errors show in `plugin logs` and the watch.
   `plugin dev request <dir|plugin-key> <name> --data '<json>'` calls the worker's
   `dolphin.panels.handle(name)` handler as a panel's `plugin.request` would and prints
   `{ pluginKey, name, result }`; a handler failure is `plugin_request_failed` with the worker's
   code in `error.data.requestCode`.
5. See what you built: `plugin shot <plugin-key> --json` writes a PNG of a panel exactly as Dolphin
   draws it (default `.dolphin/shots/<plugin-key>-<panel>.png`, in the plugin folder when run inside
   one; `--width` applies to that capture only, and `--theme` too but only while Dolphin's window is
   hidden or minimized, else `themeApplied: false` with a `themeReason`) and lists the errors the
   panel showed or logged; read the image file. A components panel's shot also waits for its
   host calls (`plugin.request`) to answer, at most 3s; `pendingRequests` counts any still out.
   `--act '[{"type":{"label":"New task"},"text":"Ship"},{"press":{"text":"Add"}}]'`
   first drives a components panel with the test kit's verbs (`press`, `type`, `select`,
   `toggle`, `slide`, Table `sort`/`selectRows`/`activateRow`/`loadMore`, Tree
   `expand`/`collapse`/`selectItem`/`activateItem`; at most 20) and reports
   `actions: [{ ok, error? }]`; it needs Dolphin's window hidden or minimized and never counts as a
   user gesture. Afterwards the panel's atoms are put back (`restored`); worker-side effects stay.
   `plugin shot <dir> --scenario <name>` shoots one `<entry>.check.ts` scenario instead: it renders
   it here like `plugin check` (unsandboxed, the worker on a stand-in host), and Dolphin draws that
   tree apart from the plugin, so the live panel, storage and worker are never touched. It returns
   `replay: true` and `scenario`; a still frame (images placeholder, no `--act`), local only,
   window hidden or minimized; an unknown name lists the scenarios. `plugin dev watch <dir> --shot <out-dir>` opens one panel once (the
   first, or `--shot-panel <id>`) and captures it after every reload while it stays on screen;
   when the user shows something else it skips (`shot_skipped`) and never switches back. `plugin open
   <plugin-key>` shows a panel to the user (`--editor <file>` opens a file in its custom editor).
   Both need the desktop app with a workspace showing and never raise the window.
6. `plugin dev unload <dir>` when done.

Paths are on the machine that runs Dolphin. With `--environment <server>`, pass an absolute path
on that server. From an SSH or WSL shell that forwards `dolphin` to another machine, the authoring
and dev commands refuse; work on the Dolphin host instead.

`plugin_system_disabled` means plugins are off on that host. Ask the user to click "Turn on
plugins" in Settings → Plugins, or on a host with no window (`dolphin serve`) to run
`plugin system on` with the same `--environment`. It approves nothing; only plugins approved
earlier start.

## Install, update and remove

`plugin install` accepts:

- a catalog id such as `acme.dusk` (from Dolphin's official, the community or an added catalog;
  `--catalog` picks one when several list it),
- `owner/repo` or `owner/repo@v1.2.0` on GitHub,
- any `https://` or `ssh://` Git URL or `git@host:owner/repo.git`, with `#ref` for a version,
- a GitHub or GitLab release, tag or tree page URL (`.../releases/tag/v1.2.0`, `.../-/tree/main`),
- a plugin folder (a path on the Dolphin host).

With no version, Dolphin installs the newest version tag (`vX.Y.Z`), else the default branch, and
always pins the exact commit. The result names the version, commit, publisher and repository.

```text
DOLPHIN plugin install acme/dusk-theme --json                     # content only: installs and enables
DOLPHIN plugin install acme/notes-panel@v1.4.0 --json             # code: exits 3 with approval_required
DOLPHIN plugin install acme/notes-panel@v1.4.0 --approve ap1-… --json
DOLPHIN plugin update --all --json
DOLPHIN plugin uninstall acme.notes-panel --json
```

`plugin update` moves catalog installs to the release their catalog offers now, Git installs from
a version tag to the newest version tag and from a branch to its newest commit; a commit pin stays.
An update from the same repository that asks for no new access keeps its approval. One that adds
capabilities, a higher execution level, commands, shortcuts or panels, or that comes from another
repository (even a theme or language pack), fails with `approval_required` listing exactly what
changes; the running version keeps working until it is approved. `--all` updates everything it can and exits 3 with one
`--approve` command per plugin still waiting.

`plugin uninstall` and `plugin catalog rm` never need approval. `plugin catalog add` always
does: a catalog decides which repositories Dolphin installs and auto-updates from, so the first run
returns `approval_required` with a `cat1-…` fingerprint for that exact URL and branch.

## Private repositories

Git runs on the Dolphin host (the `--environment` server when given) with that machine's own Git
credentials and never prompts. Nothing to pass to `dolphin`; set up Git there once:

- HTTPS on GitHub: `gh auth login` then `gh auth setup-git`. GitLab: `glab auth login`. Elsewhere:
  any credential helper (Git Credential Manager, osxkeychain, libsecret).
- SSH: a key in `ssh-agent` that the server accepts, with its host key in `known_hosts`, then
  install with `git@github.com:owner/repo.git`.

```text
DOLPHIN plugin install git@github.com:acme/private-panel.git --json
DOLPHIN plugin install https://github.com/acme/private-panel --json
```

If that host's Git cannot read the repository, the command fails with `git_auth_failed`.
`error.data` has `executionHost`, `transport` (`https` or `ssh`), `gitHost` and `nextSteps` for
that host. Never put a token or password in the URL; Dolphin refuses it.

## Approval

- Content-only plugins (themes, terminal themes, icon themes, syntaxes, language packs) load,
  install and enable without approval.
- Anything that runs code or acts in Dolphin (panels, editors, commands, shortcuts, workers,
  capabilities) fails with `approval_required` (exit 3). `error.message` and `error.data`
  say exactly what it would be granted, why approval is needed, and `error.data.command`, the
  same command with `--approve <fingerprint>`.
- The fingerprint is bound to that plugin, version, files and access. A different plugin,
  version, set of files, or more access gets `approval_stale` with the new grants and a new
  fingerprint.
- Approving grants real access on the user's machine or server. Ask your user before re-running
  with `--approve` unless they already asked for exactly this plugin and this access. Never pass a
  fingerprint you did not get from Dolphin for this exact command. Each approval is written to the
  plugin audit log as approved via CLI.
- `install` and `update` decide approval before writing anything: without it nothing is
  installed and the running version is untouched. For anything not from Dolphin's official catalog
  the message also names the publisher (the repository owner) and the source repository; show
  that to your user, since Dolphin has not checked that code.
- Without approval a development folder stays loaded but nothing in it runs.
- For an approved development folder, later code edits run without asking again; new
  capabilities, a higher execution level, or changed commands and shortcuts need a new approval.
- `disable`, `restart`, `uninstall`, `dev unload` and `catalog rm` never need approval.

## Publish

There is no publish command. Use Git and `gh` with the user's own credentials:

1. `plugin validate .` must pass, and the work must be committed and pushed to the GitHub
   repository that will own it (its owner becomes the publisher).
2. Set `version` in `dolphin-plugin.json`, commit, then tag that commit `v<version>` and push the
   tag: `git tag -a v1.2.0 -m v1.2.0 && git push origin v1.2.0`.

For a catalog (`dolphin-catalog.json`), commit the plugin and run `plugin release-entry <dir>`: it
prints the `releases` entry for `HEAD` (and the `source.path` for a plugin in a subdirectory) to
paste into the catalog, newest first.

Publishing is public and acts under the user's GitHub identity; do it only when the user asked
to publish.
