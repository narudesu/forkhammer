import createDebug from "debug";
import { createClient } from "@supabase/supabase-js";
import { runIssuePrompt, runIssueValidation } from "../commands/new";
import type { Config } from "../config";
import { login } from "./auth";
import { emitEvent } from "./event-emitter";
import type { SupabaseConfig, SupabaseClientLike } from "./types";

export type ExecutionContext = {
  config: SupabaseConfig;
  jira?: Config["jira"];
  supabase: {
    client: SupabaseClientLike;
    setAccessToken: (token: string) => void;
    getUserId: () => Promise<string>;
  };
  auth: {
    login: () => Promise<string>;
  };
  validation: {
    runIssueValidation: (input: { key: string }) => Promise<void>;
    runIssuePrompt: (input: {
      issueKey: string;
      requestEventId: string;
      prompt: string;
      projectKey: string;
      projectName: string;
      projectId: string;
      sessionId: string;
      worktreeName: string;
      worktreeBranch: string;
      worktreeDirectory: string;
    }) => Promise<void>;
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

export function createExecutionContext(workerConfig: {
  supabase: SupabaseConfig;
  jira?: Config["jira"];
}): ExecutionContext {
  const debug = createDebug("app:supabase-worker");
  let workerAccessToken: string | null = null;

  const client = createClient(
    workerConfig.supabase.url,
    workerConfig.supabase.anonKey,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: false,
      },
      accessToken: async () => workerAccessToken,
    },
  ) as unknown as SupabaseClientLike;

  const ctx: ExecutionContext = {
    config: workerConfig.supabase,
    jira: workerConfig.jira,
    supabase: {
      client,
      setAccessToken: (token) => {
        workerAccessToken = token;
        client.realtime.setAuth(token);
      },
      getUserId: async () => {
        if (!workerAccessToken) {
          throw new Error("supabase-user-missing");
        }

        const userId = decodeUserIdFromAccessToken(workerAccessToken);
        if (!userId) {
          throw new Error("supabase-user-missing");
        }

        return userId;
      },
    },
    auth: {
      login: () => login(workerConfig.supabase, fetch),
    },
    validation: {
      runIssueValidation: async (input) => {
        await runIssueValidation({
          key: input.key,
          streamEvents: false,
          hooks: {
            onStarted: async (payload) => {
              await emitEvent(
                workerConfig.supabase,
                client,
                "validate_issue_started",
                payload,
              );
            },
            onSucceeded: async (payload) => {
              await emitEvent(
                workerConfig.supabase,
                client,
                "issue_validated",
                payload,
              );
            },
            onFailed: async (payload) => {
              await emitEvent(
                workerConfig.supabase,
                client,
                "issue_validation_failed",
                payload,
              );
            },
          },
        });
      },
      runIssuePrompt: async (input) => {
        await runIssuePrompt({
          ...input,
          hooks: {
            onPromptCompleted: async (payload) => {
              await emitEvent(
                workerConfig.supabase,
                client,
                "validate_issue_prompt_completed",
                payload,
              );
            },
            onPromptFailed: async (payload) => {
              await emitEvent(
                workerConfig.supabase,
                client,
                "validate_issue_prompt_failed",
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

function decodeUserIdFromAccessToken(accessToken: string) {
  const parts = accessToken.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(base64UrlToBase64(parts[1]), "base64").toString("utf-8"),
    ) as Record<string, unknown>;

    const userId = payload.sub ?? payload.user_id;
    return typeof userId === "string" && userId.length > 0 ? userId : null;
  } catch {
    return null;
  }
}

function base64UrlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;

  if (padding === 0) {
    return normalized;
  }

  return normalized + "=".repeat(4 - padding);
}
