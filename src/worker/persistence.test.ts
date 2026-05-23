import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTestExecutionContext } from "./test-utils";
import { createMessageCounterStore } from "./stores/message-counter-store";
import { createValidationStore } from "./stores/validation-store";
import { getReplayCursor, hydrateStores } from "./state-manager";
import {
  getStateStoreDir,
  readStoreSnapshot,
  writeStoreSnapshot,
} from "./persistence";

describe("worker persistence", () => {
  it("round-trips store snapshots in the xdg state dir", async () => {
    const previousForkhammer = process.env.FORKHAMMER_STATE_DIR;
    const stateHome = await mkdtemp(join(tmpdir(), "forkhammer-state-"));
    process.env.FORKHAMMER_STATE_DIR = stateHome;

    try {
      const snapshot = {
        version: 1 as const,
        cursor: {
          created_at: "2026-01-01T00:00:01.000Z",
          id: "1",
        },
        reducedEventsSinceSnapshot: 3,
        state: {
          totalReceived: 7,
          lastEventId: "1",
          lastEventType: "validate_issue_requested",
        },
      };

      await writeStoreSnapshot("message-counter", snapshot);
      const loaded =
        await readStoreSnapshot<typeof snapshot.state>("message-counter");

      assert.deepEqual(loaded, snapshot);
      assert.equal(getStateStoreDir().startsWith(stateHome), true);
    } finally {
      process.env.FORKHAMMER_STATE_DIR = previousForkhammer;
      await rm(stateHome, { recursive: true, force: true });
    }
  });

  it("hydrates stores and computes the earliest replay cursor", async () => {
    const previousForkhammer = process.env.FORKHAMMER_STATE_DIR;
    const stateHome = await mkdtemp(join(tmpdir(), "forkhammer-state-"));
    process.env.FORKHAMMER_STATE_DIR = stateHome;

    try {
      await writeStoreSnapshot("validation", {
        version: 1 as const,
        cursor: {
          created_at: "2026-01-01T00:00:02.000Z",
          id: "2",
        },
        reducedEventsSinceSnapshot: 0,
        state: {
          issues: {},
        },
      });

      await writeStoreSnapshot("message-counter", {
        version: 1 as const,
        cursor: {
          created_at: "2026-01-01T00:00:01.000Z",
          id: "1",
        },
        reducedEventsSinceSnapshot: 0,
        state: {
          totalReceived: 1,
          lastEventId: "1",
          lastEventType: "validate_issue_requested",
        },
      });

      const ctx = createTestExecutionContext();
      const stores: Array<any> = [
        createValidationStore(ctx),
        createMessageCounterStore(ctx),
      ];

      await hydrateStores(stores);

      assert.deepEqual(getReplayCursor(stores), {
        created_at: "2026-01-01T00:00:01.000Z",
        id: "1",
      });
    } finally {
      process.env.FORKHAMMER_STATE_DIR = previousForkhammer;
      await rm(stateHome, { recursive: true, force: true });
    }
  });
});
