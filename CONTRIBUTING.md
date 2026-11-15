# Contributing to Dolphin

Thanks for helping. This page covers how changes get in, how to build and test, and what kind of change is likely to be merged.

## How changes get in

Work in your fork and open a pull request against `main`. After the maintainer reviews it, the pull request is merged with squash, so its title becomes the commit message.

For anything bigger than a bug fix, open an issue first and describe the change. It saves you from writing code that goes in a different direction than the project.

## The two parts of the repository

| Part | Where | Stack | Package manager |
|---|---|---|---|
| Core: the `dolphin` CLI, the terminal app and the local web console | repository root (`src/`, `ui/`, `tests/`) | TypeScript on Node 22.12+, run with `tsx`, no runtime dependencies | npm |
| Desktop app | `escritorio/` | Electron, React, TypeScript on Node 24 | pnpm 12.14.0 |

## Build and run

Core:

```bash
npm install          # also builds the web console
npm link             # puts the dolphin command on your PATH
dolphin --demo       # the full flow with a fake agent, no tokens spent
```

Desktop app:

```bash
cd escritorio
pnpm install
pnpm dev
```

## Tests

Run the same checks CI runs for the part you touched.

Core:

```bash
npm run typecheck    # tsc --noEmit
npm test             # Vitest: no network, no tokens
npm run build
npm run smoke        # the whole cycle end to end with the fake agent
```

Desktop app:

```bash
cd escritorio
pnpm typecheck
pnpm lint
pnpm test
```

A bug fix comes with a test that fails without the fix. A new feature comes with tests for its behavior, not only for the happy path.

## Commits and pull request titles

Use [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`, for example `fix(gate): report the failing phase when the reviewer times out`.

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `chore`, `ci`. Most of the history is in Spanish; English or Spanish are both fine. Since pull requests are squashed, the title is what ends up in `main`, so write it the same way.

## What is likely to be accepted

- Bug fixes with a test.
- A new terminal agent. It is usually one row in [`src/agentes/motores.ts`](src/agentes/motores.ts); say in the pull request whether you ran it or followed its documentation, as [docs/motores.md](docs/motores.md) does.
- New gate phases or fixes to existing ones ([docs/fases.md](docs/fases.md)).
- Documentation fixes and translations of the desktop app.

## What is not

- Telemetry, accounts or calls to a Dolphin-run service. Dolphin works with what is on the user's machine.
- Anything that writes to the user's branch, pushes, deploys or runs migrations without the user deciding it.
- New runtime dependencies in the core. It imports only `node:*` on purpose.
- Large refactors or style-only changes without a previous issue.

## Reporting bugs and asking for features

Use the issue forms. For questions and ideas that are not yet a concrete request, use [Discussions](https://github.com/Nicoo01x/dolphin-app/discussions). Security problems go through [SECURITY.md](SECURITY.md), never through a public issue.

By contributing you agree that your work is released under the [MIT license](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
