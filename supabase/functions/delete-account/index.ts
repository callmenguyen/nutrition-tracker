// Supabase Edge Function (Deno). Wiring only; the behaviour lives in handler.ts.
import { createClient } from "npm:@supabase/supabase-js@2";

import { fail, handleDeleteAccount, type PasswordCheck } from "./handler.ts";

/** The "default" key of a SUPABASE_*_KEYS JSON dictionary, or null when absent or malformed. */
function defaultKey(json: string | undefined): string | null {
  if (!json) return null;
  try {
    const key = (JSON.parse(json) as Record<string, unknown>).default;
    return typeof key === "string" && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

/** Default secrets that Supabase provides to every function; never hard-coded or defaulted. */
function readEnv(): {
  url: string;
  publishable: string;
  secret: string;
} | null {
  const url = Deno.env.get("SUPABASE_URL");
  const publishable = defaultKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
  const secret = defaultKey(Deno.env.get("SUPABASE_SECRET_KEYS"));
  const missing = [
    !url && "SUPABASE_URL",
    !publishable && "SUPABASE_PUBLISHABLE_KEYS.default",
    !secret && "SUPABASE_SECRET_KEYS.default",
  ].filter(Boolean);
  if (missing.length > 0) {
    console.error(
      `delete-account: missing or malformed: ${missing.join(", ")}`,
    );
    return null;
  }
  return { url: url!, publishable: publishable!, secret: secret! };
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

Deno.serve(async (req) => {
  const env = readEnv();
  if (!env) return fail(500, "misconfigured");
  const admin = createClient(env.url, env.secret, noSession);

  return handleDeleteAccount(req, {
    getUser: async (jwt) => {
      const { data, error } = await admin.auth.getUser(jwt);
      if (error || !data.user?.email) return null;
      return { id: data.user.id, email: data.user.email };
    },
    verifyPassword: async (email, password): Promise<PasswordCheck> => {
      // A throwaway client: the session it creates is never stored and dies with the user.
      const client = createClient(env.url, env.publishable, noSession);
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (!error) return "ok";
      if (error.status === 429) return "rate_limited";
      if (error.code === "invalid_credentials") return "wrong";
      throw error;
    },
    deleteUser: async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    },
  });
});
