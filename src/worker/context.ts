import { createClient } from "@supabase/supabase-js";
import createDebug from "debug";
import { SupabaseAuth } from "src/worker/auth";
import type { WorkerConfig } from "src/worker/config";
import type { WorkerContext } from "src/worker/context/types";
import type { ProcessEventStores } from "src/worker/event-processor";
import { UltrafeedWriter } from "src/worker/ultrafeed-writer";
import { runIssuePrompt, runIssueValidation } from "../commands/new";

export function createWorkerContext(
  workerConfig: WorkerConfig,
  options: {
    realtime: RealtimeSubscriptionOptions | false;
  },
): WorkerContext {
  const debug = createDebug("app:supabase-worker");

  const supabase = createClient(
    workerConfig.supabase.url,
    workerConfig.supabase.anon_key,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: false,
      },
      accessToken: async () => auth.activeTokenOrFail().getToken(),
    },
  );

  const writer = UltrafeedWriter.createForWorker({
    config: workerConfig,
    supabase,
  });

  const auth = SupabaseAuth.create({
    config: workerConfig,
    supabase,
  });

  const ctx: WorkerContext = {
    stores: { workerStores: [], extraReconcilables: [] },
    workerConfig,
    writer,
    supabase,
    auth,
    validation: {
      runIssueValidation: async (input) => {
        await runIssueValidation({
          key: input.key,
          streamEvents: false,
          hooks: {
            onStarted: async (data) => {
              await writer.write({
                eventType: "validate_issue_started",
                data,
              });
            },
            onSucceeded: async (data) => {
              await writer.write({
                eventType: "issue_validated",
                data,
              });
            },
            onFailed: async (data) => {
              await writer.write({
                eventType: "issue_validation_failed",
                data,
              });
            },
          },
        });
      },
      runIssuePrompt: async (input) => {
        await runIssuePrompt({
          ...input,
          hooks: {
            onPromptCompleted: async (data) => {
              await writer.write({
                eventType: "validate_issue_prompt_completed",
                data,
              });
            },
            onPromptFailed: async (data) => {
              await writer.write({
                eventType: "validate_issue_prompt_failed",
                data,
              });
            },
          },
        });
      },
    },
    log: {
      debug,
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args),
    },
  };

  if (options.realtime) {
    ctx.stores = options.realtime.createStores(ctx);
  }

  return ctx;
}

export interface RealtimeSubscriptionOptions {
  createStores: (ctx: WorkerContext) => ProcessEventStores;
}
