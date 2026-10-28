// Diff RPC schemas mirrored from grsq-v2/src/modules/diff-review/domain/contract.ts.
import { type Static, Type } from "@sinclair/typebox";

const Name = Type.String({ minLength: 1, maxLength: 4096 });
export const DiffRequestSchema = Type.Object(
  {
    project: Name,
    worktreePath: Name,
    mode: Type.Union([Type.Literal("worktree"), Type.Literal("branches")]),
    base: Type.Optional(Name),
    review: Type.Optional(Name),
  },
  { additionalProperties: false },
);
export const DiffResultSchema = Type.Object({
  workerId: Name,
  repositoryId: Name,
  fingerprint: Name,
  baseSha: Name,
  headSha: Name,
  files: Type.Array(
    Type.Object({
      oldPath: Type.String(),
      newPath: Type.String(),
      binary: Type.Boolean(),
      patch: Type.String({ maxLength: 2000000 }),
      notice: Type.Optional(Type.String()),
    }),
    { maxItems: 2000 },
  ),
});
export const BranchListSchema = Type.Object({
  branches: Type.Array(Name, { maxItems: 10000 }),
});
export const BranchListParamsSchema = Type.Object(
  { project: Name, worktreePath: Name },
  { additionalProperties: false },
);
export type DiffRequest = Static<typeof DiffRequestSchema>;
export type DiffResult = Static<typeof DiffResultSchema>;
export type BranchListParams = Static<typeof BranchListParamsSchema>;
export type BranchList = Static<typeof BranchListSchema>;
