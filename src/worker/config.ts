import { type Config, loadConfig } from "../config/config";
import { assertJiraConfigured } from "../jira/jira";

export interface WorkerConfig {
  jira: NonNullable<Config["jira"]>;
  supabase: NonNullable<Config["supabase"]>;
  worker: NonNullable<Config["worker"]>;
  project: NonNullable<Config["project"]>;
}

export async function loadWorkerConfig(): Promise<WorkerConfig> {
  const config = await loadConfig();

  const jiraConfig = await assertJiraConfigured(config);
  const supabaseConfig = config.supabase;
  if (!supabaseConfig) {
    throw new Error("missing-supabase-config");
  }

  return {
    supabase: supabaseConfig,
    jira: jiraConfig,
    worker: config.worker,
    project: config.project ?? {},
  };
}
