import { describe, expect, test } from "bun:test";
import { allSettled, fork } from "effector";
import { reconcileRequested } from "src/worker/events/store-events";
import type { UltrafeedEvent } from "src/worker/feed/feed-events";
import { feedEventReceived } from "src/worker/jira-artifact/jira-artifact-events";
import {
  $jiraArtifactRequests,
  hydratableArtifactStore,
  type JiraArtifactStoreState,
} from "src/worker/jira-artifact/jira-artifact-store";
import { TestWorkerContext } from "src/worker/test/test-context";

const fakeIssues = [
  {
    key: "FH-1",
    summary: "Test issue",
    status: "To Do",
  },
];

describe("jira artifact store", () => {
  test("fetches and inserts the Jira artifact after a refresh request", async () => {
    const scope = fork();
    const testContext = TestWorkerContext.create({
      jira: { fakeIssues },
    });
    const ctx = testContext.getContext();
    const supabase = testContext.testSupabaseClient();

    await allSettled(hydratableArtifactStore.hydrationRequested, {
      scope,
      params: { isRefetchRequested: false, cursor: null },
    });
    await allSettled(feedEventReceived, {
      scope,
      params: artifactRefreshRequestedEvent,
    });
    await allSettled(reconcileRequested, {
      scope,
      params: { ctx, scope },
    });

    const inserts = supabase.getInserts();
    expect(inserts).toHaveLength(2);

    const artifactInsert = inserts.find(
      (insert) => insert.table === "user_artifacts",
    );
    const eventInsert = inserts.find((insert) => insert.table === "events");
    expect(artifactInsert?.rows).toHaveLength(1);
    expect(eventInsert?.rows).toHaveLength(1);

    const artifactRow = artifactInsert?.rows[0] as {
      id: string;
      user_id: string;
      type: string;
      content: unknown;
    };
    const eventRow = eventInsert?.rows[0] as {
      event_type: string;
      data: { artifactType: string; artifactId: string };
    };

    expect(artifactRow).toMatchObject({
      user_id: "user-1",
      type: "jira",
      content: fakeIssues,
    });
    expect(artifactRow.id).toBeString();
    expect(eventRow).toEqual({
      event_type: "inserted_artifact",
      data: { artifactType: "jira", artifactId: artifactRow.id },
    });
  });

  test("upserts the current Jira artifact without affecting other artifact types", async () => {
    const scope = fork();
    const testContext = TestWorkerContext.create({
      jira: { fakeIssues },
      supabase: {
        rows: {
          user_artifacts: [
            { id: "old-jira-artifact", user_id: "user-1", type: "jira" },
            { id: "other-artifact", user_id: "user-1", type: "gitlab" },
          ],
        },
      },
    });
    const ctx = testContext.getContext();
    const supabase = testContext.testSupabaseClient();

    await allSettled(hydratableArtifactStore.hydrationRequested, {
      scope,
      params: {
        isRefetchRequested: false,
        cursor: null,
      } satisfies JiraArtifactStoreState,
    });
    await allSettled(feedEventReceived, {
      scope,
      params: artifactRefreshRequestedEvent,
    });
    await allSettled(reconcileRequested, {
      scope,
      params: { ctx, scope },
    });

    const artifactInsert = supabase
      .getInserts()
      .find((insert) => insert.table === "user_artifacts");
    const artifactRow = artifactInsert?.rows[0] as { id: string };

    expect(artifactRow.id).toBeString();
    expect(supabase.getDeletes()).toEqual([]);
  });
});

const artifactRefreshRequestedEvent: UltrafeedEvent = {
  id: "event-1",
  created_at: "2026-01-01T00:00:00.000Z",
  event_type: "artifact_refresh_requested",
  data: { type: "jira" },
};
