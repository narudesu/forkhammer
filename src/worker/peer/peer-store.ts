import debug from "debug";
import {
  createEffect,
  createEvent,
  createStore,
  sample,
  type Scope,
} from "effector";
import { produce } from "immer";
import {
  createPeerResolverTarget,
  PeerResolver,
} from "src/peer-protocol/peer-resolver";
import type { PeerConnection } from "src/peer-protocol/peer-client";
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
  pendingConnection: Extract<PeerConnection, { transport: "realtime" }> | null;
  sessionIssueKeys: Record<string, string>;
  cursor: EventCursor | null;
};

type PeerRuntimeStoreState = {
  activePeerId: string | null;
  activeConnectionId: string | null;
  sessionIssueKeys: Record<string, string>;
  sessionAgents: Record<string, {}>;
};

export const $peerStore = createStore<PeerStoreState>(
  {
    pendingPeerId: null,
    pendingConnection: null,
    sessionIssueKeys: {},
    cursor: null,
  },
  { sid: "peer" },
);

export const hydratablePeerStore =
  HydratableStore.fromEffectorStore($peerStore);

const $peerRuntimeStore = createStore<PeerRuntimeStoreState>({
  activePeerId: null,
  activeConnectionId: null,
  sessionIssueKeys: {},
  sessionAgents: {},
});

const peerConnected = createEvent<PeerConnection>();
const peerSessionIssueKeySet = createEvent<{
  sessionId: string;
  issueKey: string;
}>();
const peerSessionAgentSet = createEvent<{
  sessionId: string;
  agent: {};
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
      state.pendingConnection = null;
      return;
    }

    const browserRealtimeReadyEvent = z
      .object({
        event_type: z.literal("browser_realtime_ready"),
        data: z.object({
          connectionId: z.uuid(),
          channelName: z.string(),
          transport: z.literal("realtime"),
          expiresAt: z.iso.datetime(),
        }),
      })
      .safeParse(action).data;

    if (browserRealtimeReadyEvent) {
      const { connectionId, channelName, expiresAt } =
        browserRealtimeReadyEvent.data;
      const channelMatch = channelName.match(
        /^forkhammer-worker-([0-9a-f-]{36})-([0-9a-f-]{36})$/i,
      );
      const validChannel =
        !!channelMatch &&
        z.uuid().safeParse(channelMatch[1]).success &&
        z.uuid().safeParse(channelMatch[2]).success;

      state.cursor = { id: action.id, created_at: action.created_at };
      if (validChannel && Date.parse(expiresAt) > Date.now()) {
        state.pendingConnection = {
          transport: "realtime",
          connectionId,
          channelName,
          expiresAt,
        };
        state.pendingPeerId = null;
      }
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

$peerRuntimeStore.on(peerConnected, (state, connection) =>
  produce(state, (state) => {
    state.activePeerId =
      connection.transport === "webrtc" ? connection.peerId : null;
    state.activeConnectionId =
      connection.transport === "realtime" ? connection.connectionId : null;
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
  async ({ ctx }: { ctx: WorkerContext; scope: Scope }) => {
    PeerResolver.register(ctx, createPeerResolverTarget(ctx));
  },
);

const effectConnectPeer = createEffect(
  async ({
    ctx,
    connection,
  }: {
    ctx: WorkerContext;
    connection: PeerConnection;
  }) => {
    log("connecting to new peer", { connection });
    if (connection.transport === "realtime") {
      const userId = ctx.auth.activeTokenOrFail().getUserId();
      const expectedPrefix = `forkhammer-worker-${userId}-`;
      if (!connection.channelName.startsWith(expectedPrefix)) {
        throw new Error("realtime-channel-user-mismatch");
      }
      if (Date.parse(connection.expiresAt) <= Date.now()) {
        throw new Error("realtime-handshake-expired");
      }
    }
    ctx.peerClient.connect(connection);
    return connection;
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
    (!!peer.pendingPeerId && peer.pendingPeerId !== runtime.activePeerId) ||
    (!!peer.pendingConnection &&
      peer.pendingConnection.connectionId !== runtime.activeConnectionId),
  fn: ({ peer }, { ctx }) => ({
    ctx,
    connection: peer.pendingConnection ?? {
      transport: "webrtc",
      peerId: peer.pendingPeerId as string,
    },
  }),
  target: effectConnectPeer,
});

sample({
  clock: effectConnectPeer.doneData,
  target: peerConnected,
});
