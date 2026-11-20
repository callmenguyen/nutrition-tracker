/**
 * delete-account (Account.md §3.4, ADR-003 §4): the signed-in user deletes their own account after
 * typing their password again. Every table cascades from auth.users, so deleting the user removes
 * all of their rows. Plain TypeScript with injected dependencies, so it runs in Deno and in Jest.
 */

export type Caller = { id: string; email: string };

export type PasswordCheck = "ok" | "wrong" | "rate_limited";

export type DeleteAccountDeps = {
  /** The user behind a JWT, or null when the token is missing, expired or forged. */
  getUser: (jwt: string) => Promise<Caller | null>;
  verifyPassword: (email: string, password: string) => Promise<PasswordCheck>;
  /** Deletes the auth user; throws when it could not. */
  deleteUser: (id: string) => Promise<void>;
};

/** Stable error codes; the app maps them to its own messages (no internal details leave here). */
export type ErrorCode =
  | "method_not_allowed"
  | "unauthorized"
  | "invalid_request"
  | "wrong_password"
  | "rate_limited"
  | "delete_failed";

/** Status and code only: an auth error's message can contain the email. */
function logFailure(step: string, error: unknown): void {
  const e = error as { status?: unknown; code?: unknown } | null;
  console.error(
    `delete-account: ${step} failed (status ${String(e?.status)}, code ${String(e?.code)})`,
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const fail = (status: number, code: ErrorCode | "misconfigured") =>
  json(status, { error: code });

export async function handleDeleteAccount(
  req: Request,
  deps: DeleteAccountDeps,
): Promise<Response> {
  if (req.method !== "POST") return fail(405, "method_not_allowed");

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = /^Bearer (\S+)$/.exec(auth)?.[1];
  if (!jwt) return fail(401, "unauthorized");
  const caller = await deps.getUser(jwt);
  if (!caller) return fail(401, "unauthorized");

  let password: unknown;
  try {
    password = ((await req.json()) as { password?: unknown })?.password;
  } catch {
    return fail(400, "invalid_request");
  }
  if (typeof password !== "string" || password.length === 0) {
    return fail(400, "invalid_request");
  }

  let check: PasswordCheck;
  try {
    check = await deps.verifyPassword(caller.email, password);
  } catch (error) {
    logFailure("password check", error);
    return fail(500, "delete_failed");
  }
  if (check === "wrong") return fail(403, "wrong_password"); // ACC-12: nothing deleted
  if (check === "rate_limited") return fail(429, "rate_limited");

  try {
    // Only the caller's own id, taken from the verified JWT; nothing in the body picks a user.
    await deps.deleteUser(caller.id);
  } catch (error) {
    logFailure("delete", error);
    return fail(500, "delete_failed");
  }
  return json(200, { deleted: true });
}
