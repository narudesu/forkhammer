# Project-wide session listing

## Context
- The existing `peer list-sessions <project> <worktree-path>` resolver delegates to `SessionManager.list` for one worktree and returns `{ project, worktreePath, sessions }`.
- Add a companion command/API that accepts a project and aggregates recent sessions from every worktree returned by the existing project worktree discovery.

## Approach
- Reuse the existing project validation, `git worktree list --porcelain` parsing, `resolvePiSessionDir`, and `SessionManager.list` mapping so each session has exactly the existing `SessionSummary` shape.
- Add a distinct `list-recent-project-sessions` resolver method and shared protocol schema returning `{ project, sessions }`, then expose it through the PeerJS RPC registration and direct CLI.
- Discover worktrees via the existing `listWorktrees` behavior, list sessions for each worktree, flatten the results, and sort by recency (`modifiedAt`) before returning/printing. Each summary's existing `cwd` remains the worktree identifier.

## Files to modify
- `src/peer-protocol/peer-protocol.ts` — add the `list-recent-project-sessions` method name, project params/result contract (`{ project, sessions }`), and target method.
- `src/peer-protocol/peer-resolver.ts` — aggregate session summaries across project worktrees.
- `src/peer-protocol/peer-client.ts` — register/dispatch the new RPC method.
- `src/cli-commands/run-peer-commands.ts` — add direct CLI invocation/output.
- `src/run-cli.ts` — register the new peer subcommand.
- `website/docs/browser-peer-connection.mdx` — document the new method if the shared API list/examples are intended to stay complete.

## Reuse
- `createPeerResolverTarget` and its current `listSessions` mapping in `src/peer-protocol/peer-resolver.ts`.
- Existing `listWorktrees` implementation and `parseWorktrees` helper in `src/peer-protocol/peer-resolver.ts`.
- `SessionManager.list` and `resolvePiSessionDir` for session discovery.
- `runPeerListSessions` formatting in `src/cli-commands/run-peer-commands.ts`.
- Existing method registration pattern in `src/peer-protocol/peer-client.ts`.

## Steps
- [x] Confirm the public command name: `list-recent-project-sessions <project>` (and matching RPC method `list-recent-project-sessions`).
- [x] Confirm the aggregate response shape: `{ project, sessions }`; each existing `SessionSummary` retains its `cwd`, which identifies the worktree.
- [x] Add protocol types/schema and target method.
- [x] Implement all-worktree discovery, session aggregation, and recent-first ordering.
- [x] Wire RPC and CLI surfaces, preserving existing list-sessions behavior.
- [x] Update browser-peer documentation and verify CLI/typecheck/build (CLI help and Biome pass; repository typecheck/docs build remain blocked by pre-existing environment errors).

## Verification
- Run the new project-wide command for a project with multiple worktrees and confirm sessions from all worktrees are present, with their original `cwd`/paths and recent-first ordering.
- Check projects with no worktrees/sessions and invalid project names; treat “recent” as all matching sessions sorted newest-first by `modifiedAt` unless a product limit is later requested.
- Run `bun run build:cli` (and docs build if documentation changes).
