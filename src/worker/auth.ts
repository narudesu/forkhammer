import { createClient } from "@supabase/supabase-js";
import { parseLoginResponse } from "./domain";
import type { SupabaseConfig } from "./types";

export async function login(config: SupabaseConfig, fetchFn: typeof fetch) {
  if (config.auth.type === "password") {
    const client = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        fetch: fetchFn,
      },
    });

    const { data, error } = await client.auth.signInWithPassword({
      email: config.auth.email,
      password: config.auth.password,
    });

    if (error) {
      throw new Error(`supabase-auth-failed:${error.message}`);
    }

    const token = data.session?.access_token;
    if (!token) {
      throw new Error("supabase-auth-token-missing");
    }

    return token;
  }

  const secretString = config.auth.secretString.trim();
  if (secretString.length === 0) {
    throw new Error("supabase-auth-failed:secret_string-empty");
  }

  const response = await fetchFn(config.auth.functionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.anonKey}`,
      apikey: config.anonKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ secret_string: secretString }),
  });

  const rawBody = await response.text();
  const parsed = parseLoginResponse(rawBody, response.ok);

  if (!parsed.responseOk) {
    const message =
      parsed.payloadError ??
      parsed.payloadMessage ??
      (parsed.rawBody.trim() || `${response.status} ${response.statusText}`);
    throw new Error(`supabase-auth-failed:${message}`);
  }

  if (!parsed.token) {
    throw new Error("supabase-auth-token-missing");
  }

  return parsed.token;
}
