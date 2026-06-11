# Contributing

Thanks for your interest in this project. It's a personal web app, but
contributions are welcome where they make sense.

## Branch strategy

- `main` is the deployed branch. Cloudflare Workers Builds deploys from it.
- Feature work lives on short-lived branches (`feat/...`, `fix/...`,
  `refactor/...`, `chore/...`).
- Open a PR against `main`. CI must be green before merge.

## Commit messages

Conventional commits:

- `feat: ...` — new feature
- `fix: ...` — bug fix
- `chore: ...` — tooling, deps, no behavior change
- `docs: ...` — documentation only
- `refactor: ...` — code change with no functional difference
- `test: ...` — adding or adjusting tests

Keep the subject line under 72 characters. Use the body for the *why*.

## PR checklist

- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes (if tests exist for the area you touched)
- [ ] User-facing strings are German; identifiers and comments are English
- [ ] No new dependencies added without a reason in the PR description

## Local development

```bash
bun install
bun run dev          # Vite dev server
bun run worker:dev   # Cloudflare Worker, if applicable
```

## Architecture

See `docs/specs/` for the app's architecture decisions. Living documents — if
your change shifts a design decision, update the matching spec in the same PR.
