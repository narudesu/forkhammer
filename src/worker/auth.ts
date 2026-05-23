import { parseLoginResponse } from "./domain";
import type { SupabaseConfig } from "./types";

export async function login(config: SupabaseConfig, fetchFn: typeof fetch) {
  const secretString = config.secretString.trim();
  if (secretString.length === 0) {
    throw new Error("supabase-auth-failed:secret_string-empty");
  }

  const projectOrigin = new URL(config.url).origin;
  const functionUrl = `${projectOrigin}/functions/v1/generate-worker-token`;

  const response = await fetchFn(functionUrl, {
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
