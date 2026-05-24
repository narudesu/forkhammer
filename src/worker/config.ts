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
    table: config.supabase.table ?? "ultrafeed_item",
    auth:
      config.supabase.auth.type === "password"
        ? {
            type: "password",
            email: config.supabase.auth.email,
            password: config.supabase.auth.password,
          }
        : {
            type: "secret_string",
            secretString: config.supabase.auth.secret_string,
            functionUrl: config.supabase.auth.function_url,
          },
  };
}
