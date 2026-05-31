import type { ExecutionContext } from "../context";
import type { FeedEvent } from "../types";
import type { EventCursor, StoreSnapshot, WorkerStore } from "./types";
import { createPeerClient, type PeerClient } from "../../peer-client";
import debug from "debug";

const log = debug("app:peer");

type PeerStoreState = {
  activePeerId: string | null;
  pendingPeerId: string | null;
};

const BROWSER_PEER_READY = "browser_peer_ready";

export function createPeerStore(
  ctx: ExecutionContext,
  peerClient?: PeerClient,
): WorkerStore<PeerStoreState> {
  const state: PeerStoreState = {
    activePeerId: null,
    pendingPeerId: null,
  };

  let client = peerClient ?? null;
  let peerCreationFailed = false;

  function getPeerClient(): PeerClient | null {
    if (client) {
      return client;
    }

    if (peerCreationFailed) {
      return null;
    }

    try {
      log("creating peer client");
      client = createPeerClient();
      return client;
    } catch (error) {
      peerCreationFailed = true;
      ctx.log.warn(
        "skipping browser peer connection: %s",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  return {
    name: "peer",
    reduce(event: FeedEvent, _cursor: EventCursor | null) {
      if (event.event_type !== BROWSER_PEER_READY) {
        return false;
      }

      const data = event.data;
      if (typeof data !== "object" || data === null) {
        return false;
      }

      const record = data as Record<string, unknown>;
      const peerId = typeof record.peerId === "string" ? record.peerId : null;

      if (!peerId) {
        return false;
      }

      state.pendingPeerId = peerId;

      return true;
    },
    async reconcile() {
      const peerId = state.pendingPeerId;
      if (!peerId || peerId === state.activePeerId) {
        return false;
      }

      const peerClientInstance = getPeerClient();
      if (!peerClientInstance) {
        return false;
      }

      log("connecting to new peer", { peerId });
      peerClientInstance.connect(peerId);
      state.activePeerId = peerId;

      return false;
    },
    hydrate(_snapshot: StoreSnapshot<PeerStoreState> | null) {},
    snapshot() {
      return {
        version: 1 as const,
        reducedEventsSinceSnapshot: 0,
        state,
      };
    },
    needsSnapshot() {
      return false;
    },
    markSnapshotPersisted() {},
  };
}
