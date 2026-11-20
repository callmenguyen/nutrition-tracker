import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { deleteAccount, type DeleteAccountResult } from "@/features/auth/auth";
import { DeleteAccountDialog } from "@/features/auth/delete-account-dialog";
import { supabase } from "@/lib/supabase";

jest.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    auth: { signOut: jest.fn(async () => ({ error: null })) },
  },
}));
jest.mock("expo-linking", () => ({ createURL: () => "" }));

const invoke = supabase.functions.invoke as unknown as jest.Mock<
  (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>
>;
const signOut = supabase.auth.signOut as unknown as jest.Mock<
  (...args: unknown[]) => Promise<unknown>
>;
const httpError = (status: number, code: string) =>
  new FunctionsHttpError(
    new Response(JSON.stringify({ error: code }), { status }),
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe("deleteAccount (Account.md §3.4)", () => {
  it("ACC-11: calls the function with the password, then signs out locally", async () => {
    invoke.mockResolvedValue({ data: { deleted: true }, error: null });
    expect(await deleteAccount("secret-1")).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith("delete-account", {
      body: { password: "secret-1" },
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("ACC-12: a wrong password is a field error and keeps the session", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(403, "wrong_password"),
    });
    expect(await deleteAccount("nope")).toEqual({
      ok: false,
      field: "password",
      message: "Mật khẩu không đúng",
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("maps a lost connection, an expired session and anything else", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsFetchError(new Error("Network request failed")),
    });
    expect(await deleteAccount("x")).toMatchObject({
      field: "form",
      message: expect.stringContaining("Không kết nối được"),
    });
    invoke.mockResolvedValueOnce({
      data: null,
      error: httpError(401, "unauthorized"),
    });
    expect(await deleteAccount("x")).toMatchObject({
      message: "Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử lại.",
    });
    invoke.mockResolvedValueOnce({
      data: null,
      error: httpError(500, "delete_failed"),
    });
    expect(await deleteAccount("x")).toMatchObject({
      message: "Không xoá được tài khoản. Thử lại sau.",
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("DeleteAccountDialog", () => {
  const onCancel = jest.fn();
  const onConfirm = jest.fn<(p: string) => Promise<DeleteAccountResult>>();
  const show = () =>
    render(
      <DeleteAccountDialog visible onCancel={onCancel} onConfirm={onConfirm} />,
    );

  it("says everything goes for good; confirm stays locked until a password is typed", async () => {
    await show();
    expect(
      screen.getByText(/Toàn bộ dữ liệu sẽ bị xoá vĩnh viễn/),
    ).toBeTruthy();
    const confirm = screen.getByTestId("delete-account-confirm");
    expect(confirm.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ACC-12: Hủy deletes nothing", async () => {
    await show();
    await fireEvent.changeText(
      screen.getByTestId("delete-account-password"),
      "secret-1",
    );
    await fireEvent.press(screen.getByTestId("delete-account-cancel"));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows a wrong password under the field and keeps the dialog", async () => {
    onConfirm.mockResolvedValue({
      ok: false,
      field: "password",
      message: "Mật khẩu không đúng",
    });
    await show();
    await fireEvent.changeText(
      screen.getByTestId("delete-account-password"),
      "nope",
    );
    await fireEvent.press(screen.getByTestId("delete-account-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("nope");
    expect(
      (await screen.findByTestId("delete-account-password-error")).props
        .children,
    ).toBe("Mật khẩu không đúng");
    expect(screen.getByTestId("delete-account-dialog")).toBeTruthy();
  });

  it("shows a form error for other failures", async () => {
    onConfirm.mockResolvedValue({
      ok: false,
      field: "form",
      message: "Không xoá được tài khoản. Thử lại sau.",
    });
    await show();
    await fireEvent.changeText(
      screen.getByTestId("delete-account-password"),
      "secret-1",
    );
    await fireEvent.press(screen.getByTestId("delete-account-confirm"));
    expect(
      (await screen.findByTestId("delete-account-error")).props.children,
    ).toBe("Không xoá được tài khoản. Thử lại sau.");
  });
});
