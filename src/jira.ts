import toml from "smol-toml";
import z from "zod";
import type { Config } from "./config";

const zJiraIssue = z.object({
  fields: z.object({
    status: z.object({ name: z.string() }),
    summary: z.string(),
    description: z
      .string()
      .nullable()
      .transform((value) => value ?? ""),
    creator: z.object({ displayName: z.string() }),
  }),
});

export type IssueContext = {
  key: string;
  summary: string;
  creator: string;
  status: string;
  description: string;
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
  };
}

export function formatIssueContext(issue: IssueContext) {
  const metadata = {
    key: issue.key,
    summary: issue.summary,
    creator: issue.creator,
    status: issue.status,
  };

  return `${toml.stringify(metadata)}\ndescription:\n\n${issue.description}`;
}
