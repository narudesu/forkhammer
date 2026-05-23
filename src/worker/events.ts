import z from "zod";

const zIssueKey = z.string().min(1);
const zValidationError = z.string().min(1);
const zEventSource = z.literal("naru-cli");
const zEventCommand = z.literal("validate-issue");

const zIssueComment = z.object({
  author: z.string().min(1),
  body: z.string(),
  createdAt: z.string().min(1),
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

const zValidateIssueStartedData = z.object({
  issue_key: zIssueKey,
  issue_summary: z.string(),
  jira_description: z.string(),
  issue_comments: z.array(zIssueComment),
});

const zIssueValidatedData = validationStructuredResultSchema.extend({
  issue_key: zIssueKey,
  source: zEventSource,
  command: zEventCommand,
  project_key: z.string().min(1),
  project_name: z.string().min(1),
  jira_summary: z.string(),
});

const zIssueValidationFailedData = z.object({
  issue_key: zIssueKey,
  error: zValidationError,
});

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
] as const;

export const ultrafeedEventSchemas = {
  validate_issue_requested: zValidateIssueRequestedData,
  validate_issue_started: zValidateIssueStartedData,
  issue_validated: zIssueValidatedData,
  issue_validation_failed: zIssueValidationFailedData,
} as const;

export const ultrafeedRequestEventType = "validate_issue_requested" as const;

export const ultrafeedWorkerEmittedEventTypes = [
  "validate_issue_started",
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
