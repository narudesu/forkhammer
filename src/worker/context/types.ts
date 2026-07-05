import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseAuth } from "src/worker/auth";
import type { WorkerConfig } from "src/worker/config";
import type { UltrafeedWriter } from "src/worker/ultrafeed-writer";

export interface WorkerContext {
  workerConfig: WorkerConfig;
  supabase: SupabaseClient;
  auth: SupabaseAuth;
  writer: UltrafeedWriter;
  validation: WorkerValidation;
  log: WorkerLogger;
}

export interface WorkerLogger {
  debug: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

export interface WorkerValidation {
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
}
