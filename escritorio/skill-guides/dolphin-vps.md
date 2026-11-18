---
name: dolphin-vps
description: >-
  Connect a permanent server (a VPS from Hostinger, DigitalOcean, Hetzner, AWS or any Linux or
  macOS machine reachable over SSH) to Dolphin so work runs there, and fix it when the
  connection or Dolphin's server on it fails. Use when the person says "I need this working on
  my VPS", "connect my server", "the SSH host won't connect", or Dolphin hands you a failed host
  with `dolphin host doctor`. Use `dolphin-per-workspace-env` instead for disposable machines
  created per workspace.
---

# Dolphin on a VPS

`DOLPHIN` is a placeholder for the executable you resolved in the stub; substitute it before running.

The goal is one fact: `DOLPHIN host doctor <id> --json` prints `"ok": true`. That means SSH connects
from this computer, and Dolphin's server (`dolphind`) runs on the host and answers. Everything below
is how to get there and how to read the doctor when it is not there yet.

## Autonomy envelope

Without asking again you may: read `~/.ssh/config` and list `~/.ssh` (names, never key contents),
run read-only `ssh -o BatchMode=yes` probes, run `DOLPHIN host list | add | connect | doctor`, and
run read-only commands on the host (`uname -a`, `ldd --version`, `df -h`, `findmnt`, `systemctl status
ssh`).

Ask first before anything that changes the host or the account: installing packages, editing
`/etc/ssh/sshd_config`, opening firewall ports, creating users, `ssh-keygen` for a new key, or
`ssh-copy-id`. One OK covers the step it names.

Stop and hand over what only the person can do:

- **Typing a password or passphrase.** Never ask for one in the chat, never pass one on a command
  line, never write one to a file. `ssh-copy-id` and `ssh-add` prompt in the terminal: tell the
  person to type it there.
- **The provider's web panel** (Hostinger hPanel, firewall rules, the VPS's root password reset).
- **Signing an agent in on the host.** `claude auth login`, `gh auth login`, `codex login` and the
  like are interactive. Tell the person to run, in a terminal on this computer,
  `ssh -t <host> "claude auth login"` (or the `gh` / `codex` equivalent) and to tell you when done.

Never print, copy, log or commit a private key, a passphrase, a password or a token. `cat ~/.ssh/id_*`
without `.pub` is off limits; public keys (`*.pub`) are fine to read.

## What to ask the person

Ask once, together, only what you cannot find:

1. The address: IP or host name (Hostinger shows it under VPS > Overview).
2. The user. A fresh Hostinger VPS is `root`; a hardened one has its own user.
3. The SSH port, if it is not 22.
4. Whether they sign in with a key already, or only with the root password so far.

Look in `~/.ssh/config` first: a `Host` block for the server answers all four.

## The path, step by step

1. **SSH works from this computer, without prompts.** Dolphin connects with keys or ssh-agent
   (it asks for passwords in its own dialog, which an agent cannot answer).

   ```bash
   ssh -o BatchMode=yes -o ConnectTimeout=10 -p <port> <user>@<address> true && echo SSH_OK
   ```

   - `SSH_OK`: go to step 2.
   - `Permission denied (publickey…)`: there is no key on the host yet. If `~/.ssh/id_ed25519.pub`
     is missing, ask, then `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519` (the person picks a
     passphrase or none, in the terminal). Then `ssh-copy-id -i ~/.ssh/id_ed25519.pub -p <port>
     <user>@<address>`; the person types the server password once. Probe again.
   - Anything else: find the line in the reason table below and fix that first.

   Optional, and tidy: a `~/.ssh/config` block so every tool agrees on the details.

   ```text
   Host my-vps
     HostName 203.0.113.10
     User root
     Port 22
     IdentityFile ~/.ssh/id_ed25519
   ```

2. **Save it in Dolphin.**

   ```bash
   DOLPHIN host add --address <address> --user <user> [--port <port>] [--identity-file ~/.ssh/id_ed25519] --label my-vps --json
   ```

   It prints the target id (`ssh-…`). A host already saved with the same address, user and port is
   returned as it is, so this is safe to repeat. `--address` is the host name or IP; `--host` is a
   different flag (a selector) on every other command.

3. **Connect it, which installs Dolphin's server.**

   ```bash
   DOLPHIN host connect <id> --json
   ```

   The first connect uploads the server and its Node.js runtime and starts it: a few minutes. Later
   connects reuse it. `DOLPHIN host add … --install-server` does steps 2 and 3 in one go.

4. **Check it, fix, repeat.**

   ```bash
   DOLPHIN host doctor <id> --json
   ```

   Read `ok`, `reason`, `checks` and `nextSteps`. Fix the cause the reason names, then run the doctor
   again. Stop when `ok` is `true`, or when the only remaining step is one the person must do; say
   exactly what that step is.

