# AGENTS.md

## Repo Shape
- `src/` is the CLI; `src/cli.ts` is the entrypoint and currently registers only `forkhammer new`.
- `website/` is the Docusaurus docs site and `tools/oc-docker/` is the fixed-path OpenCode container stack.

## Commands
- Use `bun run build` for the full verification path. It must pass `build:cli` before `build:docs`.
- Use `bun run build:cli` for CLI changes and `bun run build:docs` for docs changes.
- Use `bun run postinstall` after changing docs-related setup if generated Docusaurus shims need to be refreshed.
- Use the package scripts, not raw `docusaurus` commands; the scripts add the loader shim required by this repo.

## Docs Build Quirks
- `bun install` runs `postinstall`, which writes Docusaurus compatibility shims into `node_modules/@theme` and `node_modules/@generated`.
- `website/build/` and `website/.docusaurus/` are generated; do not edit them.
- The docs build uses `NODE_OPTIONS=--experimental-loader=./scripts/css-loader.mjs` from `package.json`.

## Forkhammer New
- `forkhammer new -k AT-123` is the user-facing command.
- It expects Jira config in `~/.config/forkhammer/config.toml` and a local OpenCode server on `http://localhost:8000`.
- Project roots in config are path-sensitive; keep the configured paths and the `tools/oc-docker/` paths exactly as written.

## Workflow Notes
- `tools/oc-docker/` is intentionally path-specific to `/home/naru/code/opencode`; do not normalize those paths.
- GitHub Pages deployment is defined in `.github/workflows/deploy-docs.yml` and publishes `website/build/`.
