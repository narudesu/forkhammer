import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPeerMessage,
  createMessageHandlerRegistry,
  registerHandler,
  applyHandlers,
} from "./peer-protocol";
import type { PeerMessage } from "./peer-protocol";

describe("peer-protocol", () => {
  describe("createMessageHandlerRegistry", () => {
    it("creates empty registry", () => {
      const registry = createMessageHandlerRegistry({});
      assert.deepEqual(Object.keys(registry), []);
    });

    it("creates registry with initial handlers", () => {
      const handler = () => {};
      const registry = createMessageHandlerRegistry({
        "worktree.list": handler,
      });
      assert.equal(registry["worktree.list"], handler);
    });

    it("returns new registry instance", () => {
      const registry = createMessageHandlerRegistry({});
      const registry2 = createMessageHandlerRegistry({});
      assert.notEqual(registry, registry2);
    });
  });

  describe("registerHandler", () => {
    it("registers a handler", () => {
      const registry = createMessageHandlerRegistry({});
      const handler = () => {};
      const registry2 = registerHandler(registry, "worktree.list", handler);
      assert.equal(registry2["worktree.list"], handler);
      assert.equal(registry["worktree.list"], undefined);
    });

    it("overwrites existing handler", () => {
      const handler1 = () => {};
      const handler2 = () => {};
      const registry = createMessageHandlerRegistry({
        "worktree.list": handler1,
      });
      const registry2 = registerHandler(registry, "worktree.list", handler2);
      assert.equal(registry2["worktree.list"], handler2);
    });
  });

  describe("applyHandlers", () => {
    it("calls handler for matching message type", () => {
      const calls: PeerMessage[] = [];
      const registry = createMessageHandlerRegistry({
        "worktree.list": (msg) => calls.push(msg),
      });
      const msg = createPeerMessage("worktree.list", "1", {});
      const result = applyHandlers(registry, msg);
      assert.equal(result, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0], msg);
    });

    it("returns false when no handler matches", () => {
      const calls: PeerMessage[] = [];
      const registry = createMessageHandlerRegistry({
        "worktree.list": (msg) => calls.push(msg),
      });
      const msg = createPeerMessage("error", "1", { message: "oops" });
      const result = applyHandlers(registry, msg);
      assert.equal(result, false);
      assert.equal(calls.length, 0);
    });

    it("calls only matching handler", () => {
      const listCalls: PeerMessage[] = [];
      const errorCalls: PeerMessage[] = [];
      const registry = createMessageHandlerRegistry({
        "worktree.list": (msg) => listCalls.push(msg),
        error: (msg) => errorCalls.push(msg),
      });
      const msg = createPeerMessage("worktree.list", "1", {});
      applyHandlers(registry, msg);
      assert.equal(listCalls.length, 1);
      assert.equal(errorCalls.length, 0);
    });
  });

  describe("createPeerMessage", () => {
    it("creates worktree.list message", () => {
      const msg = createPeerMessage("worktree.list", "id-123", {});
      assert.equal(msg.id, "id-123");
      assert.equal(msg.type, "worktree.list");
    });

    it("creates worktree.list_response message", () => {
      const worktrees = [{ path: "/foo", branch: "main" }];
      const msg = createPeerMessage("worktree.list_response", "id-123", {
        worktrees,
      });
      assert.equal(msg.id, "id-123");
      assert.equal(msg.type, "worktree.list_response");
      assert.deepEqual(msg.worktrees, worktrees);
    });

    it("creates error message", () => {
      const msg = createPeerMessage("error", "id-123", {
        message: "something went wrong",
      });
      assert.equal(msg.id, "id-123");
      assert.equal(msg.type, "error");
      assert.equal(msg.message, "something went wrong");
    });

    it("creates peer.disconnected message", () => {
      const msg = createPeerMessage("peer.disconnected", "id-123", {});
      assert.equal(msg.id, "id-123");
      assert.equal(msg.type, "peer.disconnected");
    });
  });
});
