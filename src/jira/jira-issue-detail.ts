import z from "zod";
import type { Config } from "src/config/config";
import type { JiraIssueDetail } from "src/peer-protocol/peer-protocol";
import { jiraMarkdown } from "./jira-markdown";

const named = z.object({ name: z.string() });
const issueSchema = z.object({
  key: z.string().min(1),
  fields: z.object({
    summary: z.string(),
    assignee: z.object({ displayName: z.string() }).nullish(),
    priority: named.nullish(),
    description: z.unknown().optional(),
  }),
});
const commentSchema = z.object({
  id: z.string(),
  author: z.object({ displayName: z.string() }),
  created: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  body: z.unknown(),
});
const pageSchema = z.object({
  startAt: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  comments: z.array(commentSchema),
});

export async function getJiraIssueDetail(
  config: NonNullable<Config["jira"]>,
  issueKey: string,
): Promise<JiraIssueDetail | null> {
  async function request(path: string, params: Record<string, string> = {}) {
    const url = new URL(config.url);
    url.pathname = path;
    url.search = "";
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(config.auth).toString("base64")}`,
        Accept: "application/json",
      },
    });
    return response;
  }

  const path = `/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
  const response = await request(path, {
    fields: "summary,assignee,priority,description",
  });
  // Jira also uses 404 for issues hidden from this account.
  if (response.status === 404) return null;
  const issue = issueSchema.parse(await readResponse(response));
  const comments: z.infer<typeof commentSchema>[] = [];
  let startAt = 0;
  while (true) {
    const page = pageSchema.parse(
      await readResponse(
        await request(`${path}/comment`, {
          startAt: String(startAt),
          maxResults: "100",
          orderBy: "created",
        }),
      ),
    );
    if (page.startAt !== startAt)
      throw new Error("jira-comment-pagination-invalid");
    comments.push(...page.comments);
    startAt += page.comments.length;
    if (startAt >= page.total) break;
    if (page.comments.length === 0)
      throw new Error("jira-comment-pagination-stalled");
  }
  comments.sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
  return {
    key: issue.key,
    summary: issue.fields.summary,
    assignee: issue.fields.assignee?.displayName ?? null,
    priority: issue.fields.priority?.name ?? null,
    description: jiraMarkdown(issue.fields.description),
    comments: comments.map((comment) => ({
      id: comment.id,
      author: comment.author.displayName,
      createdAt: comment.created,
      body: jiraMarkdown(comment.body),
    })),
  };
}

async function readResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`jira-request-failed:${response.status}`);
  return response.json();
}
