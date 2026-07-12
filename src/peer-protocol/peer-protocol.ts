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

export const CreateWorktreeParamsSchema = Type.Object({
  project: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
});
export const CreateWorktreeResultSchema = Type.Object({
  project: Type.String(),
  name: Type.String(),
  path: Type.String(),
  branch: Type.String(),
});

export const CreateSessionParamsSchema = Type.Object({
  worktreePath: Type.String({ minLength: 1 }),
});
export const CreateSessionResultSchema = Type.Object({
  path: Type.String(),
  id: Type.String(),
  cwd: Type.String(),
});

export const SessionPathParamsSchema = Type.Object({
  sessionPath: Type.String({ minLength: 1 }),
});
export const PromptSessionParamsSchema = Type.Intersect([
  SessionPathParamsSchema,
  Type.Object({ prompt: Type.String({ minLength: 1 }) }),
]);
export const PromptSessionResultSchema = Type.Object({
  sessionPath: Type.String(),
});

export const SessionEventSchema = Type.Object({
  sessionPath: Type.String(),
  event: Type.Record(Type.String(), Type.Unknown()),
});
export const SubscribeSessionResultSchema = Type.Object({
  sessionPath: Type.String(),
  subscribed: Type.Boolean(),
});
export const UnsubscribeSessionResultSchema = Type.Object({
  sessionPath: Type.String(),
  unsubscribed: Type.Boolean(),
});
export const ArchiveSessionResultSchema = Type.Object({
  sessionPath: Type.String(),
  archived: Type.Boolean(),
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
export type CreateWorktreeParams = Static<typeof CreateWorktreeParamsSchema>;
export type CreateWorktreeResult = Static<typeof CreateWorktreeResultSchema>;
export type CreateSessionParams = Static<typeof CreateSessionParamsSchema>;
export type CreateSessionResult = Static<typeof CreateSessionResultSchema>;
export type SessionPathParams = Static<typeof SessionPathParamsSchema>;
export type PromptSessionParams = Static<typeof PromptSessionParamsSchema>;
export type PromptSessionResult = Static<typeof PromptSessionResultSchema>;
export type SessionEvent = Static<typeof SessionEventSchema>;
export type SubscribeSessionResult = Static<
  typeof SubscribeSessionResultSchema
>;
export type UnsubscribeSessionResult = Static<
  typeof UnsubscribeSessionResultSchema
>;
export type ArchiveSessionResult = Static<typeof ArchiveSessionResultSchema>;

export const PeerResolverMethod = {
  getConfig: "get-config",
  listWorktrees: "list-worktrees",
  listSessions: "list-sessions",
  getSession: "get-session",
  createWorktree: "create-worktree",
  createSession: "create-session",
  subscribeSession: "subscribe-session",
  unsubscribeSession: "unsubscribe-session",
  archiveSession: "archive-session",
  promptSession: "prompt-session",
  sessionEvent: "session-event",
} as const;

export type PeerResolverMethodName =
  (typeof PeerResolverMethod)[keyof typeof PeerResolverMethod];

export interface PeerResolverTarget {
  dispose(): void;
  getConfig(): Promise<GetConfigResult>;
  listWorktrees(params: ListWorktreesParams): Promise<ListWorktreesResult>;
  listSessions(params: ListSessionsParams): Promise<ListSessionsResult>;
  getSession(params: GetSessionParams): Promise<GetSessionResult>;
  createWorktree(params: CreateWorktreeParams): Promise<CreateWorktreeResult>;
  createSession(params: CreateSessionParams): Promise<CreateSessionResult>;
  subscribeSession(
    params: SessionPathParams,
    onEvent?: (event: SessionEvent) => void,
  ): Promise<SubscribeSessionResult>;
  unsubscribeSession(
    params: SessionPathParams,
  ): Promise<UnsubscribeSessionResult>;
  archiveSession(params: SessionPathParams): Promise<ArchiveSessionResult>;
  promptSession(params: PromptSessionParams): Promise<PromptSessionResult>;
}

export type PeerResolverParams =
  | ListWorktreesParams
  | ListSessionsParams
  | GetSessionParams
  | CreateWorktreeParams
  | CreateSessionParams
  | SessionPathParams
  | PromptSessionParams;
