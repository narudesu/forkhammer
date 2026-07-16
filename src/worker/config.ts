import { type Config, loadConfig } from "../config/config";
import { assertJiraConfigured } from "../jira/jira";

export interface WorkerConfig {
  jira: NonNullable<Config["jira"]>;
  supabase: NonNullable<Config["supabase"]>;
  agent?: Config["agent"];
  worker: NonNullable<Config["worker"]>;
  project: NonNullable<Config["project"]>;
  gitlab?: Config["gitlab"];
  blockers?: Config["blockers"];
  healthchecks?: Config["healthchecks"];
}

export async function loadWorkerConfig(): Promise<WorkerConfig> {
  const config = await loadConfig();

  const jiraConfig = await assertJiraConfigured(config);
  const supabaseConfig = config.supabase;
  if (!supabaseConfig) {
    throw new Error("missing-supabase-config");
  }

  return {
    agent: config.agent,
    supabase: supabaseConfig,
    jira: jiraConfig,
    worker: config.worker,
    project: config.project ?? {},
    gitlab: config.gitlab,
    blockers: config.blockers,
    healthchecks: config.healthchecks,
  };
}
