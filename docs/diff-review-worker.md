# Diff review RPC

The worker exposes `list-diff-branches` and `get-diff`. Schemas in
`src/peer-protocol/diff-contract.ts` mirror the app's
`src/modules/diff-review/domain/contract.ts`; update them together.

Only configured projects and their registered Git worktrees are accepted.
Branches are local names or full `refs/remotes/...` references returned by
`list-diff-branches`. Arbitrary revision expressions are intentionally rejected.
Branch comparisons use the merge base and exclude working tree changes.
Worktree comparisons use a temporary index to compare the final tree to one
resolved HEAD, without modifying the user's index. Git object storage is updated.

Worker identity comes from configured `worker.id`. Repository identity is persisted
in `forkhammer-repository-id` inside the shared Git directory; linked worktrees
share it. Preserve this file when relocating a repository.

Responses use a conservative 48,000-byte JSON budget for both peer transports,
leaving room for the RPC envelope. Oversized patches are replaced with notices;
metadata or branch lists that cannot fit are rejected explicitly. Results are
limited to 2,000 files and patches to 2,000,000 characters. Binary contents are
never returned. Submodules receive an unsupported notice. Git errors are sanitized
to avoid logging patch output. Comparisons are snapshots, not transactional with
concurrent external edits to working files.

Run `bun test src/peer-protocol` for worker contract tests.

Before deploying the app, apply its
`supabase/migrations/014_diff_review_comments.sql` from the app repository. This
worker change does not apply that migration.
