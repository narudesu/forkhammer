import debug from "debug";
import { handleOpencodeSessionCreate } from "src/peer-handlers/handle-opencode-session-create";
import { handleOpencodeSessionPrompt } from "src/peer-handlers/handle-opencode-session-prompt";
import { handleOpencodeStatus } from "src/peer-handlers/handle-opencode-status";
import { handleWorktreeList } from "src/peer-handlers/handle-worktree-list";
import type { PeerClient } from "src/peer-protocol/peer-client";
import type { WorkerContext } from "src/worker/context/types";
import { parseUltrafeedEventData } from "src/worker/events";
import type { UltrafeedEvent } from "src/worker/feed/feed-events";
import type {
  EventCursor,
  StoreSnapshot,
  WorkerStore,
} from "src/worker/stores/types";
import z from "zod";

const log = debug("app:peer");

type PeerStoreState = {
  activePeerId: string | null;
  pendingPeerId: string | null;
  sessionIssueKeys: Record<string, string>;
  sessionAgents: Record<string, "plan" | "build">;
};

export function createPeerStore(
  _ctx: WorkerContext,
  client: PeerClient,
): WorkerStore<PeerStoreState> {
  const state: PeerStoreState = {
    activePeerId: null,
    pendingPeerId: null,
    sessionIssueKeys: {},
    sessionAgents: {},
  };

  const sessionMetadata = {
    issueKeys: state.sessionIssueKeys,
    agents: state.sessionAgents,
  };
  const sessionMetadataStore = {
    setIssueKey: (sessionId: string, issueKey: string) => {
      state.sessionIssueKeys[sessionId] = issueKey;
    },
    setAgent: (sessionId: string, agent: "plan" | "build") => {
      state.sessionAgents[sessionId] = agent;
    },
  };

  client.register("worktree.list", (message) => {
    handleWorktreeList(message, client.send);
  });
  client.register("opencode.status", (message) => {
    handleOpencodeStatus(message, client.send, sessionMetadata);
  });
  client.register("opencode.session.create", (message) => {
    handleOpencodeSessionCreate(message, client.send, sessionMetadataStore);
  });
  client.register("opencode.session.prompt", (message) => {
    handleOpencodeSessionPrompt(message, client.send);
  });

  return {
    name: "peer",
    reduce(event: UltrafeedEvent, _cursor: EventCursor | null) {
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
      if (event.event_type === "validate_issue_started") {
        const parsed = parseUltrafeedEventData(
          event.event_type,
          event.data,
        ) as { session_id: string; issue_key: string } | null;

        if (parsed) {
          state.sessionIssueKeys[parsed.session_id] = parsed.issue_key;
          return true;
        }
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
