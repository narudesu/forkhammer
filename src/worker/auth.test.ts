import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { login } from "./auth";

describe("worker auth", () => {
  it("logs in with password auth and returns the access token", async () => {
    const calls: Array<{ input: string; init: RequestInit | undefined }> = [];

    const token = await login(
      {
        url: "https://example.supabase.co",
        anonKey: "anon",
        table: "ultrafeed_item",
        auth: {
          type: "password",
          email: "dev@example.com",
          password: "secret",
        },
      },
      async (input, init) => {
        calls.push({ input: String(input), init });
        return new Response(
          JSON.stringify({
            access_token: "password-token",
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: "refresh-token",
            user: {
              id: "user-1",
              email: "dev@example.com",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    );

    assert.equal(token, "password-token");
    assert.ok(calls.length > 0);
    assert.match(calls[0].input, /\/auth\/v1\//);
  });

  it("logs in with secret string exchange using the configured function url", async () => {
    const calls: Array<{ input: string; init: RequestInit | undefined }> = [];

    const token = await login(
      {
        url: "https://example.supabase.co",
        anonKey: "anon",
        table: "ultrafeed_item",
        auth: {
          type: "secret_string",
          secretString: "secret",
          functionUrl: "https://auth.example.com/worker-token",
        },
      },
      async (input, init) => {
        calls.push({ input: String(input), init });
        return new Response(JSON.stringify({ token: "exchange-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );

    assert.equal(token, "exchange-token");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, "https://auth.example.com/worker-token");
  });
});
