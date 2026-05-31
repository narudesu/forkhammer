import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runRealtimeSubscription } from "./realtime";
import { createTestExecutionContext } from "./test-utils";
import type { FeedEvent } from "./types";
import type { WorkerStore } from "./stores/types";

describe("realtime subscription", () => {
  it("processes the snapshot before buffered realtime events", async () => {
    const previous = process.env.FORKHAMMER_STATE_DIR;
    const stateHome = await mkdtemp(join(tmpdir(), "forkhammer-realtime-"));
    process.env.FORKHAMMER_STATE_DIR = stateHome;

    try {
      const events: Array<string> = [];
      const snapshot = createDeferred<{
        data: Array<FeedEvent>;
        error: null;
      }>();
      const channel = createFakeChannel();
      const ctx = createTestExecutionContext([], {
        supabase: {
          setAccessToken: () => {},
          client: {
            realtime: { setAuth: () => {} },
            channel: () => channel,
            insert: async () => ({ error: null }),
            from: () => ({
              select: () => ({
                gte: () => ({
                  order: () => snapshot.promise,
                }),
                order: () => snapshot.promise,
              }),
            }),
          } as any,
        },
      });
      const stores: Array<WorkerStore<any>> = [
        {
          name: "tracker",
          reduce: (event) => {
            events.push(event.id);
            return true;
          },
          reconcile: async () => false,
          hydrate: () => {},
          snapshot: () => ({
            version: 1,
            reducedEventsSinceSnapshot: 0,
            state: {},
          }),
          needsSnapshot: () => false,
          markSnapshotPersisted: () => {},
        },
      ];

      const subscription = runRealtimeSubscription(ctx, {
        createStores: () => stores,
      });

      await tick();
      channel.emitInsert(makeEvent("r1", "2026-01-01T00:00:02.000Z"));

      snapshot.resolve({
        data: [makeEvent("s1", "2026-01-01T00:00:01.000Z")],
        error: null,
      });

      await waitFor(() => events.length === 2);
      channel.emitStatus("CLOSED");

      const result = await subscription;

      assert.deepEqual(events, ["s1", "r1"]);
      assert.deepEqual(result, { unauthorized: false, processed: false });
    } finally {
      process.env.FORKHAMMER_STATE_DIR = previous;
      await rm(stateHome, { recursive: true, force: true });
    }
  });

  it("dedupes overlapping snapshot and realtime events", async () => {
    const previous = process.env.FORKHAMMER_STATE_DIR;
    const stateHome = await mkdtemp(join(tmpdir(), "forkhammer-realtime-"));
    process.env.FORKHAMMER_STATE_DIR = stateHome;

    try {
      const events: Array<string> = [];
      const snapshot = createDeferred<{
        data: Array<FeedEvent>;
        error: null;
      }>();
      const channel = createFakeChannel();
      const ctx = createTestExecutionContext([], {
        supabase: {
          setAccessToken: () => {},
          client: {
            realtime: { setAuth: () => {} },
            channel: () => channel,
            insert: async () => ({ error: null }),
            from: () => ({
              select: () => ({
                gte: () => ({
                  order: () => snapshot.promise,
                }),
                order: () => snapshot.promise,
              }),
            }),
          } as any,
        },
      });
      const stores: Array<WorkerStore<any>> = [
        {
          name: "tracker",
          reduce: (event) => {
            events.push(event.id);
            return true;
          },
          reconcile: async () => false,
          hydrate: () => {},
          snapshot: () => ({
            version: 1,
            reducedEventsSinceSnapshot: 0,
            state: {},
          }),
          needsSnapshot: () => false,
          markSnapshotPersisted: () => {},
        },
      ];

      const subscription = runRealtimeSubscription(ctx, {
        createStores: () => stores,
      });

      await tick();
      channel.emitInsert(makeEvent("dup", "2026-01-01T00:00:02.000Z"));

      snapshot.resolve({
        data: [makeEvent("dup", "2026-01-01T00:00:01.000Z")],
        error: null,
      });

      await waitFor(() => events.length === 1);
      channel.emitStatus("CLOSED");

      const result = await subscription;

      assert.deepEqual(events, ["dup"]);
      assert.deepEqual(result, { unauthorized: false, processed: false });
    } finally {
      process.env.FORKHAMMER_STATE_DIR = previous;
      await rm(stateHome, { recursive: true, force: true });
    }
  });
});

function createFakeChannel() {
  let insertCallback: ((payload: { new: FeedEvent }) => void) | null = null;
  let statusCallback: ((status: string) => void) | null = null;

  const channel = {
    on: (
      _event: string,
      _filter: unknown,
      callback: (payload: { new: FeedEvent }) => void,
    ) => {
      insertCallback = callback;
      return channel;
    },
    subscribe: (callback: (status: string) => void) => {
      statusCallback = callback;
      callback("SUBSCRIBED");
      return channel;
    },
    unsubscribe: async () => {},
    emitInsert(event: FeedEvent) {
      insertCallback?.({ new: event });
    },
    emitStatus(status: string) {
      statusCallback?.(status);
    },
  };

  return channel;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function makeEvent(id: string, createdAt: string): FeedEvent {
  return {
    id,
    created_at: createdAt,
    event_type: "validate_issue_requested",
    data: { issue_key: "AT-123" },
  };
}

async function tick() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) {
      return;
    }

    await tick();
  }

  assert.fail("condition not reached");
}
