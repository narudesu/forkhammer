import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTestExecutionContext } from "../test-utils";
import { createJiraArtifactStore } from "./jira-artifact-store";

describe("jira artifact store", () => {
  it("warns and ignores refreshes when the inbox filter is unset", async () => {
    const warnings: Array<string> = [];
    let fetched = false;
    let inserted = false;

    const store = createJiraArtifactStore(
      createTestExecutionContext([], {
        jira: {
          url: "https://example.atlassian.net",
          auth: "dev@example.com:token",
          filters: { inbox: {} },
        },
        runtime: {
          sleep: async () => {},
          fetch: async () => {
            fetched = true;
            throw new Error("unexpected fetch");
          },
        },
        supabase: {
          client: createInsertClient(() => {
            inserted = true;
            return { error: null };
          }) as any,
        },
        log: {
          debug: () => {},
          warn: (message: string) => warnings.push(message),
          error: () => {},
        },
      }),
    );

    const reduced = store.reduce(
      {
        id: "event-1",
        created_at: "2026-01-01T00:00:00.000Z",
        event_type: "artifact_refresh_requested",
        data: { type: "jira_inbox" },
      },
      null,
    );

    const mutated = await store.reconcile();

    assert.equal(reduced, true);
    assert.equal(mutated, true);
    assert.equal(fetched, false);
    assert.equal(inserted, false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /filter_id is unset/);
  });

  it("fetches Jira inbox issues and inserts a new snapshot row", async () => {
    const warnings: Array<string> = [];
    const inserts: Array<{
      table: string;
      rows: Array<Record<string, unknown>>;
    }> = [];
    const fetchCalls: Array<{ input: string; init: RequestInit | undefined }> =
      [];

    const store = createJiraArtifactStore(
      createTestExecutionContext([], {
        jira: {
          url: "https://example.atlassian.net",
          auth: "dev@example.com:token",
          filters: { inbox: { filter_id: "12345" } },
        },
        runtime: {
          sleep: async () => {},
          fetch: async (input, init) => {
            fetchCalls.push({ input: String(input), init });
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
        },
        supabase: {
          client: createInsertClient((table, rows) => {
            inserts.push({ table, rows });
            return { error: null };
          }) as any,
        },
        log: {
          debug: () => {},
          warn: (message: string) => warnings.push(message),
          error: () => {},
        },
      }),
    );

    const reduced = store.reduce(
      {
        id: "event-2",
        created_at: "2026-01-01T00:00:00.000Z",
        event_type: "artifact_refresh_requested",
        data: { type: "jira_inbox" },
      },
      null,
    );

    const mutated = await store.reconcile();

    assert.equal(reduced, true);
    assert.equal(mutated, true);
    assert.equal(warnings.length, 0);
    assert.equal(fetchCalls.length, 1);
    assert.equal(
      fetchCalls[0].input,
      "https://example.atlassian.net/rest/api/3/search/jql?jql=filter%3D12345&maxResults=100&fields=summary%2Cstatus%2Cpriority%2Clabels%2Cdescription%2Cassignee%2Creporter",
    );
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].table, "jira_artifacts");
    assert.deepEqual(inserts[0].rows, [
      {
        id: "event-2",
        user_id: "user-1",
        content: [
          {
            key: "AT-1",
            summary: "Inbox issue",
            status: "Open",
            priority: "High",
            labels: ["backend"],
            description: "Fix this",
            assignee: "Ada",
            reporter: "Ben",
          },
        ],
      },
    ]);
  });
});

function createInsertClient(
  onInsert: (
    table: string,
    rows: Array<Record<string, unknown>>,
  ) => { error: { message: string } | null },
) {
  return {
    realtime: { setAuth: () => {} },
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
    channel: () => ({
      on: () => ({
        on: () => {
          throw new Error("not used");
        },
        subscribe: () => {},
        unsubscribe: async () => {},
      }),
      subscribe: () => {},
      unsubscribe: async () => {},
    }),
    from: (table: string) => ({
      select: () => ({
        gte: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
      insert: async (rows: Array<Record<string, unknown>>) =>
        onInsert(table, rows),
    }),
  } as any;
}
