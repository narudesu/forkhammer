import { allSettled, fork } from "effector";
import { describe, expect, test } from "bun:test";
import { reconcileRequested } from "../events/store-events";
import { feedEventReceived } from "../jira-artifact/jira-artifact-events";
import {
  $operationsArtifactStore,
  hydratableOperationsArtifactStore,
} from "./operations-artifact-store";
import { createTestContext } from "../test/test-context";

describe("operations artifact store", () => {
  test("dispatches a healthcheck refresh to the shared artifact table", async () => {
    const scope = fork();
    const context = createTestContext({ empty: true });
    const ctx = context.getContext();
    ctx.workerConfig.healthchecks = {
      app: { name: "App", url: "https://app.example.com/health" },
    };

    await allSettled(hydratableOperationsArtifactStore.hydrationRequested, {
      scope,
      params: { pending: {}, cursor: null },
    });
    await allSettled(feedEventReceived, {
      scope,
      params: {
        id: "refresh-1",
        created_at: "2026-07-16T00:00:00Z",
        event_type: "artifact_refresh_requested",
        data: { type: "healthcheck" },
      },
    });
    await allSettled(reconcileRequested, { scope, params: { ctx, scope } });

    expect(
      context
        .testSupabaseClient()
        .getInserts()
        .find((insert) => insert.table === "user_artifacts")?.rows[0],
    ).toMatchObject({
      type: "healthcheck",
      content: [{ id: "app", statusCode: 0, healthy: false }],
    });
    expect(scope.getState($operationsArtifactStore).pending).toEqual({
      healthcheck: true,
    });
  });
});
