import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPeerClient } from "./peer-client";
import { createMessageHandlerRegistry, registerHandler } from "./peer-protocol";
import type { PeerMessage } from "./peer-protocol";

type MockDataConnection = {
  open: boolean;
  send: (data: unknown) => void;
  close: () => void;
  on: (event: string, handler: unknown) => void;
  removeAllListeners: () => void;
};

function createMockPeer(): {
  connections: Map<string, MockDataConnection>;
  peer: { connect: (peerId: string) => MockDataConnection };
} {
  const connections = new Map<string, MockDataConnection>();

  const peer = {
    connect: (peerId: string) => {
      if (connections.has(peerId)) {
        return connections.get(peerId)!;
      }

      let dataHandler: ((data: PeerMessage) => void) | null = null;
      let closeHandler: (() => void) | null = null;
      let openHandler: ((conn: MockDataConnection) => void) | null = null;

      const connection: MockDataConnection = {
        open: true,
        send: (data: unknown) => {
          if (dataHandler) {
            dataHandler(data as PeerMessage);
          }
        },
        close: () => {
          if (closeHandler) closeHandler();
        },
        on: (event: string, handler: unknown) => {
          if (event === "data") {
            dataHandler = handler as (data: PeerMessage) => void;
          } else if (event === "close") {
            closeHandler = handler as () => void;
          } else if (event === "open") {
            openHandler = handler as (conn: MockDataConnection) => void;
            openHandler!(connection);
          }
        },
        removeAllListeners: () => {
          dataHandler = null;
          closeHandler = null;
        },
      };

      connections.set(peerId, connection);
      return connection;
    },
  };

  return { connections, peer };
}

function createDelayedOpenPeer(): {
  peer: {
    open: boolean;
    on: (event: string, handler: unknown) => void;
    connect: (peerId: string) => MockDataConnection | undefined;
    emitOpen: () => void;
  };
  connectCalls: string[];
} {
  const connectCalls: string[] = [];
  const connections = new Map<string, MockDataConnection>();
  let openHandler: (() => void) | null = null;

  const peer = {
    open: false,
    on: (event: string, handler: unknown) => {
      if (event === "open") {
        openHandler = handler as () => void;
      }
    },
    connect: (peerId: string) => {
      connectCalls.push(peerId);
      if (connections.has(peerId)) {
        return connections.get(peerId)!;
      }

      const connection: MockDataConnection = {
        open: true,
        send: () => {},
        close: () => {},
        on: () => {},
        removeAllListeners: () => {},
      };

      connections.set(peerId, connection);
      return connection;
    },
    emitOpen: () => {
      peer.open = true;
      openHandler?.();
    },
  };

  return { peer, connectCalls };
}

describe("peer-client", () => {
  describe("PeerClient interface", () => {
    it("can be created with no arguments", () => {
      const client = createPeerClient();
      assert.ok(client);
      assert.equal(typeof client.connect, "function");
      assert.equal(typeof client.disconnect, "function");
      assert.equal(typeof client.send, "function");
      assert.equal(typeof client.onMessage, "function");
      assert.equal(typeof client.onDisconnect, "function");
      assert.equal(typeof client.register, "function");
    });

    it("send does not throw when no active connection", () => {
      const client = createPeerClient({ peer: null as never });
      client.send({ id: "1", type: "worktree.list" });
    });

    it("installs WebRTC globals before creating the PeerJS instance", () => {
      const scope = globalThis as typeof globalThis & {
        RTCPeerConnection?: unknown;
        RTCIceCandidate?: unknown;
        RTCSessionDescription?: unknown;
      };
      const originalRTCPeerConnection = scope.RTCPeerConnection;
      const originalRTCIceCandidate = scope.RTCIceCandidate;
      const originalRTCSessionDescription = scope.RTCSessionDescription;

      try {
        delete scope.RTCPeerConnection;
        delete scope.RTCIceCandidate;
        delete scope.RTCSessionDescription;

        const { peer } = createMockPeer();
        const client = createPeerClient({
          createPeer: () => {
            assert.equal(typeof scope.RTCPeerConnection, "function");
            assert.equal(typeof scope.RTCIceCandidate, "function");
            assert.equal(typeof scope.RTCSessionDescription, "function");
            return peer as never;
          },
        });

        client.connect("peer-123");
      } finally {
        scope.RTCPeerConnection = originalRTCPeerConnection;
        scope.RTCIceCandidate = originalRTCIceCandidate;
        scope.RTCSessionDescription = originalRTCSessionDescription;
      }
    });
  });

  describe("send", () => {
    it("does not throw when connection is closed", () => {
      const client = createPeerClient({ peer: null as never });
      client.send({ id: "1", type: "worktree.list" });
    });
  });

  describe("onDisconnect", () => {
    it("registers multiple disconnect handlers without error", () => {
      const client = createPeerClient({ peer: null as never });
      client.onDisconnect(() => {});
      client.onDisconnect(() => {});
    });
  });

  describe("register", () => {
    it("handler is called for registered message type", async () => {
      const { connections, peer } = createMockPeer();
      const client = createPeerClient({ peer: peer as never });
      client.connect("peer-123");

      const conn = connections.get("peer-123")!;
      const received: PeerMessage[] = [];
      client.register("worktree.list", (msg) => received.push(msg));

      const msg = { id: "test", type: "worktree.list" as const };
      conn.send(msg);

      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(received.length, 1);
      assert.equal(received[0].id, "test");
    });

    it("does not call handler for non-matching message type", async () => {
      const { connections, peer } = createMockPeer();
      const client = createPeerClient({ peer: peer as never });
      client.connect("peer-123");

      const conn = connections.get("peer-123")!;
      const received: PeerMessage[] = [];
      client.register("worktree.list", (msg) => received.push(msg));

      const msg = { id: "test", type: "error" as const, message: "oops" };
      conn.send(msg);

      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(received.length, 0);
    });

    it("waits for peer open before connecting", () => {
      const { peer, connectCalls } = createDelayedOpenPeer();
      const client = createPeerClient({ peer: peer as never });

      client.connect("peer-123");
      assert.equal(connectCalls.length, 0);

      peer.emitOpen();
      assert.deepEqual(connectCalls, ["peer-123"]);
    });
  });

  describe("MessageHandlerRegistry utilities", () => {
    it("createMessageHandlerRegistry creates empty registry", () => {
      const registry = createMessageHandlerRegistry({});
      assert.deepEqual(Object.keys(registry), []);
    });

    it("registerHandler adds handler to new registry", () => {
      const registry = createMessageHandlerRegistry({});
      const handler = (msg: PeerMessage) => {};
      const registry2 = registerHandler(registry, "worktree.list", handler);
      assert.notEqual(registry, registry2);
      assert.equal(registry2["worktree.list"], handler);
      assert.equal(registry["worktree.list"], undefined);
    });
  });
});
