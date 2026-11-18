// Node types come with @jest/globals (devDependency); this file runs on Node, not in the app.
/// <reference types="node" />
/**
 * Mock Supabase backend for the Appium E2E suite (ADR-016).
 *
 * Speaks the part of GoTrue (/auth/v1) and PostgREST (/rest/v1) that the app calls, keeps
 * everything in memory, and adds /__test endpoints for the test run. It is not a security
 * boundary: it listens on 127.0.0.1 only and its JWT secret is public. Routes that are not
 * mocked answer 501, so a test that reaches one fails loudly instead of passing by accident.
 *
 * Run: node e2e/mock-backend/server.ts   (port: MOCK_BACKEND_PORT, default 54399)
 */
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

const JWT_SECRET = "mock-backend-not-a-secret";
const TOKEN_TTL_S = 3600;
const MIN_PASSWORD_LENGTH = 6; // Supabase default
/** Tables the app reads and writes; each has one row per user (primary key user_id). */
const TABLES = new Set(["profiles", "goals", "user_settings"]);
/** Many rows per user: read, delete, and written only through rpc/log_meal (like the app). */
const MANY_ROW_TABLES = new Set(["meal_entries", "foods"]);

type User = {
  id: string;
  email: string;
  password: string;
  confirmedAt: string | null;
  createdAt: string;
};
type EmailType = "signup" | "recovery";
type Flow = {
  userId: string;
  type: EmailType;
  challenge: string | null;
  method: string | null;
  redirectTo: string | null;
};
type Mail = { to: string; type: EmailType; link: string; sentAt: string };
type Row = Record<string, unknown>;
type Json = Record<string, unknown>;

type MockState = {
  users: Map<string, User>;
  refreshTokens: Map<string, string>;
  verifyTokens: Map<string, Flow>;
  authCodes: Map<string, Flow>;
  outbox: Mail[];
  tables: Map<string, Map<string, Row>>;
  mealEntries: Row[];
  foods: Row[];
  /** One-shot network fault for the next request to `path` (MEAL-16, MEAL-17). */
  fault: { path: string; mode: "drop" | "drop-after" } | null;
};

const emptyState = (): MockState => ({
  users: new Map(),
  refreshTokens: new Map(),
  verifyTokens: new Map(),
  authCodes: new Map(),
  outbox: [],
  tables: new Map([...TABLES].map((t) => [t, new Map()])),
  mealEntries: [],
  foods: [],
  fault: null,
});

const now = () => new Date().toISOString();

/** Strictly increasing timestamps, so created_at / last_used_at order is stable within one ms. */
let lastTick = 0;
const tick = () => {
  lastTick = Math.max(Date.now(), lastTick + 1);
  return new Date(lastTick).toISOString();
};

/** Copies of src/domain/food-name.ts (the mock runs on plain Node); parity is tested in Jest. */
export const cleanFoodName = (name: string) => name.trim().replace(/\s+/g, " ");
export const normalizeFoodName = (name: string) =>
  cleanFoodName(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
const oneDecimal = (n: unknown) =>
  typeof n === "number" && Math.round(n * 10) / 10 === n;
const intIn = (n: unknown, max: number) =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max;
const normEmail = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase() : "";
const str = (v: unknown) => (typeof v === "string" ? v : "");

// ------------------------------------------------------------------ JWT
const b64url = (s: string) => Buffer.from(s).toString("base64url");
const hmac = (data: string) =>
  createHmac("sha256", JWT_SECRET).update(data).digest("base64url");

function signJwt(user: User): string {
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      aud: "authenticated",
      role: "authenticated",
      iat,
      exp: iat + TOKEN_TTL_S,
      session_id: randomUUID(),
    }),
  );
  return `${head}.${body}.${hmac(`${head}.${body}`)}`;
}

