import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTestExecutionContext } from "./test-utils";
import { createMessageCounterStore } from "./stores/message-counter-store";
import { createValidationStore } from "./stores/validation-store";
import { hydrateStores } from "./state-manager";
import {
  getStateStoreDir,
  readStateSnapshotBundle,
  writeStateSnapshotBundle,
} from "./persistence";

describe("worker persistence", () => {
  it("round-trips the atomic snapshot bundle in the xdg state dir", async () => {
    const previousForkhammer = process.env.FORKHAMMER_STATE_DIR;
    const stateHome = await mkdtemp(join(tmpdir(), "forkhammer-state-"));
    process.env.FORKHAMMER_STATE_DIR = stateHome;

    try {
      const bundle = {
        version: 1 as const,
        cursor: {
          created_at: "2026-01-01T00:00:01.000Z",
          id: "1",
        },
        stores: {
          "message-counter": {
            version: 1 as const,
            reducedEventsSinceSnapshot: 3,
            state: {
              totalReceived: 7,
              lastEventId: "1",
              lastEventType: "validate_issue_requested",
            },
          },
        },
      };

      await writeStateSnapshotBundle(bundle);
      const loaded = await readStateSnapshotBundle();

      assert.deepEqual(loaded, bundle);
      assert.equal(getStateStoreDir().startsWith(stateHome), true);
    } finally {
      process.env.FORKHAMMER_STATE_DIR = previousForkhammer;
      await rm(stateHome, { recursive: true, force: true });
    }
  });

  it("hydrates stores and returns the shared replay cursor", async () => {
    const previousForkhammer = process.env.FORKHAMMER_STATE_DIR;
    const stateHome = await mkdtemp(join(tmpdir(), "forkhammer-state-"));
    process.env.FORKHAMMER_STATE_DIR = stateHome;

    try {
      await writeStateSnapshotBundle({
        version: 1 as const,
        cursor: {
          created_at: "2026-01-01T00:00:02.000Z",
          id: "2",
        },
        stores: {
          validation: {
            version: 1 as const,
            reducedEventsSinceSnapshot: 0,
            state: {
              issues: {},
            },
          },
          "message-counter": {
            version: 1 as const,
            reducedEventsSinceSnapshot: 0,
            state: {
              totalReceived: 1,
              lastEventId: "1",
              lastEventType: "validate_issue_requested",
            },
          },
        },
      });

      const ctx = createTestExecutionContext();
      const stores = [
        createValidationStore(ctx),
        createMessageCounterStore(ctx),
      ];

      const cursor = await hydrateStores(stores);

      assert.deepEqual(cursor, {
        created_at: "2026-01-01T00:00:02.000Z",
        id: "2",
      });
    } finally {
      process.env.FORKHAMMER_STATE_DIR = previousForkhammer;
      await rm(stateHome, { recursive: true, force: true });
    }
  });
});
