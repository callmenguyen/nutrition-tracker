/**
 * delete-account against a running local Supabase (`supabase start` serves the function), with
 * the service role checking the database (TC-E2E-20 fixture, ACC-11, ACC-12). Runs in CI:
 *
 *   eval "$(supabase status -o env | sed 's/^/export /')"
 *   node --experimental-strip-types --test supabase/functions/delete-account/__tests__/integration.ts
 *
 * Never point it at the cloud project: it creates and deletes users.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, describe, it } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `\x1b[31mMissing ${name}: export the output of \`supabase status -o env\` first.\x1b[0m`,
    );
    process.exit(2);
  }
  return value;
}

const API_URL = need("API_URL");
const ANON_KEY = need("ANON_KEY");
const SERVICE_ROLE_KEY = need("SERVICE_ROLE_KEY");
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API_URL)) {
  console.error(
    `\x1b[31mRefusing to run against ${API_URL}: local Supabase only.\x1b[0m`,
  );
  process.exit(2);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, noSession);
/** Every table with user data; each cascades from auth.users (ADR-003). */
const TABLES = ["profiles", "goals", "user_settings", "meal_entries", "foods"];
const PASSWORD = "integration-password-1";

type Account = {
  id: string;
  email: string;
  client: SupabaseClient;
  token: string;
};

async function account(email: string): Promise<Account> {
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  assert.ifError(created.error);
  const client = createClient(API_URL, ANON_KEY, noSession);
  const signedIn = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  assert.ifError(signedIn.error);
  const id = signedIn.data.user!.id;

  // One row in every table, written the way the app writes them.
  const writes = [
    client.from("profiles").upsert(
      {
        weight_kg: 70,
        height_cm: 175,
        sex: "male",
        birth_year: 1996,
        activity_level: "moderate",
        goal_type: "lose",
      },
      { onConflict: "user_id" },
    ),
    client
      .from("goals")
      .upsert({ calorie_target: 1800 }, { onConflict: "user_id" }),
    client
      .from("user_settings")
      .upsert(
        { log_reminder_enabled: true, log_reminder_time: "21:00" },
        { onConflict: "user_id" },
      ),
    client.rpc("log_meal", {
      p_id: randomUUID(),
      p_eaten_on: new Date().toISOString().slice(0, 10),
      p_name: "Bún nạm",
      p_calories_kcal: 450,
      p_protein_g: 25,
      p_sodium_mg: 1800,
      p_sugar_g: 6,
    }),
  ];
  for (const { error } of await Promise.all(writes)) assert.ifError(error);
  return { id, email, client, token: signedIn.data.session!.access_token };
}

async function rowCounts(userId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of TABLES) {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    assert.ifError(error);
    out[table] = count ?? -1;
  }
  return out;
}

const ONE_EACH = Object.fromEntries(TABLES.map((t) => [t, 1]));
const NONE = Object.fromEntries(TABLES.map((t) => [t, 0]));

function callDelete(token: string | null, body: unknown) {
  return fetch(`${API_URL}/functions/v1/delete-account`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("delete-account on local Supabase", () => {
  let a: Account;
  let b: Account;

  before(async () => {
    const run = randomUUID().slice(0, 8);
    a = await account(`delete-a-${run}@example.com`);
    b = await account(`delete-b-${run}@example.com`);
    assert.deepEqual(await rowCounts(a.id), ONE_EACH);
  });

  it("ACC-12: a wrong password deletes nothing", async () => {
    const res = await callDelete(a.token, { password: "not-the-password" });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "wrong_password" });
    assert.deepEqual(await rowCounts(a.id), ONE_EACH);
  });

  it("refuses a request without the user's token", async () => {
    const res = await callDelete(null, { password: PASSWORD });
    assert.equal(res.status, 401);
    // What supabase-js sends without a session: the API key as the bearer token.
    const anon = await callDelete(ANON_KEY, { password: PASSWORD });
    assert.equal(anon.status, 401);
    assert.deepEqual(await rowCounts(a.id), ONE_EACH);
  });

  it("ACC-11: the right password deletes the user and every row; B is untouched", async () => {
    // A user id in the body is ignored: only the token picks the account.
    const res = await callDelete(a.token, {
      password: PASSWORD,
      user_id: b.id,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { deleted: true });

    assert.deepEqual(await rowCounts(a.id), NONE);
    const gone = await admin.auth.admin.getUserById(a.id);
    assert.ok(gone.error || !gone.data.user, "auth user still exists");

    const again = await createClient(
      API_URL,
      ANON_KEY,
      noSession,
    ).auth.signInWithPassword({
      email: a.email,
      password: PASSWORD,
    });
    assert.equal(again.error?.code, "invalid_credentials");

    assert.deepEqual(await rowCounts(b.id), ONE_EACH);
    await admin.auth.admin.deleteUser(b.id);
  });
});
