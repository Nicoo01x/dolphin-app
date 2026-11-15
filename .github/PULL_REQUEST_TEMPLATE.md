## What this changes

<!-- One or two sentences. Link the issue it closes, if any: "Closes #123". -->

## Why

<!-- The problem it solves, or the behavior it fixes. -->

## How it was tested

<!-- Commands you ran and what you checked by hand. For UI changes, add a screenshot or a short clip. -->

## Checklist

- [ ] The title follows `type(scope): summary` (it becomes the squashed commit message).
- [ ] Core: `npm run typecheck`, `npm test` and `npm run smoke` pass, if the core changed.
- [ ] Desktop app: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `escritorio/`, if the app changed.
- [ ] A bug fix includes a test that fails without it.
- [ ] Docs are updated if behavior or commands changed.
- [ ] No paths, user names, tokens or other personal data in code, screenshots or logs.
