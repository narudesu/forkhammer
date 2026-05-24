import { loadConfig } from "../config";
import { assertJiraConfigured } from "../jira";
import type { SupabaseConfig } from "./types";
import { requireSupabaseConfig } from "../supabase-config";

export async function loadWorkerConfig(): Promise<SupabaseConfig> {
  const config = await loadConfig();
  await assertJiraConfigured(config);
  return requireSupabaseConfig(config);
}
