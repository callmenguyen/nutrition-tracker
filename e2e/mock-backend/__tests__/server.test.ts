/**
 * @jest-environment node
 *
 * The E2E mock backend (ADR-016) must answer the real supabase-js client the way Supabase does
 * for every call the app makes. Queries below copy the app's select lists and upsert options.
 */
/// <reference types="node" />
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AddressInfo } from "node:net";

import { createMockBackend } from "../server";

const { server } = createMockBackend();
let base = "";
const REDIRECT = "nutritiontracker://auth/callback?next=home";

/** A fresh client with its own in-memory storage (PKCE verifier + session), like one device. */
function device(): SupabaseClient {
  const store = new Map<string, string>();
  return createClient(base, "mock-anon-key", {
    auth: {
      flowType: "pkce",
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => void store.set(k, v),
        removeItem: (k) => void store.delete(k),
      },
    },
  });
}

const testApi = (path: string, init?: RequestInit) =>
  fetch(`${base}/__test${path}`, init);

async function addUser(email: string, password = "password-1") {
  const res = await testApi("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(201);
}

async function outbox(
  email: string,
): Promise<{ type: string; link: string }[]> {
  return (await testApi(`/outbox?email=${encodeURIComponent(email)}`)).json();
}

/** Opens an emailed link like the phone would and returns the PKCE code from the deep link. */
async function codeFromLink(link: string): Promise<string> {
  const res = await fetch(link.replace(/^http:\/\/[^/]+/, base), {
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  const target = new URL(res.headers.get("location")!);
  expect(target.protocol).toBe("nutritiontracker:");
  return target.searchParams.get("code")!;
}

async function signedIn(email: string) {
  await addUser(email);
  const client = device();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: "password-1",
  });
  expect(error).toBeNull();
  return { client, userId: data.user!.id };
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => testApi("/reset", { method: "POST" }));

describe("sign-up and email confirmation", () => {
  it("creates an unconfirmed user, emails a link, and the link signs the device in", async () => {
    const client = device();
    const { data, error } = await client.auth.signUp({
      email: "New@Example.com ",
      password: "12345678",
      options: { emailRedirectTo: REDIRECT },
    });
    expect(error).toBeNull();
    expect(data.session).toBeNull();
    expect(data.user?.identities).toHaveLength(1);

    const blocked = await client.auth.signInWithPassword({
      email: "new@example.com",
      password: "12345678",
    });
    expect(blocked.error?.code).toBe("email_not_confirmed");

    const [mail] = await outbox("new@example.com");
    expect(mail.type).toBe("signup");
    const code = await codeFromLink(mail.link);
    const exchanged = await client.auth.exchangeCodeForSession(code);
    expect(exchanged.error).toBeNull();
    expect(exchanged.data.session?.user.email).toBe("new@example.com");
  });

  it("answers an already confirmed email with a user without identities (ACC-02)", async () => {
    await addUser("taken@example.com");
    const { data, error } = await device().auth.signUp({
      email: "taken@example.com",
      password: "12345678",
    });
    expect(error).toBeNull();
    expect(data.user?.identities).toEqual([]);
    expect(await outbox("taken@example.com")).toEqual([]);
  });

  it("rejects a short password as weak_password", async () => {
    const { error } = await device().auth.signUp({
      email: "a@example.com",
      password: "123",
    });
    expect(error?.code).toBe("weak_password");
  });

  it("resends the confirmation only to an unconfirmed user", async () => {
    const client = device();
    await client.auth.signUp({
      email: "late@example.com",
      password: "12345678",
    });
    await client.auth.resend({ type: "signup", email: "late@example.com" });
    await client.auth.resend({ type: "signup", email: "nobody@example.com" });
    expect(await outbox("late@example.com")).toHaveLength(2);
    expect(await outbox("nobody@example.com")).toEqual([]);
  });

  it("refuses a code exchanged with another device's verifier", async () => {
    await device().auth.signUp({
      email: "pkce@example.com",
      password: "12345678",
      options: { emailRedirectTo: REDIRECT },
    });
    const [mail] = await outbox("pkce@example.com");
    const other = device();
    // Give the other device a verifier of its own, then try the code there.
    await other.auth.resetPasswordForEmail("someone@example.com", {
      redirectTo: REDIRECT,
    });
    const { error } = await other.auth.exchangeCodeForSession(
      await codeFromLink(mail.link),
    );
    expect(error?.code).toBe("bad_code_verifier");
  });
});

describe("sign-in, refresh and sign-out", () => {
  it("gives the same invalid_credentials for a wrong password and an unknown email (ACC-03)", async () => {
    await addUser("user@example.com");
    const client = device();
    const wrong = await client.auth.signInWithPassword({
      email: "user@example.com",
      password: "nope-nope",
    });
    const unknown = await client.auth.signInWithPassword({
      email: "ghost@example.com",
      password: "nope-nope",
    });
    expect(wrong.error?.code).toBe("invalid_credentials");
    expect(unknown.error?.code).toBe("invalid_credentials");
    expect(unknown.error?.message).toBe(wrong.error?.message);
  });

  it("refreshes the session and signs out this device", async () => {
    const { client, userId } = await signedIn("user@example.com");
    const refreshed = await client.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.user?.id).toBe(userId);
    expect((await client.auth.signOut({ scope: "local" })).error).toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
});

describe("password reset", () => {
  it("emails only known addresses, and the link leads to a password change (ACC-09)", async () => {
    await addUser("user@example.com");
    const client = device();
    const opts = {
      redirectTo: "nutritiontracker://auth/callback?next=reset-password",
    };
    expect(
      (await client.auth.resetPasswordForEmail("ghost@example.com", opts))
        .error,
    ).toBeNull();
    expect(
      (await client.auth.resetPasswordForEmail("user@example.com", opts)).error,
    ).toBeNull();
    expect(await outbox("ghost@example.com")).toEqual([]);

    const [mail] = await outbox("user@example.com");
    expect(mail.type).toBe("recovery");
    const code = await codeFromLink(mail.link);
    expect((await client.auth.exchangeCodeForSession(code)).error).toBeNull();

    const same = await client.auth.updateUser({ password: "password-1" });
    expect(same.error?.code).toBe("same_password");
    expect(
      (await client.auth.updateUser({ password: "password-2" })).error,
    ).toBeNull();
    const again = await device().auth.signInWithPassword({
      email: "user@example.com",
      password: "password-2",
    });
    expect(again.error).toBeNull();
  });
});

describe("tables", () => {
  const profile = {
    weight_kg: 60,
    height_cm: 165,
    sex: "female",
    birth_year: 1995,
    activity_level: "light",
    goal_type: "maintain",
  };
  const profileColumns =
    "weight_kg, height_cm, sex, birth_year, activity_level, goal_type";

  it("upserts and reads the signed-in user's own row, as the app does", async () => {
    const { client, userId } = await signedIn("a@example.com");
    const none = await client
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    expect(none).toMatchObject({ data: null, error: null });

    const saved = await client
      .from("profiles")
      .upsert(profile, { onConflict: "user_id" });
    expect(saved.error).toBeNull();
    await client
      .from("profiles")
      .upsert({ ...profile, weight_kg: 58 }, { onConflict: "user_id" });

    const { data, error } = await client
      .from("profiles")
      .select(profileColumns)
      .eq("user_id", userId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toEqual({ ...profile, weight_kg: 58 });
  });

  it("keeps columns that a later upsert does not send", async () => {
    const { client, userId } = await signedIn("a@example.com");
    await client
      .from("goals")
      .upsert({ calorie_adjustment: -300 }, { onConflict: "user_id" });
    await client
      .from("goals")
      .upsert({ calorie_target: 1800 }, { onConflict: "user_id" });
    const { data } = await client
      .from("goals")
      .select("calorie_adjustment, calorie_target, protein_target_g")
      .eq("user_id", userId)
      .maybeSingle();
    expect(data).toEqual({
      calorie_adjustment: -300,
      calorie_target: 1800,
      protein_target_g: null,
    });
  });

  it("never shows or writes another user's row", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    await a.client.from("profiles").upsert(profile, { onConflict: "user_id" });

    const peek = await b.client
      .from("profiles")
      .select("user_id")
      .eq("user_id", a.userId)
      .maybeSingle();
    expect(peek).toMatchObject({ data: null, error: null });
    const write = await b.client
      .from("profiles")
      .upsert({ ...profile, user_id: a.userId }, { onConflict: "user_id" });
    expect(write.error?.code).toBe("42501");
    const anon = await device()
      .from("profiles")
      .upsert(profile, { onConflict: "user_id" });
    expect(anon.error?.code).toBe("42501");
  });

  it("answers 501 for a table that is not mocked yet", async () => {
    const { client } = await signedIn("a@example.com");
    const { status, error } = await client.from("meal_entries").select("*");
    expect(status).toBe(501);
    expect(error?.message).toMatch(/not mocked/);
  });
});

describe("test control", () => {
  it("reset clears users, rows and the outbox", async () => {
    await addUser("a@example.com");
    await device().auth.resetPasswordForEmail("a@example.com");
    await testApi("/reset", { method: "POST" });
    expect(await outbox("a@example.com")).toEqual([]);
    const { error } = await device().auth.signInWithPassword({
      email: "a@example.com",
      password: "password-1",
    });
    expect(error?.code).toBe("invalid_credentials");
  });

  it("refuses to create the same user twice", async () => {
    await addUser("a@example.com");
    const res = await testApi("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "x" }),
    });
    expect(res.status).toBe(409);
  });
});
