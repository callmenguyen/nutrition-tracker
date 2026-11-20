import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  type Caller,
  type DeleteAccountDeps,
  handleDeleteAccount,
  type PasswordCheck,
} from "../handler";

const A: Caller = { id: "user-a", email: "a@example.com" };

const getUser = jest.fn<(jwt: string) => Promise<Caller | null>>();
const verifyPassword =
  jest.fn<(email: string, password: string) => Promise<PasswordCheck>>();
const deleteUser = jest.fn<(id: string) => Promise<void>>();
const deps: DeleteAccountDeps = { getUser, verifyPassword, deleteUser };

const request = (
  body: unknown,
  { method = "POST", auth = "Bearer token-a" } = {},
) =>
  new Request("http://localhost/functions/v1/delete-account", {
    method,
    headers: auth ? { Authorization: auth } : {},
    body: method === "GET" ? undefined : JSON.stringify(body),
  });

const call = async (req: Request) => {
  const res = await handleDeleteAccount(req, deps);
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockImplementation(async (jwt) => (jwt === "token-a" ? A : null));
  verifyPassword.mockResolvedValue("ok");
  deleteUser.mockResolvedValue();
});

describe("delete-account", () => {
  it("ACC-11: the right password deletes exactly the caller", async () => {
    expect(await call(request({ password: "right" }))).toEqual({
      status: 200,
      body: { deleted: true },
    });
    expect(verifyPassword).toHaveBeenCalledWith("a@example.com", "right");
    expect(deleteUser).toHaveBeenCalledWith("user-a");
  });

  it("never takes the user from the body", async () => {
    await call(request({ password: "right", user_id: "user-b", id: "user-b" }));
    expect(deleteUser).toHaveBeenCalledWith("user-a");
    expect(deleteUser).not.toHaveBeenCalledWith("user-b");
  });

  it("ACC-12: a wrong password deletes nothing", async () => {
    verifyPassword.mockResolvedValue("wrong");
    expect(await call(request({ password: "wrong" }))).toEqual({
      status: 403,
      body: { error: "wrong_password" },
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("refuses a missing or invalid token", async () => {
    expect((await call(request({ password: "x" }, { auth: "" }))).status).toBe(
      401,
    );
    expect(
      await call(request({ password: "x" }, { auth: "Bearer forged" })),
    ).toEqual({ status: 401, body: { error: "unauthorized" } });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("refuses a body without a password", async () => {
    for (const body of [{}, { password: "" }, { password: 42 }]) {
      expect(await call(request(body))).toEqual({
        status: 400,
        body: { error: "invalid_request" },
      });
    }
    const broken = new Request("http://localhost/x", {
      method: "POST",
      headers: { Authorization: "Bearer token-a" },
      body: "{not json",
    });
    expect((await call(broken)).status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("answers 429 when sign-in is rate limited, deleting nothing", async () => {
    verifyPassword.mockResolvedValue("rate_limited");
    expect((await call(request({ password: "x" }))).status).toBe(429);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("answers 500 without details when checking or deleting fails", async () => {
    verifyPassword.mockRejectedValueOnce(new Error("auth down"));
    expect(await call(request({ password: "x" }))).toEqual({
      status: 500,
      body: { error: "delete_failed" },
    });
    expect(deleteUser).not.toHaveBeenCalled();
    deleteUser.mockRejectedValueOnce(new Error("db down"));
    expect(await call(request({ password: "x" }))).toEqual({
      status: 500,
      body: { error: "delete_failed" },
    });
  });

  it("only accepts POST", async () => {
    expect((await call(request(null, { method: "GET" }))).status).toBe(405);
  });
});
