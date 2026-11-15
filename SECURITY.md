# Security policy

## Supported versions

Only the latest release gets security fixes. The desktop app updates itself, so a fix reaches users in the next version.

| Version | Supported |
|---|---|
| Latest release | Yes |
| Older releases | No |

## Reporting a vulnerability

Do not open a public issue, discussion or pull request for a security problem.

Report it privately through GitHub: go to the [Security tab](https://github.com/Nicoo01x/dolphin-app/security) and click **Report a vulnerability**, or open the form directly at [github.com/Nicoo01x/dolphin-app/security/advisories/new](https://github.com/Nicoo01x/dolphin-app/security/advisories/new). Only you and the maintainer can see the report.

Include what you can of:

- the affected part (core CLI, local web console, desktop app) and version;
- the steps to reproduce, or a proof of concept;
- what an attacker can do with it;
- a suggested fix, if you have one.

## What to expect

- An acknowledgment within 7 days.
- A first assessment, and a plan or a reason if it is not considered a vulnerability, within 14 days.
- A fix in a new release, coordinated with you before anything is made public. You are credited in the advisory unless you prefer not to be.

## Scope

In scope: the code in this repository and the installers published in its releases. Things that matter most here:

- the local web console, which listens only on `127.0.0.1` and should never accept a request from another origin or host;
- the gate's protections, such as a branch that changes what the repository runs on its own (`.claude/`, `.mcp.json`, hooks);
- the isolated mode and what an agent inside it can reach ([docs/aislamiento.md](docs/aislamiento.md));
- the update chain of the desktop app.

Out of scope: vulnerabilities in the agent CLIs Dolphin runs (Claude Code, Codex and others) or in their providers. Report those to their owners.
