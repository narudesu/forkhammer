import { type Static, Type } from "@sinclair/typebox";

/** Shared API contract. Keep this module independent of worker/server code. */
export const ProjectSchema = Type.Object({
  name: Type.String(),
  key: Type.Optional(Type.String()),
  root: Type.String(),
});

export const WorktreeSchema = Type.Object({
  path: Type.String(),
  branch: Type.String(),
  name: Type.Optional(Type.String()),
});

export const SessionSummarySchema = Type.Object({
  path: Type.String(),
  id: Type.String(),
  cwd: Type.String(),
  createdAt: Type.String(),
  modifiedAt: Type.String(),
  name: Type.Optional(Type.String()),
  messageCount: Type.Number(),
  firstMessage: Type.Optional(Type.String()),
});

export const SessionEntrySchema = Type.Intersect([
  Type.Object({
    id: Type.String(),
    parentId: Type.Union([Type.String(), Type.Null()]),
    timestamp: Type.String(),
    type: Type.String(),
  }),
  Type.Record(Type.String(), Type.Unknown()),
]);

export const GetConfigResultSchema = Type.Object({
  projects: Type.Array(ProjectSchema),
});

export const ListWorktreesParamsSchema = Type.Object({
  project: Type.String({ minLength: 1 }),
});
export const ListWorktreesResultSchema = Type.Object({
  project: Type.String(),
  worktrees: Type.Array(WorktreeSchema),
});

export const ListSessionsParamsSchema = Type.Object({
  project: Type.String({ minLength: 1 }),
  worktreePath: Type.String({ minLength: 1 }),
});
export const ListSessionsResultSchema = Type.Object({
  project: Type.String(),
  worktreePath: Type.String(),
  sessions: Type.Array(SessionSummarySchema),
});

export const GetSessionParamsSchema = Type.Object({
  sessionPath: Type.String({ minLength: 1 }),
});
export const GetSessionResultSchema = Type.Object({
  path: Type.String(),
  id: Type.Optional(Type.String()),
  messages: Type.Array(SessionEntrySchema),
});

export type Project = Static<typeof ProjectSchema>;
export type Worktree = Static<typeof WorktreeSchema>;
export type SessionSummary = Static<typeof SessionSummarySchema>;
export type SessionEntry = Static<typeof SessionEntrySchema>;
export type GetConfigResult = Static<typeof GetConfigResultSchema>;
export type ListWorktreesParams = Static<typeof ListWorktreesParamsSchema>;
export type ListWorktreesResult = Static<typeof ListWorktreesResultSchema>;
export type ListSessionsParams = Static<typeof ListSessionsParamsSchema>;
export type ListSessionsResult = Static<typeof ListSessionsResultSchema>;
export type GetSessionParams = Static<typeof GetSessionParamsSchema>;
export type GetSessionResult = Static<typeof GetSessionResultSchema>;

export const PeerResolverMethod = {
  getConfig: "get-config",
  listWorktrees: "list-worktrees",
  listSessions: "list-sessions",
  getSession: "get-session",
} as const;

export type PeerResolverMethodName =
  (typeof PeerResolverMethod)[keyof typeof PeerResolverMethod];

export interface PeerResolverTarget {
  getConfig(): Promise<GetConfigResult>;
  listWorktrees(params: ListWorktreesParams): Promise<ListWorktreesResult>;
  listSessions(params: ListSessionsParams): Promise<ListSessionsResult>;
  getSession(params: GetSessionParams): Promise<GetSessionResult>;
}

export type PeerResolverParams =
  | ListWorktreesParams
  | ListSessionsParams
  | GetSessionParams;
