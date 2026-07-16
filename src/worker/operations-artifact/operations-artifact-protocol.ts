import { type Static, Type } from "@sinclair/typebox";

/**
 * Shareable worker/app contract for operations artifacts.
 * Keep this file independent from Supabase, React, and app runtime code.
 */

export const ArtifactTypeSchema = Type.Union([
  Type.Literal("jira_inbox"),
  Type.Literal("gitlab"),
  Type.Literal("healthcheck"),
  Type.Literal("blocker"),
]);

export const MergeRequestStateSchema = Type.Union([
  Type.Literal("opened"),
  Type.Literal("merged"),
]);
export const PipelineStatusSchema = Type.Union([
  Type.Literal("success"),
  Type.Literal("failed"),
  Type.Literal("running"),
]);

export const PipelineJobSchema = Type.Object({
  name: Type.String(),
  status: Type.String(),
});

export const PipelineSnapshotSchema = Type.Object({
  status: PipelineStatusSchema,
  branch: Type.String(),
  url: Type.String({ pattern: "^https?://" }),
  updatedAt: Type.String(),
});

export const PipelineSummarySchema = Type.Intersect([
  PipelineSnapshotSchema,
  Type.Object({
    baseline: Type.Optional(PipelineSnapshotSchema),
    firstFailure: Type.Optional(PipelineSnapshotSchema),
    nonSuccessfulJobs: Type.Optional(Type.Array(PipelineJobSchema)),
  }),
]);

export const MergeRequestSchema = Type.Object({
  iid: Type.Number(),
  title: Type.String(),
  project: Type.Union([Type.Literal("Frontend"), Type.Literal("Backend")]),
  author: Type.String(),
  assignee: Type.String(),
  sourceBranch: Type.String(),
  targetBranch: Type.String(),
  state: MergeRequestStateSchema,
  updatedAt: Type.String(),
  url: Type.String({ pattern: "^https?://" }),
  pipeline: PipelineSummarySchema,
});

export const ProjectActivitySchema = Type.Object({
  name: Type.Union([Type.Literal("Frontend"), Type.Literal("Backend")]),
  openMergeRequests: Type.Array(MergeRequestSchema),
  recentlyMerged: Type.Array(MergeRequestSchema),
  pipelines: Type.Array(PipelineSummarySchema),
});

export const GitlabArtifactSchema = Type.Object({
  createdAt: Type.String(),
  frontend: ProjectActivitySchema,
  backend: ProjectActivitySchema,
});

export const JiraArtifactSchema = Type.Array(
  Type.Object({
    key: Type.String(),
    summary: Type.String(),
    status: Type.String(),
    priority: Type.Optional(Type.String()),
    labels: Type.Optional(Type.Array(Type.String())),
    description: Type.Optional(Type.String()),
    assignee: Type.Optional(Type.String()),
    reporter: Type.Optional(Type.String()),
  }),
);

export const TicketReferenceSchema = Type.Object({
  team: Type.Union([Type.Literal("fe"), Type.Literal("be")]),
  key: Type.String(),
  title: Type.Union([Type.String(), Type.Null()]),
  status: Type.Union([
    Type.Literal("In progress"),
    Type.Literal("Done"),
    Type.Literal("Blocked"),
    Type.Null(),
  ]),
  url: Type.String({ pattern: "^https?://" }),
});

export const RelatedMergeRequestSchema = Type.Object({
  project: Type.Union([Type.Literal("Frontend"), Type.Literal("Backend")]),
  iid: Type.Number(),
  title: Type.String(),
  state: MergeRequestStateSchema,
  url: Type.String({ pattern: "^https?://" }),
});

export const BlockerSchema = Type.Object({
  id: Type.String({ pattern: "^[a-z0-9]+(?:_[a-z0-9]+)*$" }),
  title: Type.String(),
  comments: Type.Array(Type.String()),
  blockedTickets: Type.Array(TicketReferenceSchema),
  blockingTickets: Type.Array(TicketReferenceSchema),
  relatedMergeRequests: Type.Array(RelatedMergeRequestSchema),
  suggestedResolved: Type.Boolean(),
  suggestionSources: Type.Array(
    Type.Union([Type.Literal("jira"), Type.Literal("gitlab")]),
  ),
  suggestionReason: Type.String(),
});

export const BlockersArtifactSchema = Type.Array(BlockerSchema);

export const HealthcheckSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  url: Type.String({ pattern: "^https?://" }),
  statusCode: Type.Number(),
  healthy: Type.Boolean(),
  responseTimeMs: Type.Number(),
  checkedAt: Type.String(),
  responseBody: Type.String(),
});

export const HealthchecksArtifactSchema = Type.Array(HealthcheckSchema);

export type ArtifactType = Static<typeof ArtifactTypeSchema>;
export type MergeRequestState = Static<typeof MergeRequestStateSchema>;
export type PipelineStatus = Static<typeof PipelineStatusSchema>;
export type PipelineJob = Static<typeof PipelineJobSchema>;
export type PipelineSnapshot = Static<typeof PipelineSnapshotSchema>;
export type PipelineSummary = Static<typeof PipelineSummarySchema>;
export type MergeRequest = Static<typeof MergeRequestSchema>;
export type ProjectActivity = Static<typeof ProjectActivitySchema>;
export type GitlabArtifact = Static<typeof GitlabArtifactSchema>;
export type JiraArtifact = Static<typeof JiraArtifactSchema>;
export type TicketReference = Static<typeof TicketReferenceSchema>;
export type RelatedMergeRequest = Static<typeof RelatedMergeRequestSchema>;
export type Blocker = Static<typeof BlockerSchema>;
export type Healthcheck = Static<typeof HealthcheckSchema>;
export type BlockersArtifact = Static<typeof BlockersArtifactSchema>;
export type HealthchecksArtifact = Static<typeof HealthchecksArtifactSchema>;
