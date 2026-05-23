import type { ExecutionContext } from "./context";

type Overrides = Partial<ExecutionContext>;

export function createTestExecutionContext(
  calls: string[] = [],
  overrides: Overrides = {},
): ExecutionContext {
  const base: ExecutionContext = {
    config: {
      url: "https://example.supabase.co",
      anonKey: "anon",
      secretString: "secret",
      table: "ultrafeed_item",
    },
    supabase: {
      client: {
        realtime: { setAuth: () => {} },
        channel: () => ({
          on: () => ({
            on: () => {
              throw new Error("not used");
            },
            subscribe: () => {},
            unsubscribe: async () => {},
          }),
          subscribe: () => {},
          unsubscribe: async () => {},
        }),
        from: () => ({
          select: () => {
            const query = {
              gte: () => query,
              order: async () => ({ data: [], error: null }),
            };

            return query;
          },
          insert: async () => ({ error: null }),
        }),
      },
      setAccessToken: () => {},
    },
    auth: {
      login: async () => "token",
    },
    validation: {
      runIssueValidation: async ({ key }: { key: string }) => {
        calls.push(`runIssueValidation:${key}`);
      },
    },
    runtime: {
      sleep: async () => {},
      fetch,
    },
    log: {
      debug: () => {},
      warn: () => {},
      error: () => {},
    },
  };

  return {
    ...base,
    ...overrides,
    config: { ...base.config, ...overrides.config },
    supabase: { ...base.supabase, ...overrides.supabase },
    auth: { ...base.auth, ...overrides.auth },
    validation: { ...base.validation, ...overrides.validation },
    runtime: { ...base.runtime, ...overrides.runtime },
    log: { ...base.log, ...overrides.log },
  };
}