5. **Finish.** Tell the person the host is ready, and that they can now pick it when they open a
   project or start a workspace. If an agent CLI on the host is not signed in yet, hand them the
   `ssh -t <host> "claude auth login"` step.

## Reading the doctor

`connection` is the SSH lifecycle status, `server` is `running`, `not-answering`, `not-running` or
`unknown`, and `reason` is a stable code. A reason that starts with `server:` means SSH worked and
the failure came after, while Dolphin set up or started its server. `DOLPHIN host list --json` shows
the same `lastFailure` for every host until it connects again.

The doctor exits 1 while the host is not ready, so it works as a loop condition.

## Reason table

| reason                                                                            | what it means                                                                      | how to fix it                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`                                                                            | The host refused every key Dolphin offered.                                        | Probe with `ssh -o BatchMode=yes …`. Wrong user, or the key is not in the host's `~/.ssh/authorized_keys`: `ssh-copy-id` (person types the password). Check `--identity-file` points at the private key, not the `.pub`.                                |
| `passphrase`                                                                      | The key is encrypted and Dolphin could not unlock it.                              | `ssh-add ~/.ssh/id_ed25519` in a terminal (the person types the passphrase), then connect again. Never ask for the passphrase.                                                                                                                          |
| `host-key`                                                                        | The host's key changed (often: the VPS was reinstalled) or could not be confirmed. | Confirm with the person that the server was rebuilt. Then `ssh-keygen -R <address>` (`ssh-keygen -R "[<address>]:<port>"` for a non-22 port), connect once with plain `ssh` to accept the new key, and connect again.                                   |
| `refused`                                                                         | Nothing listens on that address and port.                                          | Wrong port, or sshd is down: on the host's web console, `systemctl status ssh` (`sshd` on some distros) and `systemctl enable --now ssh`.                                                                                                               |
| `timeout` / `unreachable`                                                         | Packets never got an answer.                                                       | A firewall drops port 22: Hostinger hPanel > VPS > Firewall must allow TCP on the SSH port, and on the host `ufw status` (then `ufw allow 22/tcp`, with an OK). Also check the VPS is running and the IP is right. A VPN on this computer can block it. |
| `host-name`                                                                       | The name does not resolve.                                                         | Typo, or DNS not set up yet. Use the IP address.                                                                                                                                                                                                        |
| `server:unavailable:artifacts_unavailable`, `server:unavailable:unsupported_host` | This Dolphin build does not carry the server for the host's system (OS or CPU).    | Not fixable on the host. Update Dolphin on this computer (`DOLPHIN --version` shows the current one) to a version that includes it, then connect again. Until then the host cannot run Dolphin's server.                                                |
| `server:unavailable:native_preflight`                                             | The host lacks system libraries the server needs.                                  | The server needs Linux with glibc 2.28 or newer (Ubuntu 20.04+, Debian 10+) or macOS. `ldd --version` on the host shows glibc. Older systems: upgrade the OS (ask first) or use a newer VPS image.                                                      |
| `server:unavailable:libc_unidentified`                                            | Dolphin could not tell glibc from musl.                                            | Make sure `ldd --version` runs on the host. Alpine (musl) needs `apk add gcompat libstdc++` (ask first).                                                                                                                                                |
| `server:unavailable:runtime_noexec`                                               | The home folder (or `/tmp`) is mounted `noexec`.                                   | `findmnt -T ~` shows the mount options. The host's admin has to remount without `noexec` or give the user a home that allows running programs.                                                                                                          |
| `server:unavailable:runtime_self_test`                                            | The Node.js runtime Dolphin uploaded failed its check.                             | Usually a full disk or a damaged upload: `df -h ~`, free space, `rm -rf ~/.dolphin-remote/node-runtime*` (ask first), connect again.                                                                                                                    |
| `server:unavailable:security_software`                                            | Antivirus or EDR changed the runtime's files.                                      | Allow `~/.dolphin-remote` in that software.                                                                                                                                                                                                             |
| `server:unavailable:ssh_tunnel_unavailable`                                       | sshd forbids port forwarding and the fallback failed too.                          | Set `AllowTcpForwarding yes` in `/etc/ssh/sshd_config`, `systemctl restart ssh` (ask first; keep the current session open while testing).                                                                                                               |
| `server:node-download-blocked`                                                    | Neither this computer nor the host could download Node.js.                         | Set a Node.js download mirror in Dolphin's Settings > Advanced > Network, or fix the proxy or network on both machines.                                                                                                                                 |
| `server:setup-free-host-space`                                                    | The host has no room for the server's backup while starting it.                    | `df -h ~` on the host; clear space (ask before deleting anything), connect again.                                                                                                                                                                       |
| `server:setup-stop-unmanaged-runtime`                                             | A Dolphin server this app did not start uses the host's data.                      | Stop that `dolphind` process on the host (ask first), connect again.                                                                                                                                                                                    |
| `server:setup-retry`, `server:contact-lost`                                       | Setup stopped or lost contact halfway.                                             | Connect again; nothing on the host was lost.                                                                                                                                                                                                            |
| `server:relay_terminals_live`, `server:source_changed`, `server:refused`          | The host has state from an older Dolphin or projects the server does not have yet. | Follow `nextStep`; these are resolved in Dolphin's Settings > SSH Hosts with the person.                                                                                                                                                                |
| `unknown`                                                                         | Dolphin did not recognise the failure.                                             | Run the `ssh -o BatchMode=yes … true` probe and `ssh -v` for SSH's own words, then fix what they name.                                                                                                                                                  |

## Llevar un bot al servidor

A Dolphin bot («delfín», `dolphin bots`) can run on the host 24/7 as a systemd user service, so it
keeps working with the person's computer off. The app does it from the Delfines page («Correr en tu
servidor»); when that stops at a step, this is what each step needs and how to finish it by hand.

What the app does, in order, over the saved SSH connection:

1. Checks the host: Linux, a Node.js 22.12+ (it prefers dolphind's own, under
   `~/.dolphin-remote/runtimes/node-*/bin/node`, then `node` on the PATH), the bot's engine signed in
   (`claude auth status` or `codex login status`), `systemctl --user` answering, and linger.
2. Uploads Dolphin's built core to `~/.dolphin-remote/nucleo-dolphin/` (`bin/`, `dist/`,
   `package.json`, `.huella`). It is not `dolphind`; it is the `dolphin` CLI, run as
   `<node> ~/.dolphin-remote/nucleo-dolphin/bin/dolphin.mjs bots …`.
3. Uploads the bot's folder and runs `bots importar <folder> --carpeta <work dir> --reemplazar`.
4. Runs `bots instalar --comando '"<node>" "<…>/bin/dolphin.mjs" bots correr'`, which writes
   `~/.config/systemd/user/dolphin-bots.service` with the session's PATH and enables it.
5. Waits for `systemctl --user is-active dolphin-bots.service` and for the bot in `bots --json`.
6. Only then runs `dolphin bots apartar <id>` on the person's computer, so the bot stops there and
   its folder is kept in `~/.dolphin/bots-en-servidor/`.

Below, `D` is `"<node>" ~/.dolphin-remote/nucleo-dolphin/bin/dolphin.mjs` on the host.

| What fails                                  | How to fix it                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Node.js 22.12+                           | Connect the host as a Dolphin server first (`DOLPHIN host connect <id>`): it brings its own Node. Or install Node 22 (ask first).                                            |
| Engine not installed                        | `curl -fsSL https://claude.ai/install.sh \| bash` for Claude Code, `npm install -g @openai/codex` for Codex (ask first).                                                     |
| Engine not signed in                        | Only the person: `ssh -t <host> "claude auth login"` (or `codex login`), then tell you when done.                                                                            |
| `systemctl --user` does not answer          | The SSH session has no user manager. `sudo loginctl enable-linger <user>` (ask first; the person may type the sudo password), reconnect, check again.                        |
| Linger off                                  | The bot runs, but stops when the last session closes. `sudo loginctl enable-linger <user>` (ask first). `loginctl show-user <user> -p Linger --value` must say `yes`.        |
| The service does not start                  | `journalctl --user -u dolphin-bots.service -n 30 --no-pager` names the cause. A wrong path in `ExecStart` or a PATH without the engine: run step 4 again from a login shell. |
| The bot is not in `D bots --json`           | `ls ~/.dolphin/bots/`; run step 3 again with the same folder and `--reemplazar`.                                                                                             |
| The bot still runs on the person's computer | `dolphin bots apartar <id>` there. Two copies of the same bot answer twice.                                                                                                  |

Done when, on the host, `systemctl --user is-active dolphin-bots.service` prints `active`,
`D bots --json` lists the bot, and linger is `yes`. Never copy the bot's `.env`-style secrets or its
Telegram token anywhere but the bot's own folder.

## What not to do

- Do not run `dolphin serve` on the host by hand, and do not copy Dolphin's files there yourself:
  connecting installs and updates the server, and a hand-started one blocks the managed one.
- Do not disable host-key checking (`StrictHostKeyChecking no`) to get past `host-key`.
- Do not open the SSH port to the world with a password login enabled just to make it work; use keys.
- Do not remove a saved host (`DOLPHIN host rm`) to "start over" unless the person asks: its projects
  are tied to it.
