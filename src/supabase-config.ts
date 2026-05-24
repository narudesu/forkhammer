import type { Config } from "./config";
import type { SupabaseConfig } from "./worker/types";

export function buildSupabaseConfig(config: Config): SupabaseConfig | null {
  if (!config.supabase) {
    return null;
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

export function requireSupabaseConfig(config: Config): SupabaseConfig {
  const supabaseConfig = buildSupabaseConfig(config);
  if (!supabaseConfig) {
    throw new Error("supabase-config-not-found");
  }

  return supabaseConfig;
}
