import { createClient } from "@supabase/supabase-js";
import createDebug from "debug";
import { createPeerClient } from "src/peer-protocol/peer-client";
import { SupabaseAuth } from "src/worker/auth";
import type { WorkerConfig } from "src/worker/config";
import type { WorkerContext } from "src/worker/context/types";
import { ResolvablePromise } from "src/worker/resolvable-promise";
import {
  EffectorSnapshotRepository,
  type UnknownHydratableStore,
} from "src/worker/stores/effector-snapshots";
import { UltrafeedWriter } from "src/worker/ultrafeed-writer";
import { runIssuePrompt, runIssueValidation } from "../commands/new";

export function createWorkerContext(
  workerConfig: WorkerConfig,
  stores: UnknownHydratableStore[],
): WorkerContext {
  const debug = createDebug("app:supabase-worker");

  const authPromise = ResolvablePromise.create<SupabaseAuth>();

  const supabase = createClient(
    workerConfig.supabase.url,
    workerConfig.supabase.anon_key,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: false,
      },
      accessToken: async () =>
        authPromise.promise
          .then((auth) => auth.onceActiveToken())
          .then((token) => token.getToken()),
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
  authPromise.resolve(auth);

  const snapshots = EffectorSnapshotRepository.create({
    directory: workerConfig.worker.snapshots.directory,
  });
  const peerClient = createPeerClient();

  const ctx: WorkerContext = {
    workerConfig,
    writer,
    peerClient,
    supabase,
    stores,
    auth,
    snapshots,
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

  return ctx;
}
