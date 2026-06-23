import debug from "debug";
import type { PeerClient } from "src/peer-client";
import { handleOpencodeSessionPrompt } from "src/peer-handlers/handle-opencode-session-prompt";
import { handleOpencodeStatus } from "src/peer-handlers/handle-opencode-status";
import { handleWorktreeList } from "src/peer-handlers/handle-worktree-list";
import type { ExecutionContext } from "src/worker/context";
import type {
  EventCursor,
  StoreSnapshot,
  WorkerStore,
} from "src/worker/stores/types";
import type { FeedEvent } from "src/worker/types";
import z from "zod";

const log = debug("app:peer");

type PeerStoreState = {
  activePeerId: string | null;
  pendingPeerId: string | null;
};

export function createPeerStore(
  _ctx: ExecutionContext,
  client: PeerClient,
): WorkerStore<PeerStoreState> {
  const state: PeerStoreState = {
    activePeerId: null,
    pendingPeerId: null,
  };

  client.register("worktree.list", (message) => {
    handleWorktreeList(message, client.send);
  });
  client.register("opencode.status", (message) => {
    handleOpencodeStatus(message, client.send);
  });
  client.register("opencode.session.prompt", (message) => {
    handleOpencodeSessionPrompt(message, client.send);
  });

  return {
    name: "peer",
    reduce(event: FeedEvent, _cursor: EventCursor | null) {
      const browserPeerReadyEvent = z
        .object({
          event_type: z.literal("browser_peer_ready"),
          data: z.object({ peerId: z.string() }),
        })
        .safeParse(event).data;

      if (browserPeerReadyEvent) {
        state.pendingPeerId = browserPeerReadyEvent.data.peerId;
        return true;
      }
      return false;
    },
    async reconcile() {
      const peerId = state.pendingPeerId;
      if (!peerId || peerId === state.activePeerId) {
        return false;
      }

      log("connecting to new peer", { peerId });
      client.connect(peerId);
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
