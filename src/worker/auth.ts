import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAuthToken } from "src/worker/auth-token";
import type { WorkerConfig } from "src/worker/config";
import { ResolvablePromise } from "src/worker/resolvable-promise";
import { parseLoginResponse } from "./domain";

export abstract class SupabaseAuth {
  abstract login(): Promise<void>;
  abstract activeTokenOrFail(): SupabaseAuthToken;
  abstract onceActiveToken(): Promise<SupabaseAuthToken>;

  static create = createSupabaseAuth;
}

export interface CreateSupabaseAuthOpts {
  config: WorkerConfig;
  supabase: SupabaseClient;
}

export function createSupabaseAuth(opts: CreateSupabaseAuthOpts): SupabaseAuth {
  const supabaseConfig = opts.config.supabase;
  const supabase = opts.supabase;
  const authConfig = opts.config.supabase.auth;

  const state: {
    activeToken: SupabaseAuthToken | null;
    activeTokenPromise: ResolvablePromise<SupabaseAuthToken> | null;
  } = {
    activeToken: null,
    activeTokenPromise: null,
  };

  return {
    async onceActiveToken() {
      if (state.activeToken) {
        return state.activeToken;
      }
      state.activeTokenPromise = ResolvablePromise.create();
      return await state.activeTokenPromise.promise;
    },
    activeTokenOrFail() {
      if (!state.activeToken) {
        throw new Error("not-logged-in");
      }
      return state.activeToken;
    },
    async login() {
      const response = await fetch(authConfig.function_url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseConfig.anon_key}`,
          apikey: supabaseConfig.anon_key,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ secret_string: authConfig.secret_string }),
      });

      const rawBody = await response.text();
      const parsed = parseLoginResponse(rawBody, response.ok);

      if (!parsed.responseOk) {
        const message =
          parsed.payloadError ??
          parsed.payloadMessage ??
          (parsed.rawBody.trim() ||
            `${response.status} ${response.statusText}`);
        throw new Error(`supabase-auth-failed:${message}`);
      }

      if (!parsed.token) {
        throw new Error("supabase-auth-token-missing");
      }

      supabase.realtime.setAuth(parsed.token);

      state.activeToken = SupabaseAuthToken.fromString(parsed.token);
      if (state.activeTokenPromise) {
        state.activeTokenPromise.resolve(state.activeToken);
        state.activeTokenPromise = null;
      }
    },
  };
}
