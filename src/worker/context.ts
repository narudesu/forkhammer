import createDebug from "debug";
import { createClient } from "@supabase/supabase-js";
import { runIssueValidation } from "../commands/new";
import { login } from "./auth";
import { emitEvent } from "./event-emitter";
import type { SupabaseConfig, SupabaseClientLike } from "./types";

export type ExecutionContext = {
  config: SupabaseConfig;
  supabase: {
    client: SupabaseClientLike;
    setAccessToken: (token: string) => void;
  };
  auth: {
    login: () => Promise<string>;
  };
  validation: {
    runIssueValidation: (input: { key: string }) => Promise<void>;
  };
  runtime: {
    sleep: (ms: number) => Promise<void>;
    fetch: typeof fetch;
  };
  log: {
    debug: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
};

export function createExecutionContext(
  config: SupabaseConfig,
): ExecutionContext {
  const debug = createDebug("app:supabase-worker");
  let workerAccessToken: string | null = null;

  const client = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: false,
    },
    accessToken: async () => workerAccessToken,
  }) as unknown as SupabaseClientLike;

  const ctx: ExecutionContext = {
    config,
    supabase: {
      client,
      setAccessToken: (token) => {
        workerAccessToken = token;
        client.realtime.setAuth(token);
      },
    },
    auth: {
      login: () => login(config, fetch),
    },
    validation: {
      runIssueValidation: async (input) => {
        await runIssueValidation({
          key: input.key,
          streamEvents: false,
          hooks: {
            onStarted: async (payload) => {
              await emitEvent(
                config,
                client,
                "validate_issue_started",
                payload,
              );
            },
            onSucceeded: async (payload) => {
              await emitEvent(config, client, "issue_validated", payload);
            },
            onFailed: async (payload) => {
              await emitEvent(
                config,
                client,
                "issue_validation_failed",
                payload,
              );
            },
          },
        });
      },
    },
    runtime: {
      sleep,
      fetch,
    },
    log: {
      debug,
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args),
    },
  };

  return ctx;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
