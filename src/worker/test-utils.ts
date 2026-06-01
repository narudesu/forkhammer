import type { ExecutionContext } from "./context";

type Overrides = {
  config?: Partial<ExecutionContext["config"]>;
  jira?: ExecutionContext["jira"];
  supabase?: Partial<ExecutionContext["supabase"]>;
  runtime?: Partial<ExecutionContext["runtime"]>;
  log?: Partial<ExecutionContext["log"]>;
  auth?: Partial<ExecutionContext["auth"]>;
  validation?: Partial<ExecutionContext["validation"]>;
};

export function createTestExecutionContext(
  calls: string[] = [],
  overrides: Overrides = {},
): ExecutionContext {
  const base: ExecutionContext = {
    config: {
      url: "https://example.supabase.co",
      anonKey: "anon",
      table: "ultrafeed_item",
      auth: {
        type: "secret_string",
        secretString: "secret",
        functionUrl:
          "https://example.supabase.co/functions/v1/generate-worker-token",
      },
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
              order: () => query,
              limit: async () => ({ data: [], error: null }),
            };

            return query;
          },
          insert: async () => ({ error: null }),
        }),
      },
      setAccessToken: () => {},
      getUserId: async () => "user-1",
    },
    auth: {
      login: async () => "token",
    },
    validation: {
      runIssueValidation: async ({ key }: { key: string }) => {
        calls.push(`runIssueValidation:${key}`);
      },
      runIssuePrompt: async ({ issueKey }: { issueKey: string }) => {
        calls.push(`runIssuePrompt:${issueKey}`);
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
