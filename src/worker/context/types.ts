import type { SupabaseClient } from "@supabase/supabase-js";
import type { JiraClient } from "src/jira/jira";
import type { PeerClient } from "src/peer-protocol/peer-client";
import type { PiGateway } from "src/pi/pi-gateway";
import type { SupabaseAuth } from "src/worker/auth";
import type { WorkerConfig } from "src/worker/config";
import type {
  EffectorSnapshotRepository,
  UnknownHydratableStore,
} from "src/worker/snapshot/effector-snapshots";
import type { UltrafeedWriter } from "src/worker/ultrafeed-writer";

export interface WorkerContext {
  workerConfig: WorkerConfig;
  supabase: SupabaseClient;
  auth: SupabaseAuth;
  jira: JiraClient;
  writer: UltrafeedWriter;
  stores: UnknownHydratableStore[];
  pi: PiGateway;
  peerClient: PeerClient;
  snapshots: EffectorSnapshotRepository;
  log: WorkerLogger;
}

export interface WorkerLogger {
  debug: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}
