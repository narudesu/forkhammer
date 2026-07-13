import debug from "debug";
import { JSONRPCClient, JSONRPCServer } from "json-rpc-2.0";
import Peer, { type DataConnection } from "peerjs";
import {
  PeerResolverMethod,
  type PeerResolverTarget,
  type SessionEvent,
} from "src/peer-protocol/peer-protocol";

const log = debug("app:peer");

type JsonRpcPayload = Record<string, unknown> | Array<Record<string, unknown>>;

export interface PeerClient {
  connect(peerId: string): void;
  disconnect(): void;
  request<T = unknown>(method: string, params?: unknown): Promise<T>;
  registerTarget(target: PeerResolverTarget): void;
  onSessionEvent(handler: (event: SessionEvent) => void): void;
  onDisconnect(handler: () => void): void;
}

export function createPeerClient(options?: {
  peer?: Peer;
  createPeer?: () => Peer;
}): PeerClient {
  let peerInstance: Peer | null = options?.peer ?? null;
  let peerEventsBound = false;
  const createPeer = options?.createPeer ?? createPeerInstance;
  let activeConnection: DataConnection | null = null;
  const disconnectHandlers: Array<() => void> = [];
  const sessionEventHandlers: Array<(event: SessionEvent) => void> = [];
  let pendingPeerId: string | null = null;
  let rpcClient: JSONRPCClient<void> | null = null;
  const rpcServer = new JSONRPCServer();
  let registeredTarget: PeerResolverTarget | null = null;

  bindPeerEvents();

  function initPeerClient(): void {
    if (!peerInstance) peerInstance = createPeer();
    bindPeerEvents();
  }

  function bindPeerEvents(): void {
    if (!peerInstance || peerEventsBound) return;
    if (typeof (peerInstance as { on?: unknown }).on !== "function") return;

    peerEventsBound = true;
    const on = (
      peerInstance as unknown as {
        on: (event: string, handler: (...args: unknown[]) => void) => void;
      }
    ).on;

    on.call(peerInstance, "open", () => {
      if (!pendingPeerId) return;
      const peerId = pendingPeerId;
      pendingPeerId = null;
      establishConnection(peerId);
    });
    on.call(peerInstance, "connection", (conn) => {
      handleConnection(conn as DataConnection);
    });
    on.call(peerInstance, "error", (error) =>
      log("peer error", formatPeerError(error)),
    );
    on.call(peerInstance, "disconnected", () => log("peer disconnected"));
    on.call(peerInstance, "close", () => log("peer close"));
  }

  function handleConnection(conn: DataConnection): void {
    activeConnection = conn;
    conn.on("open", () => {
      log("connection open");
      conn.on("data", (message) => {
        void handleRpcPayload(message);
      });
    });
    conn.on("close", () => {
      if (activeConnection !== conn) return;
      activeConnection = null;
      registeredTarget?.dispose();
      rpcClient?.rejectAllPendingRequests("peer disconnected");
      for (const handler of disconnectHandlers) handler();
    });
  }

  async function handleRpcPayload(payload: unknown): Promise<void> {
    if (!isJsonRpcPayload(payload)) return;
    const item = Array.isArray(payload) ? payload[0] : payload;
    if (item && "method" in item) {
      if (item.method === PeerResolverMethod.sessionEvent) {
        for (const handler of sessionEventHandlers)
          handler(item.params as SessionEvent);
        return;
      }
      const response = await rpcServer.receive(payload as never);
      if (response != null) send(response);
      return;
    }
    rpcClient?.receive(payload as never);
  }

  function connect(peerId: string): void {
    initPeerClient();
    pendingPeerId = peerId;
    if (activeConnection) activeConnection.close();
    if (!isPeerOpen(peerInstance)) return;
    pendingPeerId = null;
    establishConnection(peerId);
  }

  function establishConnection(peerId: string): void {
    const conn = peerInstance?.connect(peerId);
    if (!conn) {
      pendingPeerId = peerId;
      return;
    }
    handleConnection(conn);
  }

  function disconnect(): void {
    activeConnection?.close();
    registeredTarget?.dispose();
    activeConnection = null;
    rpcClient?.rejectAllPendingRequests("peer disconnected");
  }

  function send(payload: unknown): void {
    if (activeConnection?.open) activeConnection.send(payload);
  }

  function request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!rpcClient) {
      rpcClient = new JSONRPCClient<void>((payload) => {
        send(payload);
      });
    }
    return Promise.resolve(
      rpcClient.request(method, params as never),
    ) as Promise<T>;
  }

  function registerTarget(target: PeerResolverTarget): void {
    registeredTarget = target;
    rpcServer.addMethod(PeerResolverMethod.getConfig, () => target.getConfig());
    rpcServer.addMethod(PeerResolverMethod.listWorktrees, (params) =>
      target.listWorktrees(params as never),
    );
    rpcServer.addMethod(PeerResolverMethod.listSessions, (params) =>
      target.listSessions(params as never),
    );
    rpcServer.addMethod(
      PeerResolverMethod.listRecentProjectSessions,
      (params) => target.listRecentProjectSessions(params as never),
    );
    rpcServer.addMethod(PeerResolverMethod.getSession, (params) =>
      target.getSession(params as never),
    );
    rpcServer.addMethod(PeerResolverMethod.createWorktree, (params) =>
      target.createWorktree(params as never),
    );
    rpcServer.addMethod(PeerResolverMethod.createSession, (params) =>
      target.createSession(params as never),
    );
    rpcServer.addMethod(PeerResolverMethod.subscribeSession, (params) =>
      target.subscribeSession(params as never, (event) =>
        send({
          jsonrpc: "2.0",
          method: PeerResolverMethod.sessionEvent,
          params: event,
        }),
      ),
    );
    rpcServer.addMethod(PeerResolverMethod.unsubscribeSession, (params) =>
      target.unsubscribeSession(params as never),
    );
    rpcServer.addMethod(PeerResolverMethod.archiveSession, (params) =>
      target.archiveSession(params as never),
    );
    rpcServer.addMethod(PeerResolverMethod.promptSession, (params) =>
      target.promptSession(params as never),
    );
  }

  function onSessionEvent(handler: (event: SessionEvent) => void): void {
    sessionEventHandlers.push(handler);
  }

  function onDisconnect(handler: () => void): void {
    disconnectHandlers.push(handler);
  }

  return {
    connect,
    disconnect,
    request,
    registerTarget,
    onSessionEvent,
    onDisconnect,
  };
}

function isJsonRpcPayload(payload: unknown): payload is JsonRpcPayload {
  if (!payload || typeof payload !== "object") return false;
  if (Array.isArray(payload)) return payload.every(isJsonRpcPayload);
  return "jsonrpc" in payload;
}

function isPeerOpen(peerInstance: Peer | null): boolean {
  if (!peerInstance) return false;
  if (typeof (peerInstance as { open?: unknown }).open === "boolean") {
    return (peerInstance as { open: boolean }).open;
  }
  return true;
}

function createPeerInstance(): Peer {
  return new Peer();
}

function formatPeerError(error: unknown): Record<string, unknown> {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return { type: record.type, message: record.message };
  }
  return { message: String(error) };
}
