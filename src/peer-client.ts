import debug from "debug";
import Peer, { type DataConnection } from "peerjs";
import type {
  MessageHandlerRegistry,
  PeerMessage,
  WorktreeInfo,
} from "src/peer-protocol";

export type WorktreeLister = () => Promise<WorktreeInfo[]>;

const log = debug("app:peer");

export interface PeerClient {
  connect(peerId: string): void;
  disconnect(): void;
  send(msg: PeerMessage): void;
  onDisconnect(handler: () => void): void;
  register(
    type: PeerMessage["type"],
    handler: (msg: PeerMessage) => void,
  ): void;
}

export function createPeerClient(options?: {
  peer?: Peer;
  createPeer?: () => Peer;
}): PeerClient {
  let peerInstance: Peer | null = options?.peer ?? null;
  let peerEventsBound = false;
  const createPeer = options?.createPeer ?? createPeerInstance;
  let activeConnection: DataConnection | null = null;
  let messageHandlers: MessageHandlerRegistry = {};
  const disconnectHandlers: Array<() => void> = [];
  let pendingPeerId: string | null = null;

  bindPeerEvents();

  function initPeerClient(): void {
    if (!peerInstance) {
      peerInstance = createPeer();
    }

    bindPeerEvents();
  }

  function bindPeerEvents(): void {
    if (!peerInstance || peerEventsBound) {
      return;
    }

    if (typeof (peerInstance as { on?: unknown }).on !== "function") {
      return;
    }

    log("binding peer events");

    peerEventsBound = true;
    const on = (
      peerInstance as {
        on: (event: string, handler: (...args: unknown[]) => void) => void;
      }
    ).on;

    on.call(peerInstance, "open", () => {
      log("peer open", { pendingPeerId });
      if (!pendingPeerId) {
        return;
      }

      const peerId = pendingPeerId;
      pendingPeerId = null;
      void connect(peerId);
    });
    on.call(peerInstance, "error", (error) => {
      log("peer error", formatPeerError(error));
    });
    on.call(peerInstance, "disconnected", () => {
      log("peer disconnected");
    });
    on.call(peerInstance, "close", () => {
      log("peer close");
    });
  }

  function handleIncomingMessage(msg: PeerMessage): void {
    messageHandlers[msg.type]?.(msg);
  }

  function handleConnectionOpen(conn: DataConnection): void {
    log("connection open");

    conn.on("data", (message) => {
      handleIncomingMessage(message as PeerMessage);
    });

    conn.on("close", () => {
      log("connection close");
      if (activeConnection === conn) {
        activeConnection = null;
        for (const handler of disconnectHandlers) {
          handler();
        }
      }
    });
  }

  function connect(peerId: string): void {
    log("running connect in client", { peerId });
    if (!peerInstance) {
      initPeerClient();
    }

    pendingPeerId = peerId;

    if (activeConnection) {
      log("has active connection, closing it");
      activeConnection.close();
      activeConnection = null;
    }

    if (!isPeerOpen(peerInstance)) {
      log("peer is not open, returning");
      return;
    }

    log("peer is open, establishing");
    establishConnection(peerId);
  }

  function establishConnection(peerId: string): void {
    const conn = peerInstance?.connect(peerId);
    log("establishing connection", { peerId });
    if (!conn) {
      pendingPeerId = peerId;
      return;
    }

    activeConnection = conn;

    conn.on("open", () => handleConnectionOpen(conn));
  }

  function disconnect(): void {
    if (activeConnection) {
      activeConnection.close();
      activeConnection = null;
    }
  }

  function send(msg: PeerMessage): void {
    if (!activeConnection?.open) {
      return;
    }
    activeConnection.send(msg);
  }

  function register(
    type: PeerMessage["type"],
    handler: (msg: PeerMessage) => void,
  ): void {
    messageHandlers = { ...messageHandlers, [type]: handler };
  }

  function onDisconnect(handler: () => void): void {
    disconnectHandlers.push(handler);
  }

  return {
    connect,
    disconnect,
    send,
    onDisconnect,
    register,
  };
}

function isPeerOpen(peerInstance: Peer | null): boolean {
  if (!peerInstance) {
    return false;
  }

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
    return {
      type: record.type,
      message: record.message,
    };
  }

  return { message: String(error) };
}
