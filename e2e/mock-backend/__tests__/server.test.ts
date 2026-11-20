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

import {
  cleanFoodName as domainClean,
  normalizeFoodName as domainNormalize,
} from "../../../src/domain/food-name";
import { cleanFoodName, createMockBackend, normalizeFoodName } from "../server";

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
    // The app enters "Đặt mật khẩu mới" on this event (auth-provider.tsx).
    const events: string[] = [];
    client.auth.onAuthStateChange((event) => void events.push(event));
    expect((await client.auth.exchangeCodeForSession(code)).error).toBeNull();
    expect(events).toContain("PASSWORD_RECOVERY");

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

  it("user_settings: defaults on the first write, Postgres time text, 5-minute check (#20)", async () => {
    const { client, userId } = await signedIn("a@example.com");
    const saved = await client
      .from("user_settings")
      .upsert(
        { log_reminder_enabled: true, log_reminder_time: "21:05" },
        { onConflict: "user_id" },
      );
    expect(saved.error).toBeNull();
    const { data } = await client
      .from("user_settings")
      .select("log_reminder_enabled, log_reminder_time, workout_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    expect(data).toEqual({
      log_reminder_enabled: true,
      log_reminder_time: "21:05:00",
      workout_enabled: false,
    });

    const bad = await client
      .from("user_settings")
      .upsert({ log_reminder_time: "21:07" }, { onConflict: "user_id" });
    expect(bad.error?.code).toBe("23514");
    const kept = await client
      .from("user_settings")
      .select("log_reminder_time")
      .eq("user_id", userId)
      .maybeSingle();
    expect(kept.data).toEqual({ log_reminder_time: "21:05:00" });
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
    const { status, error } = await client.from("activities").select("*");
    expect(status).toBe(501);
    expect(error?.message).toMatch(/not mocked/);
  });
});

describe("meal_entries reads", () => {
  const entry = (name: string, eaten_on: string) => ({
    eaten_on,
    name,
    calories_kcal: 450,
    protein_g: 25,
    sodium_mg: 1800,
    sugar_g: 6,
  });

  async function seed(email: string, entries: object[]) {
    const res = await testApi("/meal_entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, entries }),
    });
    expect(res.status).toBe(201);
  }

  /** The app's query in src/features/meals/meals.ts. */
  const mealsOf = (client: SupabaseClient, day: string) =>
    client
      .from("meal_entries")
      .select("id, name, calories_kcal, protein_g, sodium_mg, sugar_g")
      .eq("eaten_on", day)
      .order("created_at")
      .order("id");

  it("returns the user's meals of one day in creation order (MEAL-11)", async () => {
    const { client } = await signedIn("a@example.com");
    await seed("a@example.com", [
      entry("Phở", "2026-11-16"),
      entry("Bún nạm", "2026-11-15"),
      entry("Cơm tấm", "2026-11-16"),
    ]);
    await seed("a@example.com", [entry("Trà đá", "2026-11-16")]);

    const { data, error } = await mealsOf(client, "2026-11-16");
    expect(error).toBeNull();
    expect(data!.map((m) => m.name)).toEqual(["Phở", "Cơm tấm", "Trà đá"]);
    expect(data![0]).toEqual({
      id: expect.any(String),
      name: "Phở",
      calories_kcal: 450,
      protein_g: 25,
      sodium_mg: 1800,
      sugar_g: 6,
    });
    const other = await mealsOf(client, "2026-11-15");
    expect(other.data!.map((m) => m.name)).toEqual(["Bún nạm"]);
  });

  it("sorts descending when asked", async () => {
    const { client } = await signedIn("a@example.com");
    await seed("a@example.com", [
      entry("1", "2026-11-16"),
      entry("2", "2026-11-16"),
    ]);
    const { data } = await client
      .from("meal_entries")
      .select("name")
      .eq("eaten_on", "2026-11-16")
      .order("created_at", { ascending: false });
    expect(data!.map((m) => m.name)).toEqual(["2", "1"]);
  });

  it("never shows another user's meals, and nothing to anon", async () => {
    await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    await seed("a@example.com", [entry("Của A", "2026-11-16")]);
    expect((await mealsOf(b.client, "2026-11-16")).data).toEqual([]);
    expect((await mealsOf(device(), "2026-11-16")).data).toEqual([]);
  });

  it("accepts writes only through log_meal, like the app", async () => {
    const { client } = await signedIn("a@example.com");
    const { status } = await client
      .from("meal_entries")
      .insert(entry("x", "2026-11-16"));
    expect(status).toBe(501);
  });

  it("refuses to seed meals for an unknown user", async () => {
    const res = await testApi("/meal_entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ghost@example.com", entries: [] }),
    });
    expect(res.status).toBe(404);
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

