import { describe, expect, test } from "bun:test";
import { buildHealthchecksArtifact } from "./healthcheck-artifact";

describe("healthcheck artifact", () => {
  test("captures successful response status, timing, and full body", async () => {
    const result = await buildHealthchecksArtifact({
      config: {
        app: { name: "App", url: "https://app.example.com/health" },
      },
      now: () => 1234,
      fetch: async () => new Response("healthy body", { status: 200 }),
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "app",
        name: "App",
        statusCode: 200,
        healthy: true,
        checkedAt: new Date(1234).toISOString(),
        responseBody: "healthy body",
      }),
    ]);
    expect(result[0]?.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  test("represents transport failures as failed status zero entries", async () => {
    const result = await buildHealthchecksArtifact({
      config: {
        app: { name: "App", url: "https://app.example.com/health" },
      },
      fetch: async () => {
        throw new Error("connection refused");
      },
    });

    expect(result[0]).toMatchObject({
      statusCode: 0,
      healthy: false,
      responseBody: "connection refused",
    });
  });
});
