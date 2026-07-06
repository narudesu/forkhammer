import z from "zod";

export const zJiraComment = z.object({
  author: z.object({ displayName: z.string() }),
  body: z.unknown(),
  created: z.string(),
});

export const zJiraIssue = z.object({
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

export const zJiraInboxIssue = z.object({
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

export const zJiraInboxSearchResponse = z.object({
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