describe("log_meal, suggest_foods, delete (#17)", () => {
  const today = new Date().toISOString().slice(0, 10);
  const args = (over: object = {}) => ({
    p_id: crypto.randomUUID(),
    p_eaten_on: today,
    p_name: "Bún nạm",
    p_calories_kcal: 450,
    p_protein_g: 25,
    p_sodium_mg: 1800,
    p_sugar_g: 6,
    ...over,
  });
  const foodsOf = async (email: string) =>
    (
      await testApi(`/foods?email=${encodeURIComponent(email)}`)
    ).json() as Promise<
      { name: string; calories_kcal: number; use_count: number }[]
    >;
  const mealsToday = (client: SupabaseClient) =>
    client
      .from("meal_entries")
      .select("id, name, calories_kcal")
      .eq("eaten_on", today)
      .order("created_at");

  it("matches src/domain/food-name for Vietnamese text and đ", () => {
    for (const sample of [
      "  bún   NẠM ",
      "Đậu phụ sốt cà",
      "Phở bò tái",
      "Cơm\tgà",
      "ĐƯỜNG",
    ]) {
      expect(normalizeFoodName(sample)).toBe(domainNormalize(sample));
      expect(cleanFoodName(sample)).toBe(domainClean(sample));
    }
  });

  it("MEAL-02/05: logs a meal and keeps the saved food at the latest values", async () => {
    const { client } = await signedIn("a@example.com");
    const first = await client.rpc(
      "log_meal",
      args({ p_eaten_on: "2026-11-15" }),
    );
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ name: "Bún nạm", calories_kcal: 450 });
    await client.rpc("log_meal", args({ p_calories_kcal: 500 }));

    const foods = await foodsOf("a@example.com");
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({ calories_kcal: 500, use_count: 2 });
    const yesterday = await client
      .from("meal_entries")
      .select("calories_kcal")
      .eq("eaten_on", "2026-11-15");
    expect(yesterday.data).toEqual([{ calories_kcal: 450 }]); // copies, not links
  });

  it("MEAL-06: one saved food per normalized name; display name follows the latest", async () => {
    const { client } = await signedIn("a@example.com");
    await client.rpc("log_meal", args());
    await client.rpc("log_meal", args({ p_name: "bún  NẠM " }));
    const foods = await foodsOf("a@example.com");
    expect(foods.map((f) => f.name)).toEqual(["bún NẠM"]);
  });

  it("MEAL-11/17: editing keeps the order; an identical retry is not another use", async () => {
    const { client } = await signedIn("a@example.com");
    const a = args({ p_name: "Món 1" });
    await client.rpc("log_meal", a);
    await client.rpc("log_meal", args({ p_name: "Món 2" }));
    await client.rpc("log_meal", { ...a, p_calories_kcal: 999 }); // edit the first
    await client.rpc("log_meal", { ...a, p_calories_kcal: 999 }); // identical retry
    const { data } = await mealsToday(client);
    expect(data!.map((m) => [m.name, m.calories_kcal])).toEqual([
      ["Món 1", 999],
      ["Món 2", 450],
    ]);
    const mon1 = (await foodsOf("a@example.com")).find(
      (f) => f.name === "Món 1",
    );
    expect(mon1?.use_count).toBe(2);
  });

  it("MEAL-08/10: rejects bad values and days past UTC + 1", async () => {
    const { client } = await signedIn("a@example.com");
    const inTwoDays = new Date(Date.now() + 2 * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const bad of [
      { p_calories_kcal: 5001 },
      { p_calories_kcal: 12.5 },
      { p_protein_g: 1.25 },
      { p_sodium_mg: -1 },
      { p_name: "  " },
      { p_eaten_on: inTwoDays },
    ]) {
      const { error } = await client.rpc("log_meal", args(bad));
      expect(error?.code).toBe("23514");
    }
    expect((await mealsToday(client)).data).toEqual([]);
  });

  it("requires a uuid p_id, like the SQL signature", async () => {
    const { client } = await signedIn("a@example.com");
    for (const p_id of [undefined, "", "not-a-uuid"]) {
      const { error } = await client.rpc("log_meal", { ...args(), p_id });
      expect(error?.code).toBe("23514");
    }
  });

  it("refuses an id that belongs to another user", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    const shared = args();
    await a.client.rpc("log_meal", shared);
    const { error } = await b.client.rpc("log_meal", shared);
    expect(error?.code).toBe("23505");
  });

  it("MEAL-03/04/14: suggestions match without diacritics, starts-with first, at most 5", async () => {
    const { client } = await signedIn("a@example.com");
    for (const name of [
      "Bún nạm",
      "Bánh mì",
      "Nạm bò",
      "Bún chả",
      "Bún riêu",
      "Bún bò",
      "Bún mắm",
      "Phở",
    ]) {
      await client.rpc("log_meal", args({ p_name: name }));
    }
    const nam = await client.rpc("suggest_foods", { p_query: "nạm" });
    expect((nam.data as { name: string }[]).map((f) => f.name)).toEqual([
      "Nạm bò",
      "Bún nạm",
    ]);

    const bun = await client.rpc("suggest_foods", { p_query: "bun" });
    // Most recently used first: the last five "Bún …" logged, newest first.
    expect((bun.data as { name: string }[]).map((f) => f.name)).toEqual([
      "Bún mắm",
      "Bún bò",
      "Bún riêu",
      "Bún chả",
      "Bún nạm",
    ]);
    expect((await client.rpc("suggest_foods", { p_query: "  " })).data).toEqual(
      [],
    );
  });

  it("MEAL-15: suggestions and deletes stay within the owner's data", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    const meal = args();
    await a.client.rpc("log_meal", meal);
    expect(
      (await b.client.rpc("suggest_foods", { p_query: "bun" })).data,
    ).toEqual([]);
    await b.client.from("meal_entries").delete().eq("id", meal.p_id);
    expect((await mealsToday(a.client)).data).toHaveLength(1);
  });

  it("MEAL-12: deleting a meal keeps its saved food", async () => {
    const { client } = await signedIn("a@example.com");
    const meal = args();
    await client.rpc("log_meal", meal);
    const { error } = await client
      .from("meal_entries")
      .delete()
      .eq("id", meal.p_id);
    expect(error).toBeNull();
    expect((await mealsToday(client)).data).toEqual([]);
    expect(await foodsOf("a@example.com")).toHaveLength(1);
  });

  it("MEAL-16: a dropped request writes nothing and reaches the client as a network error", async () => {
    const { client } = await signedIn("a@example.com");
    await testApi("/fault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/rest/v1/rpc/log_meal", mode: "drop" }),
    });
    const { error } = await client.rpc("log_meal", args());
    expect(error?.message).toMatch(/fetch|network|socket/i);
    expect((await mealsToday(client)).data).toEqual([]);
  });

  it("MEAL-17: written but unanswered, then sent again with the same id: one meal", async () => {
    const { client } = await signedIn("a@example.com");
    await testApi("/fault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "/rest/v1/rpc/log_meal",
        mode: "drop-after",
      }),
    });
    const meal = args();
    expect((await client.rpc("log_meal", meal)).error).not.toBeNull();
    expect((await client.rpc("log_meal", meal)).error).toBeNull();
    expect((await mealsToday(client)).data).toHaveLength(1);
    expect((await foodsOf("a@example.com"))[0].use_count).toBe(1);
  });
});

