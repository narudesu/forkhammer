import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatJiraInboxIssues, runJiraInbox } from "./jira";

describe("jira inbox command", () => {
  it("formats inbox issues", () => {
    assert.deepEqual(
      formatJiraInboxIssues([
        {
          key: "AT-1",
          summary: "Inbox issue",
          status: "Open",
          priority: "High",
          labels: ["backend"],
          assignee: "Ada",
        },
      ]).map(stripAnsi),
      [
        "- AT-1 Inbox issue",
        "  status: Open",
        "  priority: High",
        "  labels: backend",
        "  assignee: Ada",
      ],
    );
  });

  it("warns and returns when the inbox filter is missing", async () => {
    const warnings: Array<string> = [];
    let fetched = false;

    await runJiraInbox({
      loadConfig: async () => ({
        jira: {
          url: "https://example.atlassian.net",
          auth: "dev@example.com:token",
          filters: { inbox: {} },
        },
      }),
      fetchFn: async () => {
        fetched = true;
        throw new Error("unexpected fetch");
      },
      warn: (line) => warnings.push(line),
      print: () => {},
    });

    assert.equal(fetched, false);
    assert.deepEqual(warnings, [
      "No jira.filters.inbox.filter_id configured; nothing to fetch.",
    ]);
  });

  it("fetches and prints inbox issues", async () => {
    const printed: Array<string> = [];
    const calls: Array<string> = [];

    await runJiraInbox({
      loadConfig: async () => ({
        jira: {
          url: "https://example.atlassian.net",
          auth: "dev@example.com:token",
          filters: { inbox: { filter_id: "12345" } },
        },
      }),
      fetchFn: async (input) => {
        calls.push(String(input));
        return new Response(
          JSON.stringify({
            isLast: true,
            issues: [
              {
                key: "AT-1",
                fields: {
                  summary: "Inbox issue",
                  status: { name: "Open" },
                  priority: { name: "High" },
                  labels: ["backend"],
                  description: {
                    type: "doc",
                    version: 1,
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Fix this" }],
                      },
                    ],
                  },
                  assignee: { displayName: "Ada" },
                  reporter: { displayName: "Ben" },
                },
              },
            ],
          }),
        );
      },
      print: (line) => printed.push(line),
    });

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0],
      "https://example.atlassian.net/rest/api/3/search/jql?jql=filter%3D12345&maxResults=100&fields=summary%2Cstatus%2Cpriority%2Clabels%2Cdescription%2Cassignee%2Creporter",
    );
    assert.deepEqual(printed.map(stripAnsi), [
      "Jira inbox issues (1):",
      "- AT-1 Inbox issue",
      "  status: Open",
      "  priority: High",
      "  labels: backend",
      "  assignee: Ada",
      "  reporter: Ben",
    ]);
  });
});

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}
