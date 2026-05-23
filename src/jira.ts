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
    description: z
      .string()
      .nullable()
      .transform((value) => value ?? ""),
    creator: z.object({ displayName: z.string() }),
    comment: z
      .object({
        comments: z.array(zJiraComment),
      })
      .optional()
      .default({ comments: [] }),
  }),
});

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
    description: parsed.description,
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

  return JSON.stringify(body);
}