describe("Cài đặt › Món đã lưu: foods read and delete (#18)", () => {
  const today = new Date().toISOString().slice(0, 10);
  const log = (client: SupabaseClient, name: string, kcal = 450) =>
    client.rpc("log_meal", {
      p_id: crypto.randomUUID(),
      p_eaten_on: today,
      p_name: name,
      p_calories_kcal: kcal,
      p_protein_g: 25,
      p_sodium_mg: 1800,
      p_sugar_g: 6,
    });
  const listFoods = (client: SupabaseClient) =>
    client
      .from("foods")
      .select("id, name, calories_kcal")
      .order("name_normalized")
      .order("id");

  it("lists only the user's saved foods, A→Z by normalized name", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    await log(a.client, "Phở bò");
    await log(a.client, "Bún nạm");
    await log(a.client, "Đậu phụ", 120);
    await log(b.client, "Cơm tấm");
    const { data, error } = await listFoods(a.client);
    expect(error).toBeNull();
    expect(data?.map((f) => f.name)).toEqual(["Bún nạm", "Đậu phụ", "Phở bò"]);
    expect(data?.[1]).toMatchObject({ calories_kcal: 120 });
  });

  it("MEAL-13: a deleted food leaves suggestions; logged meals keep their values", async () => {
    const { client } = await signedIn("a@example.com");
    await log(client, "Bún nạm");
    const [food] = (await listFoods(client)).data!;
    const { error } = await client.from("foods").delete().eq("id", food.id);
    expect(error).toBeNull();
    expect((await listFoods(client)).data).toEqual([]);
    expect(
      (await client.rpc("suggest_foods", { p_query: "bun" })).data,
    ).toEqual([]);
    const meals = await client
      .from("meal_entries")
      .select("name, calories_kcal")
      .eq("eaten_on", today);
    expect(meals.data).toEqual([{ name: "Bún nạm", calories_kcal: 450 }]);
  });

  it("another user's delete leaves A's saved food alone", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    await log(a.client, "Bún nạm");
    const [food] = (await listFoods(a.client)).data!;
    await b.client.from("foods").delete().eq("id", food.id);
    expect((await listFoods(a.client)).data).toHaveLength(1);
  });
});

