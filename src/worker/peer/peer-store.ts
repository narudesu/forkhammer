import debug from "debug";
import {
  createEffect,
  createEvent,
  createStore,
  type Scope,
  sample,
  scopeBind,
} from "effector";
import { produce } from "immer";
import { handleOpencodeSessionCreate } from "src/peer-handlers/handle-opencode-session-create";
import { handleOpencodeSessionPrompt } from "src/peer-handlers/handle-opencode-session-prompt";
import { handleOpencodeStatus } from "src/peer-handlers/handle-opencode-status";
import { handleWorktreeList } from "src/peer-handlers/handle-worktree-list";
import type { OpencodeAgent } from "src/peer-protocol/peer-protocol";
import type { WorkerContext } from "src/worker/context/types";
import { parseUltrafeedEventData } from "src/worker/events";
import { reconcileRequested } from "src/worker/events/store-events";
import { feedEventReceived } from "src/worker/jira-artifact/jira-artifact-events";
import { HydratableStore } from "src/worker/snapshot/effector-snapshots";
import type { EventCursor } from "src/worker/stores/types";
import { isAfterCurrentCursor } from "src/worker/stores/types";
import z from "zod";

const log = debug("app:peer");

export type PeerStoreState = {
  pendingPeerId: string | null;
  sessionIssueKeys: Record<string, string>;
  cursor: EventCursor | null;
};

type PeerRuntimeStoreState = {
  activePeerId: string | null;
  sessionIssueKeys: Record<string, string>;
  sessionAgents: Record<string, OpencodeAgent>;
};

export const $peerStore = createStore<PeerStoreState>(
  {
    pendingPeerId: null,
    sessionIssueKeys: {},
    cursor: null,
  },
  { sid: "peer" },
);

export const hydratablePeerStore =
  HydratableStore.fromEffectorStore($peerStore);

const $peerRuntimeStore = createStore<PeerRuntimeStoreState>({
  activePeerId: null,
  sessionIssueKeys: {},
  sessionAgents: {},
});

const peerConnected = createEvent<string>();
const peerSessionIssueKeySet = createEvent<{
  sessionId: string;
  issueKey: string;
}>();
const peerSessionAgentSet = createEvent<{
  sessionId: string;
  agent: OpencodeAgent;
}>();

$peerStore.on(feedEventReceived, (state, action) =>
  produce(state, (state) => {
    if (!isAfterCurrentCursor(state.cursor, action)) {
      return;
    }

    const browserPeerReadyEvent = z
      .object({
        event_type: z.literal("browser_peer_ready"),
        data: z.object({ peerId: z.string() }),
      })
      .safeParse(action).data;

    if (browserPeerReadyEvent) {
      state.cursor = { id: action.id, created_at: action.created_at };
      state.pendingPeerId = browserPeerReadyEvent.data.peerId;
      return;
    }

    if (action.event_type === "validate_issue_started") {
      const parsed = parseUltrafeedEventData(
        action.event_type,
        action.data,
      ) as { session_id: string; issue_key: string } | null;

      if (parsed) {
        state.cursor = { id: action.id, created_at: action.created_at };
        state.sessionIssueKeys[parsed.session_id] = parsed.issue_key;
      }
    }
  }),
);

$peerRuntimeStore.on(peerConnected, (state, peerId) =>
  produce(state, (state) => {
    state.activePeerId = peerId;
  }),
);

$peerRuntimeStore.on(peerSessionIssueKeySet, (state, action) =>
  produce(state, (state) => {
    state.sessionIssueKeys[action.sessionId] = action.issueKey;
  }),
);

$peerRuntimeStore.on(peerSessionAgentSet, (state, action) =>
  produce(state, (state) => {
    state.sessionAgents[action.sessionId] = action.agent;
  }),
);

const effectRegisterPeerHandlers = createEffect(
  async ({ ctx, scope }: { ctx: WorkerContext; scope: Scope }) => {
    const client = ctx.peerClient;
    const setIssueKey = scopeBind(peerSessionIssueKeySet, { scope });
    const setAgent = scopeBind(peerSessionAgentSet, { scope });
    const sessionMetadataStore = {
      setIssueKey: (sessionId: string, issueKey: string) => {
        setIssueKey({ sessionId, issueKey });
      },
      setAgent: (sessionId: string, agent: OpencodeAgent) => {
        setAgent({ sessionId, agent });
      },
    };

    client.register("worktree.list", (message) => {
      handleWorktreeList(message, client.send);
    });
    client.register("opencode.status", (message) => {
      const state = scope.getState($peerStore);
      const runtimeState = scope.getState($peerRuntimeStore);
      handleOpencodeStatus(message, client.send, {
        issueKeys: {
          ...state.sessionIssueKeys,
          ...runtimeState.sessionIssueKeys,
        },
        agents: runtimeState.sessionAgents,
      });
    });
    client.register("opencode.session.create", (message) => {
      handleOpencodeSessionCreate(message, client.send, sessionMetadataStore);
    });
    client.register("opencode.session.prompt", (message) => {
      handleOpencodeSessionPrompt(message, client.send);
    });
  },
);

const effectConnectPeer = createEffect(
  async ({ ctx, peerId }: { ctx: WorkerContext; peerId: string }) => {
    log("connecting to new peer", { peerId });
    ctx.peerClient.connect(peerId);
    return peerId;
  },
);

sample({
  clock: reconcileRequested,
  filter: (action) => !!action.scope,
  fn: ({ ctx, scope }) => ({ ctx, scope: scope as Scope }),
  target: effectRegisterPeerHandlers,
});

sample({
  clock: reconcileRequested,
  source: {
    peer: $peerStore,
    runtime: $peerRuntimeStore,
  },
  filter: ({ peer, runtime }) =>
    !!peer.pendingPeerId && peer.pendingPeerId !== runtime.activePeerId,
  fn: ({ peer }, { ctx }) => ({ ctx, peerId: peer.pendingPeerId as string }),
  target: effectConnectPeer,
});

sample({
  clock: effectConnectPeer.doneData,
  target: peerConnected,
});
