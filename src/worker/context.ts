import { createClient } from "@supabase/supabase-js";
import createDebug from "debug";
import { JiraClient } from "src/jira/jira";
import { createPeerClient } from "src/peer-protocol/peer-client";
import { PiGateway } from "src/pi/pi-gateway";
import { SupabaseAuth } from "src/worker/auth";
import type { WorkerConfig } from "src/worker/config";
import type { WorkerContext } from "src/worker/context/types";
import { ResolvablePromise } from "src/worker/resolvable-promise";
import {
  EffectorSnapshotRepository,
  type UnknownHydratableStore,
} from "src/worker/snapshot/effector-snapshots";
import { UltrafeedWriter } from "src/worker/ultrafeed-writer";

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

  const jira = JiraClient.create(workerConfig.jira);

  const pi = PiGateway.create(jira, workerConfig);

  const ctx: WorkerContext = {
    workerConfig,
    writer,
    pi,
    jira,
    peerClient,
    supabase,
    stores,
    auth,
    snapshots,
    log: {
      debug,
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args),
    },
  };

  return ctx;
}