describe("daily_totals for Biểu đồ (#19)", () => {
  const day = (n: number) =>
    new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const log = (
    client: SupabaseClient,
    eatenOn: string,
    kcal: number,
    protein: number,
  ) =>
    client.rpc("log_meal", {
      p_id: crypto.randomUUID(),
      p_eaten_on: eatenOn,
      p_name: `Món ${kcal}`,
      p_calories_kcal: kcal,
      p_protein_g: protein,
      p_sodium_mg: 100,
      p_sugar_g: 0.1,
    });

  it("CHART-02/03: one summed row per day with meals, oldest first", async () => {
    const { client } = await signedIn("a@example.com");
    await log(client, day(1), 450, 25);
    await log(client, day(1), 250, 3.5);
    await log(client, day(3), 400, 20);
    await log(client, day(40), 600, 15);
    const { data, error } = await client.rpc("daily_totals", {
      p_from: day(6),
      p_to: day(0),
    });
    expect(error).toBeNull();
    expect(data).toEqual([
      {
        eaten_on: day(3),
        calories_kcal: 400,
        protein_g: 20,
        sodium_mg: 100,
        sugar_g: 0.1,
      },
      {
        eaten_on: day(1),
        calories_kcal: 700,
        protein_g: 28.5,
        sodium_mg: 200,
        sugar_g: 0.2,
      },
    ]);
  });

  it("CHART-12: B only gets B's totals", async () => {
    const a = await signedIn("a@example.com");
    const b = await signedIn("b@example.com");
    await log(a.client, day(1), 450, 25);
    await log(b.client, day(1), 350, 12);
    const { data } = await b.client.rpc("daily_totals", {
      p_from: day(6),
      p_to: day(0),
    });
    expect(data).toMatchObject([{ calories_kcal: 350 }]);
  });

  it("refuses a range longer than 31 days or reversed, like the SQL function", async () => {
    const { client } = await signedIn("a@example.com");
    const tooLong = await client.rpc("daily_totals", {
      p_from: day(31),
      p_to: day(0),
    });
    expect(tooLong.error?.code).toBe("22023");
    const reversed = await client.rpc("daily_totals", {
      p_from: day(0),
      p_to: day(1),
    });
    expect(reversed.error?.code).toBe("22023");
    const longest = await client.rpc("daily_totals", {
      p_from: day(30),
      p_to: day(0),
    });
    expect(longest.error).toBeNull();
  });
});
