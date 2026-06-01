import toml from "smol-toml";
import z from "zod";
import type { Config } from "./config";

const zJiraComment = z.object({
  author: z.object({ displayName: z.string() }),
  body: z.unknown(),
  created: z.string(),
});

const zJiraIssue = z.object({
  fields: z.object({
    status: z.object({ name: z.string() }),
    summary: z.string(),
    description: z.unknown().optional(),
    creator: z.object({ displayName: z.string() }),
    comment: z
      .object({
        comments: z.array(zJiraComment),
      })
      .optional()
      .default({ comments: [] }),
  }),
});

const zJiraInboxIssue = z.object({
  key: z.string(),
  fields: z.object({
    status: z.object({ name: z.string() }),
    summary: z.string(),
    priority: z.object({ name: z.string() }).nullable().optional(),
    labels: z.array(z.string()).optional().default([]),
    description: z.unknown().optional(),
    assignee: z.object({ displayName: z.string() }).nullable().optional(),
    reporter: z.object({ displayName: z.string() }).nullable().optional(),
  }),
});

const zJiraInboxSearchResponse = z.object({
  isLast: z.boolean().optional(),
  nextPageToken: z.string().optional(),
  issues: z.array(zJiraInboxIssue),
});

export type JiraInboxIssue = {
  key: string;
  summary: string;
  status: string;
  priority: string;
  labels?: Array<string>;
  description?: string;
  assignee?: string;
  reporter?: string;
};

export type IssueContext = {
  key: string;
  summary: string;
  creator: string;
  status: string;
  description: string;
  comments: Array<IssueComment>;
};

export type IssueComment = {
  author: string;
  body: string;
  createdAt: string;
};

export async function getJiraInboxIssues(
  config: NonNullable<Config["jira"]>,
  runtimeFetch: typeof fetch,
): Promise<Array<JiraInboxIssue>> {
  const filterId = config.filters?.inbox?.filter_id;
  if (!filterId) {
    return [];
  }

  const issues: Array<JiraInboxIssue> = [];
  let nextPageToken: string | null = null;
  const maxResults = 100;

  while (true) {
    const url = new URL(config.url);
    url.pathname = "/rest/api/3/search/jql";
    url.searchParams.set("jql", `filter=${filterId}`);
    url.searchParams.set("maxResults", String(maxResults));
    if (nextPageToken) {
      url.searchParams.set("nextPageToken", nextPageToken);
    }
    url.searchParams.set(
      "fields",
      "summary,status,priority,labels,description,assignee,reporter",
    );

    const response = await runtimeFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(config.auth).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`jira-request-failed:${response.status}:${text}`);
    }

    const parsed = zJiraInboxSearchResponse.parse(JSON.parse(text));
    issues.push(...parsed.issues.map(normalizeJiraInboxIssue));

    nextPageToken = parsed.nextPageToken ?? null;
    if (
      parsed.isLast === true ||
      !nextPageToken ||
      parsed.issues.length === 0
    ) {
      break;
    }
  }

  return issues;
}

export async function getIssueContext(
  config: Config,
  key: string,
): Promise<IssueContext> {
  if (!config.jira) {
    throw new Error("jira-config-not-found");
  }

  const url = new URL(config.jira.url);
  url.pathname = `/rest/api/latest/issue/${key}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(config.jira.auth).toString("base64")}`,
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`jira-request-failed:${response.status}:${text}`);
  }

  const parsed = zJiraIssue.parse(JSON.parse(text)).fields;

  return {
    key,
    summary: parsed.summary,
    creator: parsed.creator.displayName,
    status: parsed.status.name,
    description: normalizeJiraDescription(parsed.description),
    comments: parsed.comment.comments.map((comment) => ({
      author: comment.author.displayName,
      body: normalizeCommentBody(comment.body),
      createdAt: comment.created,
    })),
  };
}

export async function assertJiraConfigured(config: Config) {
  if (!config.jira) {
    throw new Error("jira-config-not-found");
  }

  const authParts = config.jira.auth.split(":");
  if (authParts.length !== 2 || !authParts[0] || !authParts[1]) {
    throw new Error("jira-auth-invalid-format");
  }

  const url = new URL(config.jira.url);
  url.pathname = "/rest/api/latest/myself";

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(config.jira.auth).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`jira-connect-failed:${url.origin}:${message}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`jira-auth-failed:${response.status}:${text}`);
  }
}

export function formatIssueContext(issue: IssueContext) {
  const metadata = {
    key: issue.key,
    summary: issue.summary,
    creator: issue.creator,
    status: issue.status,
  };

  const comments = issue.comments
    .map(
      (comment) => `- ${comment.createdAt} ${comment.author}: ${comment.body}`,
    )
    .join("\n");

  return `${toml.stringify(metadata)}\ndescription:\n\n${issue.description}\n\ncomments:\n\n${comments || "none"}`;
}

function normalizeCommentBody(body: unknown) {
  if (typeof body === "string") {
    return body;
  }

  return normalizeJiraDescription(body);
}

function normalizeJiraDescription(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeJiraDescription(item))
      .filter((line) => line.length > 0)
      .join("\n");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.text === "string") {
      return record.text;
    }

    if (Array.isArray(record.content)) {
      return record.content
        .map((item) => normalizeJiraDescription(item))
        .filter((line) => line.length > 0)
        .join("\n");
    }
  }

  return JSON.stringify(value);
}

function normalizeJiraInboxIssue(
  issue: z.infer<typeof zJiraInboxIssue>,
): JiraInboxIssue {
  const normalized: JiraInboxIssue = {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    priority: issue.fields.priority?.name ?? "None",
  };

  if (issue.fields.labels.length > 0) {
    normalized.labels = issue.fields.labels;
  }

  const description = normalizeJiraDescription(
    issue.fields.description,
  )?.trim();
  if (description) {
    normalized.description = description;
  }

  const assignee = issue.fields.assignee?.displayName;
  if (assignee) {
    normalized.assignee = assignee;
  }

  const reporter = issue.fields.reporter?.displayName;
  if (reporter) {
    normalized.reporter = reporter;
  }

  return normalized;
}
