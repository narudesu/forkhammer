import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processEvent, reconcileStores } from "./event-processor";
import type { FeedEvent } from "./types";
import { createTestExecutionContext } from "./test-utils";
import type { WorkerStore } from "./stores/types";

describe("processEvent", () => {
  it("reduces each event once and can skip reconciliation", async () => {
    const calls: string[] = [];
    const ctx = createTestExecutionContext(calls);
    const seenEventIds = new Set<string>();
    const stores: Array<WorkerStore<any>> = [
      {
        name: "test-store",
        reduce: (event) => {
          calls.push(`reduce:${event.id}`);
          return true;
        },
        reconcile: async () => {
          calls.push("reconcile");
          return false;
        },
        hydrate: () => {},
        snapshot: () => ({
          version: 1,
          cursor: null,
          reducedEventsSinceSnapshot: 0,
          state: {},
        }),
        needsSnapshot: () => false,
        markSnapshotPersisted: () => {},
        getCursor: () => null,
      },
    ];

    const event = makeEvent({
      id: "1",
      event_type: "validate_issue_requested",
      data: { issue_key: "AT-123" },
    });

    await processEvent(ctx, event, stores, seenEventIds, { reconcile: false });
    await processEvent(ctx, event, stores, seenEventIds, { reconcile: true });

    assert.deepEqual(calls, ["reduce:1"]);
  });

  it("reconciles after a new event", async () => {
    const calls: string[] = [];
    const ctx = createTestExecutionContext(calls);
    const seenEventIds = new Set<string>();
    const stores: Array<WorkerStore<any>> = [
      {
        name: "test-store",
        reduce: (event) => {
          calls.push(`reduce:${event.id}`);
          return true;
        },
        reconcile: async () => {
          calls.push("reconcile");
          return false;
        },
        hydrate: () => {},
        snapshot: () => ({
          version: 1,
          cursor: null,
          reducedEventsSinceSnapshot: 0,
          state: {},
        }),
        needsSnapshot: () => false,
        markSnapshotPersisted: () => {},
        getCursor: () => null,
      },
    ];

    await processEvent(
      ctx,
      makeEvent({
        id: "2",
        event_type: "validate_issue_requested",
        data: { issue_key: "AT-124" },
      }),
      stores,
      seenEventIds,
      { reconcile: true },
    );

    assert.deepEqual(calls, ["reduce:2", "reconcile"]);
  });

  it("reconciles stores in parallel", async () => {
    const calls: string[] = [];
    createTestExecutionContext(calls);
    let releaseFirst: () => void = () => {};
    let releaseSecond: () => void = () => {};
    const firstReady = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondReady = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const stores: Array<WorkerStore<any>> = [
      {
        name: "first",
        reduce: () => false,
        reconcile: async () => {
          calls.push("start:first");
          await firstReady;
          calls.push("done:first");
          return false;
        },
        hydrate: () => {},
        snapshot: () => ({
          version: 1,
          cursor: null,
          reducedEventsSinceSnapshot: 0,
          state: {},
        }),
        needsSnapshot: () => false,
        markSnapshotPersisted: () => {},
        getCursor: () => null,
      },
      {
        name: "second",
        reduce: () => false,
        reconcile: async () => {
          calls.push("start:second");
          await secondReady;
          calls.push("done:second");
          return false;
        },
        hydrate: () => {},
        snapshot: () => ({
          version: 1,
          cursor: null,
          reducedEventsSinceSnapshot: 0,
          state: {},
        }),
        needsSnapshot: () => false,
        markSnapshotPersisted: () => {},
        getCursor: () => null,
      },
    ];

    const reconcile = reconcileStores(stores);
    await Promise.resolve();

    assert.deepEqual(calls, ["start:first", "start:second"]);

    releaseFirst?.();
    releaseSecond?.();
    await reconcile;
    assert.deepEqual(calls, [
      "start:first",
      "start:second",
      "done:first",
      "done:second",
    ]);
  });
});

function makeEvent(
  input: Pick<FeedEvent, "id" | "event_type" | "data">,
): FeedEvent {
  return {
    id: input.id,
    created_at: "2026-01-01",
    event_type: input.event_type,
    data: input.data,
  };
}
