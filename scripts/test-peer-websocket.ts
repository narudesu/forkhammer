const timeoutMs = 10_000;
const requestId = "forkhammer-websocket-smoke-test";

async function main() {
  const input = Bun.argv[2];
  if (!input) {
    throw new Error(
      "Usage: bun run scripts/test-peer-websocket.ts <ws[s]://host/peer?token=...>",
    );
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid WebSocket URL");
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("URL must use ws:// or wss://");
  }
  if (!url.searchParams.get("token")) {
    throw new Error("URL must include the one-time token query parameter");
  }

  await testConnection(url.toString());
  console.log(
    `WebSocket connection OK (${url.protocol}//${url.host}${url.pathname})`,
  );
}

function testConnection(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    const timeout = setTimeout(
      () => finish(new Error("Timed out waiting for JSON-RPC response")),
      timeoutMs,
    );

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      if (error) reject(error);
      else resolve();
    }

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method: "get-config",
        }),
      );
    });

    socket.addEventListener("message", (event) => {
      let response: unknown;
      try {
        response = JSON.parse(String(event.data));
      } catch {
        finish(new Error("Server returned invalid JSON"));
        return;
      }

      if (!response || typeof response !== "object") {
        finish(new Error("Server returned an invalid JSON-RPC response"));
        return;
      }
      const message = response as {
        id?: unknown;
        result?: unknown;
        error?: { message?: string };
      };
      if (message.id !== requestId) return;
      if (message.error) {
        finish(
          new Error(
            `JSON-RPC error: ${message.error.message ?? "unknown error"}`,
          ),
        );
        return;
      }
      if (!message.result || typeof message.result !== "object") {
        finish(new Error("Server response did not include a result"));
        return;
      }
      finish();
    });

    socket.addEventListener("error", () => {
      finish(
        new Error(
          "WebSocket connection failed (check URL, token, port, and TLS)",
        ),
      );
    });
    socket.addEventListener("close", (event) => {
      if (!settled) {
        finish(
          new Error(`WebSocket closed before responding (code ${event.code})`),
        );
      }
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
