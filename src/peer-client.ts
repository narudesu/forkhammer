import Peer, { type DataConnection } from "peerjs";
import type {
  PeerMessage,
  WorktreeInfo,
  MessageHandlerRegistry,
} from "./peer-protocol";
import {
  applyHandlers,
  createMessageHandlerRegistry,
  registerHandler,
} from "./peer-protocol";
import debug from "debug";

export type WorktreeLister = () => Promise<WorktreeInfo[]>;

const log = debug("app:peer");

export interface PeerClient {
  connect(peerId: string): void;
  disconnect(): void;
  send(msg: PeerMessage): void;
  onMessage(handler: (msg: PeerMessage) => void): void;
  onDisconnect(handler: () => void): void;
}

export function createPeerClient(options?: {
  peer?: Peer;
  createPeer?: () => Peer;
  listWorktrees?: WorktreeLister;
}): PeerClient {
  let peerInstance: Peer | null = options?.peer ?? null;
  let peerEventsBound = false;
  const createPeer = options?.createPeer ?? createPeerInstance;
  let listWorktrees: WorktreeLister =
    options?.listWorktrees ?? defaultListWorktrees;
  let activeConnection: DataConnection | null = null;
  let messageHandlers: MessageHandlerRegistry = createMessageHandlerRegistry(
    {},
  );
  let disconnectHandlers: Array<() => void> = [];
  let browserPeerId: string | null = null;
  let pendingPeerId: string | null = null;
  let messageHandler: ((msg: PeerMessage) => void) | null = null;

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
    applyHandlers(messageHandlers, msg);
    if (messageHandler) {
      messageHandler(msg);
    }
  }

  function handleConnectionOpen(conn: DataConnection): void {
    log("connection open");
    conn.on("data", handleIncomingMessage);

    conn.on("close", () => {
      log("connection close");
      if (activeConnection === conn) {
        activeConnection = null;
        browserPeerId = null;
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

    browserPeerId = peerId;

    if (!isPeerOpen(peerInstance)) {
      log("peer is not open, returning");
      return;
    }

    log("peer is open, establishing");
    establishConnection(peerId);
  }

  function establishConnection(peerId: string): void {
    const conn = peerInstance!.connect(peerId);
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
      browserPeerId = null;
    }
  }

  function send(msg: PeerMessage): void {
    if (!activeConnection || !activeConnection.open) {
      return;
    }
    activeConnection.send(msg);
  }

  function register(
    type: PeerMessage["type"],
    handler: (msg: PeerMessage) => void,
  ): void {
    messageHandlers = registerHandler(messageHandlers, type, handler);
  }

  function onMessage(handler: (msg: PeerMessage) => void): void {
    messageHandler = handler;
  }

  function onDisconnect(handler: () => void): void {
    disconnectHandlers.push(handler);
  }

  async function handleWorktreeList(
    msg: PeerMessage,
    sendResponse: (msg: PeerMessage) => void,
  ): Promise<void> {
    if (msg.type !== "worktree.list") {
      return;
    }
    try {
      const worktrees = await listWorktrees();
      sendResponse({
        id: msg.id,
        type: "worktree.list_response",
        worktrees,
      });
    } catch (error) {
      sendResponse({
        id: msg.id,
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  register("worktree.list", (msg) => {
    handleWorktreeList(msg, send);
  });

  return {
    connect,
    disconnect,
    send,
    onMessage,
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

export async function defaultListWorktrees(): Promise<WorktreeInfo[]> {
  const { createOpencodeClient } = await import("@opencode-ai/sdk/v2");
  const { unwrapOpencodeData } = await import("./opencode");
  const client = createOpencodeClient({
    baseUrl: "http://localhost:8000",
  });
  const worktrees = await client.worktree.list().then(unwrapOpencodeData);
  return worktrees.map((wt) => {
    if (typeof wt === "string") {
      return { path: wt, branch: wt };
    }
    const record = wt as Record<string, unknown>;
    return {
      path: (record.directory as string) ?? (wt as string),
      branch: (record.branch as string) ?? (wt as string),
      name: record.name as string | undefined,
    };
  });
}

export { createMessageHandlerRegistry, registerHandler, applyHandlers };
