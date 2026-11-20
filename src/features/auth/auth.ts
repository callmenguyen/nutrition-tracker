import {
  type AuthError,
  FunctionsFetchError,
  FunctionsHttpError,
} from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { z } from "zod";

import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------------ schemas (Account.md §4)
const email = z
  .string()
  .trim()
  .min(1, "Nhập email")
  .email("Email không hợp lệ");
const password = z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Nhập mật khẩu"),
});
export const signUpSchema = z
  .object({ email, password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Hai mật khẩu không khớp",
    path: ["confirmPassword"],
  });
export const forgotPasswordSchema = z.object({ email });
export const newPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Hai mật khẩu không khớp",
    path: ["confirmPassword"],
  });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

// ----------------------------------------------------------------- errors
export type AuthFailure = {
  /** Field the message belongs to, or "form" for a message under the whole form. */
  field: "email" | "password" | "form";
  message: string;
  /** Set when the account exists but its email is not confirmed yet. */
  needsConfirmation?: boolean;
  /** Set when the server could not be reached. */
  network?: boolean;
};

const NETWORK_MESSAGE =
  "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";

/** Maps Supabase Auth errors to Vietnamese messages without revealing whether an email exists. */
export function mapAuthError(
  error: Pick<AuthError, "code" | "message" | "status"> | null,
): AuthFailure {
  switch (error?.code) {
    case "invalid_credentials":
      return { field: "form", message: "Email hoặc mật khẩu không đúng" };
    case "email_not_confirmed":
      return {
        field: "form",
        message: "Email chưa được xác nhận",
        needsConfirmation: true,
      };
    case "user_already_exists":
    case "email_exists":
      return { field: "email", message: "Email này đã được đăng ký" };
    case "weak_password":
      return {
        field: "password",
        message: "Mật khẩu quá yếu, thử mật khẩu khác",
      };
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return {
        field: "form",
        message: "Bạn thao tác quá nhanh, đợi một lát rồi thử lại",
      };
    case "same_password":
      return {
        field: "password",
        message: "Mật khẩu mới phải khác mật khẩu cũ",
      };
  }
  if (!error || error.status === 0 || /network|fetch/i.test(error.message)) {
    return { field: "form", message: NETWORK_MESSAGE, network: true };
  }
  return { field: "form", message: "Đã có lỗi xảy ra, thử lại sau" };
}

// -------------------------------------------------------------------- api
/** Deep link the confirmation / recovery emails open (PKCE `?code=` is appended by Supabase). */
export function authRedirectUrl(next: "home" | "reset-password"): string {
  return Linking.createURL("auth/callback", { queryParams: { next } });
}

export type Result = { ok: true } | { ok: false; failure: AuthFailure };
const ok: Result = { ok: true };
const fail = (error: Parameters<typeof mapAuthError>[0]): Result => ({
  ok: false,
  failure: mapAuthError(error),
});

export async function signUp({
  email,
  password,
}: SignUpValues): Promise<Result> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: authRedirectUrl("home") },
  });
  if (error) return fail(error);
  // With email confirmation on, an existing address returns a user with no identities (ACC-02).
  if (data.user && data.user.identities?.length === 0) {
    return fail({ code: "user_already_exists", message: "", status: 422 });
  }
  return ok;
}

export async function signIn({
  email,
  password,
}: SignInValues): Promise<Result> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  return error ? fail(error) : ok;
}

export async function resendConfirmation(email: string): Promise<Result> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: authRedirectUrl("home") },
  });
  return error ? fail(error) : ok;
}

/** Always resolves ok unless the network fails, so the UI never reveals whether an email exists (ACC-09). */
export async function requestPasswordReset({
  email,
}: ForgotPasswordValues): Promise<Result> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: authRedirectUrl("reset-password"),
  });
  const failure = error ? mapAuthError(error) : null;
  return failure?.network ? { ok: false, failure } : ok;
}

export async function updatePassword({
  password,
}: NewPasswordValues): Promise<Result> {
  const { error } = await supabase.auth.updateUser({ password });
  return error ? fail(error) : ok;
}

/** Signs out this device only; other devices keep their sessions. */
export async function signOut(): Promise<Result> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  return error ? fail(error) : ok;
}

// ------------------------------------------------------------ delete account
export type DeleteAccountResult =
  { ok: true } | { ok: false; field: "password" | "form"; message: string };

/** Error codes of supabase/functions/delete-account/handler.ts → what the dialog says. */
async function deleteFailure(
  error: unknown,
): Promise<Exclude<DeleteAccountResult, { ok: true }>> {
  if (error instanceof FunctionsFetchError) {
    return { ok: false, field: "form", message: NETWORK_MESSAGE };
  }
  let code: unknown;
  if (error instanceof FunctionsHttpError) {
    code = await (error.context as Response)
      .json()
      .then((b: { error?: unknown }) => b?.error)
      .catch(() => undefined);
  }
  switch (code) {
    case "wrong_password":
      return { ok: false, field: "password", message: "Mật khẩu không đúng" };
    case "rate_limited":
      return {
        ok: false,
        field: "form",
        message: "Bạn thao tác quá nhanh, đợi một lát rồi thử lại",
      };
    case "unauthorized":
      return {
        ok: false,
        field: "form",
        message: "Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử lại.",
      };
    default:
      return {
        ok: false,
        field: "form",
        message: "Không xoá được tài khoản. Thử lại sau.",
      };
  }
}

/**
 * Account.md §3.4: the server re-checks the password and deletes the user with every row
 * (Edge Function delete-account, ADR-003); then this device signs out and shows Đăng nhập.
 * A wrong password or a failure deletes nothing (ACC-12).
 */
export async function deleteAccount(
  password: string,
): Promise<DeleteAccountResult> {
  const { error } = await supabase.functions.invoke("delete-account", {
    body: { password },
  });
  if (error) return deleteFailure(error);
  // The account no longer exists; dropping the local session moves the app to Đăng nhập.
  await supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}

// ---------------------------------------------------------------- callback
export type CallbackParams = {
  code?: string | string[];
  next?: string | string[];
};

/** Reads the PKCE code and destination from the deep-link query (first value wins). */
export function parseAuthCallback(params: CallbackParams): {
  code: string | null;
  next: "home" | "reset-password";
} {
  const first = (v?: string | string[]) =>
    (Array.isArray(v) ? v[0] : v) ?? null;
  return {
    code: first(params.code),
    next: first(params.next) === "reset-password" ? "reset-password" : "home",
  };
}

export async function exchangeCode(code: string): Promise<Result> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error ? fail(error) : ok;
}
