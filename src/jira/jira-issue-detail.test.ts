import { afterEach, describe, expect, mock, test } from "bun:test";
import { JiraClient } from "./jira";
import { jiraMarkdown } from "./jira-markdown";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const config = { url: "https://jira.example.test", auth: "user:token" };
const issue = { key: "ABC-1", fields: { summary: "Example" } };
const comment = (id: string, created: string) => ({
  id,
  created,
  author: { displayName: "Alice" },
  body: "Hello",
});
function responses(...values: (object | number)[]) {
  const fetchMock = mock(async () => {
    const value = values.shift();
    if (value === undefined) throw new Error("unexpected fetch");
    return typeof value === "number"
      ? new Response("failure", { status: value })
      : Response.json(value);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const get = () => JiraClient.create(config).getJiraIssue({ issueKey: "ABC-1" });

describe("Jira issue detail", () => {
  test("uses configured credentials, direct endpoint, and absent field defaults", async () => {
    const fetchMock = responses(issue, { startAt: 0, total: 0, comments: [] });
    expect(await get()).toEqual({
      key: "ABC-1",
      summary: "Example",
      assignee: null,
      priority: null,
      description: "",
      comments: [],
    });
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.origin).toBe(config.url);
    expect(url.pathname).toBe("/rest/api/3/issue/ABC-1");
    expect(options.method).toBe("GET");
    expect(options.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from(config.auth).toString("base64")}`,
    });
  });
  test("missing issue returns null without fetching comments", async () => {
    const fetchMock = responses(404);
    expect(await get()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  for (const status of [401, 403, 429, 500]) {
    test(`propagates issue API failure ${status}`, async () => {
      responses(status);
      await expect(get()).rejects.toThrow(`jira-request-failed:${status}`);
    });
  }
  test("comment 404 is an error, not a missing issue", async () => {
    responses(issue, 404);
    await expect(get()).rejects.toThrow("jira-request-failed:404");
  });
  test("propagates network and malformed response failures", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(get()).rejects.toThrow("offline");
    responses({ fields: {} });
    await expect(get()).rejects.toThrow();
  });
  test("fetches every page and sorts by creation time", async () => {
    const fetchMock = responses(
      {
        ...issue,
        fields: {
          ...issue.fields,
          assignee: { displayName: "Bob" },
          priority: { name: "High" },
          description: null,
        },
      },
      {
        startAt: 0,
        total: 3,
        comments: [comment("3", "2025-01-03T00:00:00Z")],
      },
      {
        startAt: 1,
        total: 3,
        comments: [
          comment("1", "2025-01-01T00:00:00Z"),
          comment("2", "2025-01-02T00:00:00Z"),
        ],
      },
    );
    const result = await get();
    expect(result?.comments.map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(result).toMatchObject({
      assignee: "Bob",
      priority: "High",
      description: "",
    });
    const [url] = fetchMock.mock.calls[2] as unknown as [URL];
    expect(url.searchParams.get("startAt")).toBe("1");
  });
  test("converts descriptions and comment bodies to Markdown", async () => {
    const body = {
      type: "doc",
      content: [paragraph(text("Important", [{ type: "strong" }]))],
    };
    responses(
      { ...issue, fields: { ...issue.fields, description: body } },
      {
        startAt: 0,
        total: 1,
        comments: [{ ...comment("1", "2025-01-01T00:00:00Z"), body }],
      },
    );
    const result = await get();
    expect(result?.description).toBe("**Important**");
    expect(result?.comments[0]?.body).toBe("**Important**");
  });
  test("rejects stalled pagination", async () => {
    responses(issue, { startAt: 0, total: 1, comments: [] });
    await expect(get()).rejects.toThrow("pagination-stalled");
  });
});

const text = (value: string, marks?: object[]) => ({
  type: "text",
  text: value,
  marks,
});
const paragraph = (...content: object[]) => ({ type: "paragraph", content });
test("ADF Markdown preserves links, emphasis, nested lists and fenced code", () => {
  const result = jiraMarkdown({
    type: "doc",
    content: [
      paragraph(
        text("bold", [{ type: "strong" }]),
        text(" italic", [{ type: "em" }]),
        text(" link", [
          { type: "link", attrs: { href: "https://example.com" } },
        ]),
      ),
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              paragraph(text("one")),
              {
                type: "orderedList",
                content: [
                  { type: "listItem", content: [paragraph(text("nested"))] },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "codeBlock",
        attrs: { language: "ts" },
        content: [text("const x = `code`;\nnext();")],
      },
    ],
  });
  expect(result).toContain("**bold** *italic*");
  expect(result).toContain("[ link](<https://example.com>)");
  expect(result).toContain("- one\n  \n  1. nested");
  expect(result).toContain("```ts\nconst x = `code`;\nnext();\n```");
  expect(jiraMarkdown(undefined)).toBe("");
  expect(jiraMarkdown("plain")).toBe("plain");
});
