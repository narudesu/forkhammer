import { randomBytes } from "node:crypto";
import {
  createPeerResolverTarget,
  PeerResolver,
} from "src/peer-protocol/peer-resolver";
import type { WorkerContext } from "src/worker/context/types";

export async function startPeerWebSocketServer(ctx: WorkerContext) {
  const port = ctx.workerConfig.worker.peer.websocket.port;
  let activeToken: string | null = null;
  PeerResolver.register(ctx, createPeerResolverTarget(ctx));

  async function issueToken() {
    const token = randomBytes(32).toString("hex");
    await ctx.writer.write({
      eventType: "browser_websocket_token_issued",
      data: { token, port },
    });
    activeToken = token;
  }

  const server = Bun.serve<{
    messageHandlers: Array<(message: string) => void>;
    closeHandlers: Array<() => void>;
  }>({
    port,
    fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname !== "/peer")
        return new Response("Not found", { status: 404 });
      if (!activeToken || url.searchParams.get("token") !== activeToken) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (
        !server.upgrade(request, {
          data: { messageHandlers: [], closeHandlers: [] },
        })
      ) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      // Consume the token on the first successful upgrade.
      activeToken = null;
      return undefined;
    },
    websocket: {
      open(socket) {
        ctx.peerClient.acceptWebSocket({
          send: (message) => socket.send(message),
          close: () => socket.close(),
          onMessage: (handler) => socket.data.messageHandlers.push(handler),
          onClose: (handler) => socket.data.closeHandlers.push(handler),
        });
      },
      message(socket, message) {
        for (const handler of socket.data.messageHandlers)
          handler(String(message));
      },
      close(socket) {
        for (const handler of socket.data.closeHandlers) handler();
        void issueToken().catch((error: unknown) => {
          ctx.log.error(
            "failed to issue peer websocket token after disconnect",
            error,
          );
        });
      },
    },
  });

  try {
    await issueToken();
  } catch (error) {
    server.stop(true);
    throw error;
  }
  ctx.log.debug("peer websocket server listening on port %d", port);
  return server;
}
