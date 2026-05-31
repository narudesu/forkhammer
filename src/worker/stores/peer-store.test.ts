import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTestExecutionContext } from "../test-utils";
import { createPeerStore } from "./peer-store";
import type { PeerClient } from "../peer-client";

const BROWSER_PEER_READY = "browser_peer_ready";

function createMockPeerClient(): {
  peerClient: PeerClient;
  connectCalls: string[];
} {
  const connectCalls: string[] = [];
  const peerClient = {
    connect: (peerId: string) => {
      connectCalls.push(peerId);
    },
    disconnect: () => {},
    send: () => {},
    onMessage: () => {},
    onDisconnect: () => {},
    register: () => {},
  } as unknown as PeerClient;
  return { peerClient, connectCalls };
}

describe("peer-store", () => {
  describe("reduce", () => {
    it("returns false for non-peer events", () => {
      const ctx = createTestExecutionContext();
      const store = createPeerStore(ctx);
      const event = {
        id: "1",
        created_at: "2026-01-01",
        event_type: "validate_issue_requested",
        data: { issue_key: "AT-123" },
      };
      const result = store.reduce(event);
      assert.equal(result, false);
    });

    it("returns false when peerId is missing", () => {
      const ctx = createTestExecutionContext();
      const store = createPeerStore(ctx);
      const event = {
        id: "1",
        created_at: "2026-01-01",
        event_type: BROWSER_PEER_READY,
        data: {},
      };
      const result = store.reduce(event);
      assert.equal(result, false);
    });

    it("returns false when peerId is not a string", () => {
      const ctx = createTestExecutionContext();
      const store = createPeerStore(ctx);
      const event = {
        id: "1",
        created_at: "2026-01-01",
        event_type: BROWSER_PEER_READY,
        data: { peerId: 123 },
      };
      const result = store.reduce(event);
      assert.equal(result, false);
    });

    it("returns false when data is null", () => {
      const ctx = createTestExecutionContext();
      const store = createPeerStore(ctx);
      const event = {
        id: "1",
        created_at: "2026-01-01",
        event_type: BROWSER_PEER_READY,
        data: null,
      };
      const result = store.reduce(event);
      assert.equal(result, false);
    });

    it("records peerId and returns true for valid browser_peer_ready", () => {
      const ctx = createTestExecutionContext();
      const { peerClient, connectCalls } = createMockPeerClient();
      const store = createPeerStore(ctx, peerClient);
      const event = {
        id: "1",
        created_at: "2026-01-01",
        event_type: BROWSER_PEER_READY,
        data: { peerId: "browser-peer-abc" },
      };
      const result = store.reduce(event);
      assert.equal(result, true);
      assert.deepEqual(connectCalls, []);
    });

    it("connects latest peerId during reconcile", async () => {
      const ctx = createTestExecutionContext();
      const { peerClient, connectCalls } = createMockPeerClient();
      const store = createPeerStore(ctx, peerClient);
      store.reduce({
        id: "1",
        created_at: "2026-01-01",
        event_type: BROWSER_PEER_READY,
        data: { peerId: "browser-peer-abc" },
      });
      await store.reconcile();
      assert.equal(connectCalls.length, 1);
    });

    it("only connects to the latest peerId after multiple events", async () => {
      const ctx = createTestExecutionContext();
      const { peerClient, connectCalls } = createMockPeerClient();
      const store = createPeerStore(ctx, peerClient);
      store.reduce({
        id: "1",
        created_at: "2026-01-01",
        event_type: BROWSER_PEER_READY,
        data: { peerId: "browser-peer-1" },
      });
      store.reduce({
        id: "2",
        created_at: "2026-01-01",
        event_type: BROWSER_PEER_READY,
        data: { peerId: "browser-peer-2" },
      });
      await store.reconcile();
      assert.equal(connectCalls.length, 1);
      assert.deepEqual(connectCalls, ["browser-peer-2"]);
    });
  });

  describe("snapshot", () => {
    it("returns initial state with null activePeerId", () => {
      const ctx = createTestExecutionContext();
      const { peerClient } = createMockPeerClient();
      const store = createPeerStore(ctx, peerClient);
      const snap = store.snapshot();
      assert.deepEqual(snap.state, {
        activePeerId: null,
        pendingPeerId: null,
      });
    });
  });
});
