import z from "zod";

const zIssueKey = z.string().min(1);
const zValidationError = z.string().min(1);
const zEventSource = z.string().min(1);

const zIssueComment = z.object({
  author: z.string().min(1),
  body: z.string(),
  createdAt: z.string().min(1),
});

const zValidationSessionContext = z.object({
  issue_key: zIssueKey,
  project_key: z.string().min(1),
  project_name: z.string().min(1),
  session_id: z.string().min(1),
  worktree_name: z.string().min(1),
  worktree_branch: z.string().min(1),
  worktree_directory: z.string().min(1),
  pi_session_file: z.string().min(1).optional(),
});

const zValidationQuestion = z.object({
  text: z.string(),
  relatedFilePath: z.string(),
});

const zValidationRelatedFile = z.object({
  path: z.string(),
  note: z.string(),
});

export const validationStructuredResultSchema = z.object({
  questions: z.array(zValidationQuestion),
  summary: z.string(),
  todos: z.array(z.string()),
  relatedFiles: z.array(zValidationRelatedFile),
  clarity: z.number().min(0).max(10),
});

const zValidateIssueRequestedData = z.object({
  issue_key: zIssueKey,
});

const zArtifactRefreshRequestedData = z.object({
  type: z.literal("jira_inbox"),
});

const zValidateIssueStartedData = z.object({
  ...zValidationSessionContext.shape,
  issue_summary: z.string(),
  jira_description: z.string(),
  issue_comments: z.array(zIssueComment),
});

const zValidateIssuePromptRequestedData = zValidationSessionContext.extend({
  prompt: z.string().min(1),
});

const zValidateIssuePromptCompletedData = zValidationSessionContext.extend({
  request_event_id: z.string().min(1),
  prompt: z.string().min(1),
  response: z.unknown(),
});

const zValidateIssuePromptFailedData = zValidationSessionContext.extend({
  request_event_id: z.string().min(1),
  prompt: z.string().min(1),
  error: zValidationError,
});

const zIssueValidatedData = validationStructuredResultSchema.extend({
  ...zValidationSessionContext.shape,
  source: zEventSource,
  jira_summary: z.string(),
});

const zIssueValidationFailedData = z.object({
  issue_key: zIssueKey,
  error: zValidationError,
});

const zBrowserPeerReadyData = z.object({
  peerId: z.string().min(1),
});

export const browserPeerReadyEventSchema = z.object({
  peerId: z.string().min(1),
});

const zInsertedArtifactData = z.object({
  artifactType: z.string().nullish(),
  artifactId: z.string(),
});

export type BrowserPeerReadyEvent = z.infer<typeof browserPeerReadyEventSchema>;

export const ultrafeedEventDefinitions = [
  {
    eventType: "validate_issue_requested",
    description: "A request to validate a Jira issue.",
    dataSchema: zValidateIssueRequestedData,
  },
  {
    eventType: "validate_issue_started",
    description:
      "A worker acknowledgement that validation has started, including Jira context.",
    dataSchema: zValidateIssueStartedData,
  },
  {
    eventType: "validate_issue_prompt_requested",
    description:
      "A request to add a new prompt to an existing validation session.",
    dataSchema: zValidateIssuePromptRequestedData,
  },
  {
    eventType: "validate_issue_prompt_completed",
    description:
      "A worker success event containing the prompt response from a validation session.",
    dataSchema: zValidateIssuePromptCompletedData,
  },
  {
    eventType: "validate_issue_prompt_failed",
    description:
      "A worker failure event emitted when a session prompt cannot be sent.",
    dataSchema: zValidateIssuePromptFailedData,
  },
  {
    eventType: "issue_validated",
    description:
      "A worker success event containing the structured model output and issue metadata.",
    dataSchema: zIssueValidatedData,
  },
  {
    eventType: "issue_validation_failed",
    description: "A worker failure event with the validation error.",
    dataSchema: zIssueValidationFailedData,
  },
  {
    eventType: "browser_peer_ready",
    description:
      "A browser peer is connected via PeerJS and ready to receive responses.",
    dataSchema: zBrowserPeerReadyData,
  },
  {
    eventType: "artifact_refresh_requested",
    description: "A request to refresh a Jira inbox artifact snapshot.",
    dataSchema: zArtifactRefreshRequestedData,
  },
] as const;

export const ultrafeedEventSchemas = {
  validate_issue_requested: zValidateIssueRequestedData,
  validate_issue_started: zValidateIssueStartedData,
  validate_issue_prompt_requested: zValidateIssuePromptRequestedData,
  validate_issue_prompt_completed: zValidateIssuePromptCompletedData,
  validate_issue_prompt_failed: zValidateIssuePromptFailedData,
  issue_validated: zIssueValidatedData,
  issue_validation_failed: zIssueValidationFailedData,
  browser_peer_ready: zBrowserPeerReadyData,
  artifact_refresh_requested: zArtifactRefreshRequestedData,
  inserted_artifact: zInsertedArtifactData,
} as const;

export const ultrafeedRequestEventTypes = [
  "validate_issue_requested",
  "artifact_refresh_requested",
] as const;

export const ultrafeedRequestEventType = ultrafeedRequestEventTypes[0];

export const ultrafeedWorkerEmittedEventTypes = [
  "validate_issue_started",
  "validate_issue_prompt_completed",
  "validate_issue_prompt_failed",
  "issue_validated",
  "issue_validation_failed",
] as const;

export type UltrafeedEventType = keyof typeof ultrafeedEventSchemas;

export type UltrafeedEventData<
  TEventType extends UltrafeedEventType = UltrafeedEventType,
> = z.infer<(typeof ultrafeedEventSchemas)[TEventType]>;

export type ValidationStructuredResult = z.infer<
  typeof validationStructuredResultSchema
>;

export function parseUltrafeedEventData(
  eventType: string,
  data: unknown,
): UltrafeedEventData | null {
  const schema = ultrafeedEventSchemas[eventType as UltrafeedEventType];
  if (!schema) {
    return null;
  }

  const candidate = typeof data === "string" ? parseJson(data) : data;
  const result = schema.safeParse(candidate);

  return result.success ? (result.data as UltrafeedEventData) : null;
}

function parseJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
