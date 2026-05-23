# AGENTS.md

## Repo Shape
- `src/` is the CLI; `src/cli.ts` is the entrypoint and currently registers only `forkhammer new`.
- `website/` is the Docusaurus docs site and the OpenCode container stack lives in top-level `Dockerfile`, `docker-compose.yml`, and `docker-tools/`.

## Architecture
- Forkhammer is event-sourced: the event log is the source of truth, and state is rebuilt from stored snapshots plus replayed backfill events.
- The worker reacts to new events, loads Jira context, opens OpenCode sessions in isolated worktrees, and emits result events.
- Projections are read models built from events; side effects happen after projections are up to date.
- Prefer changes that preserve this flow instead of introducing a single mutable global state object.

## Commands
- Use `bun run build` for the full verification path. It must pass `build:cli` before `build:docs`.
- Use `bun run build:cli` for CLI changes and `bun run build:docs` for docs changes.
- Use `bun run docs:start` and `bun run docs:build` for local docs work.
- Use `bun run postinstall` after changing docs-related setup if generated Docusaurus shims need to be refreshed.
- Use the package scripts, not raw `docusaurus` commands; the scripts add the loader shim required by this repo.

## Docs Build Quirks
- `bun install` runs `postinstall`, which writes Docusaurus compatibility shims into `node_modules/@theme` and `node_modules/@generated`.
- `website/build/` and `website/.docusaurus/` are generated; do not edit them.
- The docs build uses `NODE_OPTIONS=--experimental-loader=./scripts/css-loader.mjs` from `package.json`.

## Workflow Notes
- Forkhammer runs inside of a docker-compose image
- GitHub Pages deployment is defined in `.github/workflows/deploy-docs.yml` and publishes `website/build/`.
