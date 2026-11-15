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
/** Many rows per user, read-only for now (#16); writes go through log_meal in #17. */
const MEAL_ENTRIES = "meal_entries";

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
};

const emptyState = (): MockState => ({
  users: new Map(),
  refreshTokens: new Map(),
  verifyTokens: new Map(),
  authCodes: new Map(),
  outbox: [],
  tables: new Map([...TABLES].map((t) => [t, new Map()])),
  mealEntries: [],
});

const now = () => new Date().toISOString();
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
    const isMeals = table === MEAL_ENTRIES;
    const rows = state.tables.get(table);
    if (!rows && !isMeals) return notMocked(req, res, url.pathname);
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
        : isMeals
          ? state.mealEntries.filter((r) => r.user_id === userId)
          : [rows!.get(userId)].filter((r): r is Row => !!r);
      const matches = own
        .filter((row) => filters.every(([k, v]) => String(row[k]) === v))
        .sort((a, b) => {
          for (const [col, dir] of order) {
            const x = String(a[col]);
            const y = String(b[col]);
            if (x !== y) return x < y ? -dir : dir;
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

    return notMocked(req, res, url.pathname);
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
        const base = Date.now();
        const saved = entries.map((entry, i) => ({
          ...entry,
          id: randomUUID(),
          user_id: user.id,
          created_at: new Date(
            base + state.mealEntries.length + i,
          ).toISOString(),
        }));
        state.mealEntries.push(...saved);
        return send(res, 201, saved);
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
