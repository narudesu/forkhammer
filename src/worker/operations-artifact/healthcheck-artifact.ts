import type { Config } from "../../config/config";
import type { HealthchecksArtifact } from "./operations-artifact-protocol";

type HealthcheckConfig = NonNullable<Config["healthchecks"]>;

export async function buildHealthchecksArtifact(opts: {
  config: HealthcheckConfig;
  fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  now?: () => number;
}): Promise<HealthchecksArtifact> {
  const request = opts.fetch ?? fetch;
  const now = opts.now ?? (() => Date.now());
  return Promise.all(
    Object.entries(opts.config).map(async ([id, healthcheck]) => {
      const startedAt = now();
      const checkedAt = new Date(startedAt).toISOString();
      try {
        const response = await request(healthcheck.url);
        const responseBody = await response.text();
        const responseTimeMs = Math.max(0, now() - startedAt);
        return {
          id,
          name: healthcheck.name,
          url: healthcheck.url,
          statusCode: response.status,
          healthy: response.status === 200,
          responseTimeMs,
          checkedAt,
          responseBody,
        };
      } catch (error) {
        return {
          id,
          name: healthcheck.name,
          url: healthcheck.url,
          statusCode: 0,
          healthy: false,
          responseTimeMs: Math.max(0, now() - startedAt),
          checkedAt,
          responseBody: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}
