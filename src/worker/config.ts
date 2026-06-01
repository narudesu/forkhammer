import { loadConfig } from "../config";
import { assertJiraConfigured } from "../jira";
import type { SupabaseConfig } from "./types";
import { requireSupabaseConfig } from "../supabase-config";

export async function loadWorkerConfig(): Promise<{
  supabase: SupabaseConfig;
  jira: NonNullable<Awaited<ReturnType<typeof loadConfig>>["jira"]>;
}> {
  const config = await loadConfig();
  await assertJiraConfigured(config);
  return {
    supabase: requireSupabaseConfig(config),
    jira: config.jira!,
  };
}