/** The user id of a valid, unexpired token from the Authorization header; null for anon. */
function userIdFrom(req: IncomingMessage): string | null {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  const [head, body, sig] = token?.split(".") ?? [];
  if (!head || !body || !sig || hmac(`${head}.${body}`) !== sig) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as {
    sub: string;
    exp: number;
  };
  return payload.exp > Date.now() / 1000 ? payload.sub : null;
}

// ------------------------------------------------------------------ responses
function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  res.setHeader("X-Supabase-Api-Version", "2024-01-01");
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function authError(
  res: ServerResponse,
  status: number,
  code: string,
  msg: string,
  extra: Json = {},
): void {
  send(res, status, { code, error_code: code, msg, ...extra });
}

function notMocked(req: IncomingMessage, res: ServerResponse, path: string) {
  console.error(`[mock-backend] NOT MOCKED: ${req.method} ${path}`);
  send(res, 501, {
    message: `mock-backend: ${req.method} ${path} is not mocked (ADR-016)`,
  });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : {};
}

// ------------------------------------------------------------------ server
export function createMockBackend(): { server: Server } {
  let state = emptyState();

  const findByEmail = (email: string) =>
    [...state.users.values()].find((u) => u.email === email);

  function addUser(email: string, password: string, confirmed: boolean) {
    const user: User = {
      id: randomUUID(),
      email,
      password,
      confirmedAt: confirmed ? now() : null,
      createdAt: now(),
    };
    state.users.set(user.id, user);
    return user;
  }

  function publicUser(user: User, withIdentity = true): Json {
    return {
      id: user.id,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      phone: "",
      email_confirmed_at: user.confirmedAt,
      confirmed_at: user.confirmedAt,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: withIdentity
        ? [
            {
              identity_id: user.id,
              id: user.id,
              user_id: user.id,
              provider: "email",
              identity_data: {
                sub: user.id,
                email: user.email,
                email_verified: !!user.confirmedAt,
              },
              created_at: user.createdAt,
              updated_at: user.createdAt,
            },
          ]
        : [],
      created_at: user.createdAt,
      updated_at: user.createdAt,
      is_anonymous: false,
    };
  }

  function issueSession(user: User): Json {
    const refresh = randomBytes(16).toString("hex");
    state.refreshTokens.set(refresh, user.id);
    return {
      access_token: signJwt(user),
      token_type: "bearer",
      expires_in: TOKEN_TTL_S,
      expires_at: Math.floor(Date.now() / 1000) + TOKEN_TTL_S,
      refresh_token: refresh,
      user: publicUser(user),
    };
  }

  /** "Sends" a confirmation or recovery email: the link opens GET /auth/v1/verify. */
  function sendMail(user: User, type: EmailType, body: Json, url: URL): void {
    const token = randomBytes(16).toString("hex");
    const redirectTo = url.searchParams.get("redirect_to");
    state.verifyTokens.set(token, {
      userId: user.id,
      type,
      challenge: str(body.code_challenge) || null,
      method: str(body.code_challenge_method) || null,
      redirectTo,
    });
    const link = new URL("/auth/v1/verify", url.origin);
    link.searchParams.set("token", token);
    link.searchParams.set("type", type);
    if (redirectTo) link.searchParams.set("redirect_to", redirectTo);
    state.outbox.push({ to: user.email, type, link: link.href, sentAt: now() });
  }

  function auth(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    body: Json,
  ) {
    const route = `${req.method} ${url.pathname.slice("/auth/v1".length)}`;
    const grant = url.searchParams.get("grant_type");
    const email = normEmail(body.email);
    const password = str(body.password);

    switch (route) {
      case "POST /signup": {
        if (!email)
          return authError(res, 400, "validation_failed", "Missing email");
        if (password.length < MIN_PASSWORD_LENGTH) {
          return authError(res, 422, "weak_password", "Password is too short", {
            weak_password: { reasons: ["length"] },
          });
        }
        const existing = findByEmail(email);
        // Supabase with confirmations on: a confirmed address gets an obfuscated user with no
        // identities, so the response does not reveal that the email exists.
        if (existing?.confirmedAt) {
          return send(res, 200, {
            ...publicUser(existing, false),
            id: randomUUID(),
          });
        }
        const user = existing ?? addUser(email, password, false);
        sendMail(user, "signup", body, url);
        return send(res, 200, publicUser(user));
      }

      case "POST /token": {
        if (grant === "password") {
          const user = findByEmail(email);
          if (!user || user.password !== password) {
            return authError(
              res,
              400,
              "invalid_credentials",
              "Invalid login credentials",
            );
          }
          if (!user.confirmedAt) {
            return authError(
              res,
              400,
              "email_not_confirmed",
              "Email not confirmed",
            );
          }
          return send(res, 200, issueSession(user));
        }
        if (grant === "refresh_token") {
          const user = state.users.get(
            state.refreshTokens.get(str(body.refresh_token)) ?? "",
          );
          if (!user) {
            return authError(
              res,
              400,
              "refresh_token_not_found",
              "Invalid Refresh Token",
            );
          }
          return send(res, 200, issueSession(user));
        }
        if (grant === "pkce") {
          const flow = state.authCodes.get(str(body.auth_code));
          state.authCodes.delete(str(body.auth_code));
          const user = flow && state.users.get(flow.userId);
          if (!flow || !user) {
            return authError(
              res,
              404,
              "flow_state_not_found",
              "invalid flow state",
            );
          }
          const verifier = str(body.code_verifier);
          const expected =
            flow.method?.toLowerCase() === "s256"
              ? createHash("sha256").update(verifier).digest("base64url")
              : verifier;
          if (flow.challenge && expected !== flow.challenge) {
            return authError(
              res,
              400,
              "bad_code_verifier",
              "code challenge does not match",
            );
          }
          return send(res, 200, issueSession(user));
        }
        return notMocked(req, res, `${url.pathname}?grant_type=${grant}`);
      }

      case "GET /verify": {
        const token = url.searchParams.get("token") ?? "";
        const flow = state.verifyTokens.get(token);
        state.verifyTokens.delete(token);
        const user = flow && state.users.get(flow.userId);
        if (!flow || !user) {
          return authError(
            res,
            403,
            "otp_expired",
            "Email link is invalid or has expired",
          );
        }
        if (flow.type === "signup") user.confirmedAt ??= now();
        const code = randomUUID();
        state.authCodes.set(code, flow);
        if (!flow.redirectTo) return send(res, 200, { code });
        const target = new URL(flow.redirectTo);
        target.searchParams.set("code", code);
        res.setHeader("Location", target.href);
        return send(res, 303);
      }

      case "POST /resend": {
        const user = findByEmail(email);
        if (body.type === "signup" && user && !user.confirmedAt) {
          sendMail(user, "signup", body, url);
        }
        return send(res, 200, {});
      }

      case "POST /recover": {
        const user = findByEmail(email);
        if (user) sendMail(user, "recovery", body, url);
        return send(res, 200, {}); // same answer whether or not the email exists
      }

      case "GET /user":
      case "PUT /user": {
        const user = state.users.get(userIdFrom(req) ?? "");
        if (!user) return authError(res, 401, "bad_jwt", "invalid JWT");
        if (req.method === "PUT" && "password" in body) {
          if (password === user.password) {
            return authError(
              res,
              422,
              "same_password",
              "New password should be different from the old password.",
            );
          }
          if (password.length < MIN_PASSWORD_LENGTH) {
            return authError(
              res,
              422,
              "weak_password",
              "Password is too short",
              {
                weak_password: { reasons: ["length"] },
              },
            );
          }
          user.password = password;
        }
        return send(res, 200, publicUser(user));
      }

      case "POST /logout":
        return send(res, 204);

      default:
        return notMocked(req, res, url.pathname);
    }
  }

  /** PostgREST for one-row-per-user tables; rows are scoped to the JWT user, like RLS. */
  function rest(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    body: unknown,
  ) {
    const table = url.pathname.slice("/rest/v1/".length);
    if (table.startsWith("rpc/")) return rpc(req, res, table.slice(4), body);
    const isMany = MANY_ROW_TABLES.has(table);
    const manyRows = () =>
      table === "foods" ? state.foods : state.mealEntries;
    const rows = state.tables.get(table);
    if (!rows && !isMany) return notMocked(req, res, url.pathname);
    const userId = userIdFrom(req);

    if (req.method === "GET") {
      const filters: [string, string][] = [];
      let order: [string, 1 | -1][] = [];
      for (const [key, value] of url.searchParams) {
        if (key === "select") continue;
        if (key === "order") {
          // "created_at.asc,id.asc" (postgrest-js .order() calls); nulls options are not mocked.
          order = value.split(",").map((part) => {
            const [col, dir = "asc"] = part.split(".");
            return [col, dir === "desc" ? -1 : 1];
          });
          continue;
        }
        if (!value.startsWith("eq.")) {
          return notMocked(req, res, `${url.pathname}?${key}=${value}`);
        }
        filters.push([key, value.slice(3)]);
      }
      const own = !userId
        ? []
        : isMany
          ? manyRows().filter((r) => r.user_id === userId)
          : [rows!.get(userId)].filter((r): r is Row => !!r);
      const matches = own
        .filter((row) => filters.every(([k, v]) => String(row[k]) === v))
        .sort((a, b) => {
          for (const [col, dir] of order) {
            const [x, y] = [a[col], b[col]];
            if (x === y) continue;
            const less =
              typeof x === "number" && typeof y === "number"
                ? x < y
                : String(x) < String(y);
            return less ? -dir : dir;
          }
          return 0;
        });
      const select = url.searchParams.get("select") ?? "*";
      const columns =
        select === "*" ? null : select.split(",").map((c) => c.trim());
      const out = matches.map((row) =>
        columns
          ? Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))
          : row,
      );
      return send(res, 200, out);
    }

    if (req.method === "POST" && rows) {
      const rlsError = {
        code: "42501",
        message: `new row violates row-level security policy for table "${table}"`,
      };
      const onConflict = url.searchParams.get("on_conflict");
      if (onConflict && onConflict !== "user_id") {
        return notMocked(req, res, `${url.pathname}?on_conflict=${onConflict}`);
      }
      if (!userId) return send(res, 401, rlsError);
      const prefer = req.headers.prefer ?? "";
      const merge = prefer.includes("resolution=merge-duplicates");
      const input = (Array.isArray(body) ? body : [body]) as Row[];
      const saved: Row[] = [];
      for (const row of input) {
        if (row.user_id !== undefined && row.user_id !== userId) {
          return send(res, 403, rlsError);
        }
        const existing = rows.get(userId);
        if (existing && !merge) {
          return send(res, 409, {
            code: "23505",
            message: `duplicate key value violates unique constraint "${table}_pkey"`,
          });
        }
        const next = { ...existing, ...row, user_id: userId };
        rows.set(userId, next);
        saved.push(next);
      }
      return prefer.includes("return=representation")
        ? send(res, 201, saved)
        : send(res, 201);
    }

    if (req.method === "DELETE" && isMany) {
      const filters = [...url.searchParams].map(([k, v]) => {
        if (!v.startsWith("eq.")) return null;
        return [k, v.slice(3)] as const;
      });
      if (filters.length === 0 || filters.some((f) => f === null)) {
        return notMocked(req, res, `${url.pathname}?${url.searchParams}`);
      }
      // RLS: only the caller's own rows; anything else is silently left alone, like PostgREST.
      const kept = manyRows().filter(
        (r) =>
          r.user_id !== userId ||
          !filters.every((f) => String(r[f![0]]) === f![1]),
      );
      if (table === "foods") state.foods = kept;
      else state.mealEntries = kept;
      return send(res, 204);
    }

    return notMocked(req, res, url.pathname);
  }

  /** The two SQL functions the app calls (supabase/migrations/…_meal_entries_foods.sql). */
  function rpc(
    req: IncomingMessage,
    res: ServerResponse,
    name: string,
    body: unknown,
  ) {
    const userId = userIdFrom(req);
    if (req.method !== "POST") return notMocked(req, res, `rpc/${name}`);
    if (!userId) {
      return send(res, 401, { code: "42501", message: "not authenticated" });
    }
    const p = body as Json;

    if (name === "log_meal") {
      const mealName = cleanFoodName(str(p.p_name));
      const eatenOn = str(p.p_eaten_on);
      const latest = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      if (
        !intIn(p.p_calories_kcal, 5000) ||
        !intIn(p.p_sodium_mg, 20000) ||
        !oneDecimal(p.p_protein_g) ||
        !oneDecimal(p.p_sugar_g) ||
        (p.p_protein_g as number) < 0 ||
        (p.p_protein_g as number) > 500 ||
        (p.p_sugar_g as number) < 0 ||
        (p.p_sugar_g as number) > 500 ||
        mealName.length < 1 ||
        mealName.length > 100 ||
        // p_id is a uuid (not null) in the SQL signature; the app always sends one.
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          str(p.p_id),
        ) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(eatenOn)
      ) {
        return send(res, 400, {
          code: "23514",
          message: "invalid nutrition values",
        });
      }
      // Server tolerance: the client blocks future days exactly; the server allows UTC + 1 day.
      if (eatenOn > latest) {
        return send(res, 400, {
          code: "23514",
          message: `eaten_on ${eatenOn} is in the future`,
        });
      }
      const values = {
        eaten_on: eatenOn,
        name: mealName,
        calories_kcal: p.p_calories_kcal,
        protein_g: p.p_protein_g,
        sodium_mg: p.p_sodium_mg,
        sugar_g: p.p_sugar_g,
      };
      const existing = state.mealEntries.find((r) => r.id === p.p_id);
      if (existing && existing.user_id !== userId) {
        return send(res, 409, {
          code: "23505",
          message: "meal id already in use",
        });
      }
      if (existing) {
        const same = Object.entries(values).every(
          ([k, v]) => existing[k] === v,
        );
        if (same) return send(res, 200, existing); // MEAL-17: identical retry, not another use
        Object.assign(existing, values); // created_at unchanged: editing keeps the order (MEAL-11)
      }
      const row = existing ?? {
        id: str(p.p_id),
        user_id: userId,
        created_at: tick(),
        ...values,
      };
      if (!existing) state.mealEntries.push(row);

      const normalized = normalizeFoodName(mealName);
      const food = state.foods.find(
        (f) => f.user_id === userId && f.name_normalized === normalized,
      );
      const foodValues = {
        name: mealName,
        calories_kcal: values.calories_kcal,
        protein_g: values.protein_g,
        sodium_mg: values.sodium_mg,
        sugar_g: values.sugar_g,
        last_used_at: tick(),
      };
      if (food) {
        Object.assign(food, foodValues, {
          use_count: (food.use_count as number) + 1,
        });
      } else {
        state.foods.push({
          id: randomUUID(),
          user_id: userId,
          name_normalized: normalized,
          use_count: 1,
          ...foodValues,
        });
      }
      return send(res, 200, row);
    }

    if (name === "suggest_foods") {
      const q = normalizeFoodName(str(p.p_query));
      if (!q) return send(res, 200, []);
      const matches = state.foods
        .filter(
          (f) => f.user_id === userId && String(f.name_normalized).includes(q),
        )
        .sort((a, b) => {
          const aStarts = String(a.name_normalized).startsWith(q) ? 0 : 1;
          const bStarts = String(b.name_normalized).startsWith(q) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          if (a.last_used_at !== b.last_used_at) {
            return String(a.last_used_at) > String(b.last_used_at) ? -1 : 1;
          }
          return String(a.name_normalized) < String(b.name_normalized) ? -1 : 1;
        })
        .slice(0, 5);
      return send(res, 200, matches);
    }

    return notMocked(req, res, `rpc/${name}`);
  }

  function testControl(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    body: Json,
  ) {
    switch (`${req.method} ${url.pathname}`) {
      case "GET /__test/health":
        return send(res, 200, { ok: true });
      case "POST /__test/reset":
        state = emptyState();
        return send(res, 204);
      case "POST /__test/users": {
        const email = normEmail(body.email);
        if (!email || !str(body.password)) {
          return send(res, 400, { message: "email and password are required" });
        }
        if (findByEmail(email))
          return send(res, 409, { message: "user exists" });
        const user = addUser(email, str(body.password), true);
        return send(res, 201, { id: user.id, email: user.email });
      }
      case "POST /__test/meal_entries": {
        // Seeds logged meals for one user, in order: created_at increases with each entry.
        const user = findByEmail(normEmail(body.email));
        if (!user) return send(res, 404, { message: "unknown user" });
        const entries = Array.isArray(body.entries)
          ? (body.entries as Row[])
          : [];
        const saved = entries.map((entry) => ({
          ...entry,
          id: randomUUID(),
          user_id: user.id,
          created_at: tick(),
        }));
        state.mealEntries.push(...saved);
        return send(res, 201, saved);
      }
      case "GET /__test/foods": {
        // Saved foods of one user, for tests that check MEAL-05/06 without the Món đã lưu screen.
        const user = findByEmail(normEmail(url.searchParams.get("email")));
        return send(
          res,
          200,
          state.foods.filter((f) => user && f.user_id === user.id),
        );
      }
      case "POST /__test/fault": {
        const mode = body.mode === "drop-after" ? "drop-after" : "drop";
        if (!str(body.path))
          return send(res, 400, { message: "path is required" });
        state.fault = { path: str(body.path), mode };
        return send(res, 204);
      }
      case "GET /__test/outbox": {
        const to = normEmail(url.searchParams.get("email"));
        return send(
          res,
          200,
          state.outbox.filter((m) => !to || m.to === to),
        );
      }
      default:
        return notMocked(req, res, url.pathname);
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "127.0.0.1"}`,
    );
    res.on("finish", () => {
      // Path only: query strings and bodies can hold emails or health data (CLAUDE.md).
      console.log(
        `[mock-backend] ${req.method} ${url.pathname} → ${res.statusCode}`,
      );
    });
    const fault = state.fault?.path === url.pathname ? state.fault : null;
    if (fault) {
      state.fault = null;
      console.log(
        `[mock-backend] fault ${fault.mode}: ${req.method} ${url.pathname}`,
      );
      if (fault.mode === "drop") {
        req.socket.destroy(); // the client sees a network error; nothing is written
        return;
      }
      // "drop-after": handle the request (it is written), then cut the connection instead of answering.
      res.end = (() => {
        req.socket.destroy();
        return res;
      }) as typeof res.end;
    }
    readJson(req)
      .then((body) => {
        if (url.pathname.startsWith("/__test/")) {
          return testControl(req, res, url, body as Json);
        }
        if (url.pathname.startsWith("/auth/v1/")) {
          return auth(req, res, url, body as Json);
        }
        if (url.pathname.startsWith("/rest/v1/"))
          return rest(req, res, url, body);
        return notMocked(req, res, url.pathname);
      })
      .catch((error: unknown) => {
        console.error(
          `[mock-backend] ${req.method} ${url.pathname} failed:`,
          error,
        );
        if (!res.headersSent) send(res, 400, { message: "bad request" });
      });
  });

  return { server };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("mock-backend/server.ts")) {
  const port = Number(process.env.MOCK_BACKEND_PORT ?? 54399);
  createMockBackend().server.listen(port, "127.0.0.1", () => {
    console.log(`[mock-backend] listening on http://127.0.0.1:${port}`);
  });
}
