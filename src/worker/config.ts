import { loadConfig } from "../config";
import { assertJiraConfigured } from "../jira";
import type { SupabaseConfig } from "./types";

export async function loadWorkerConfig(): Promise<SupabaseConfig> {
  const config = await loadConfig();
  await assertJiraConfigured(config);
  if (!config.supabase) {
    throw new Error("supabase-config-not-found");
  }

  return {
    url: config.supabase.url,
    anonKey: config.supabase.anon_key,
    secretString: config.supabase.secret_string,
    table: config.supabase.table ?? "ultrafeed_item",
  };
}
