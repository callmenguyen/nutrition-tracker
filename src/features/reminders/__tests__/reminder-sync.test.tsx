import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react-native";

import { useOpenTodayFromReminder } from "@/features/reminders/reminder-sync";

type Response = {
  actionIdentifier: string;
  notification: {
    date: number;
    request: { identifier: string; content: { data: unknown } };
  };
} | null;

let mockResponse: Response = null;
const mockNavigate = jest.fn();
const mockClear = jest.fn();

jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "default",
  useLastNotificationResponse: () => mockResponse,
  clearLastNotificationResponse: () => mockClear(),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

const tap = (
  over: { action?: string; kind?: string; date?: number } = {},
): Response => ({
  actionIdentifier: over.action ?? "default",
  notification: {
    date: over.date ?? 1000,
    request: {
      identifier: "log-reminder",
      content: { data: { kind: over.kind ?? "log-reminder" } },
    },
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockResponse = null;
});

describe("useOpenTodayFromReminder (REM-03)", () => {
  it("a tap on the reminder opens Hôm nay at today, once", async () => {
    mockResponse = tap();
    const { rerender } = await renderHook(() => useOpenTodayFromReminder());
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const arg = mockNavigate.mock.calls[0][0] as {
      pathname: string;
      params: { day: string; at: string };
    };
    expect(arg.pathname).toBe("/");
    expect(arg.params.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mockClear).toHaveBeenCalled();

    await rerender({});
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it("ignores other notifications and other actions", async () => {
    mockResponse = tap({ kind: "something-else" });
    const { rerender } = await renderHook(() => useOpenTodayFromReminder());
    mockResponse = tap({ action: "dismiss", date: 2000 });
    await rerender({});
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("the next day's tap opens Hôm nay again", async () => {
    mockResponse = tap({ date: 1000 });
    const { rerender } = await renderHook(() => useOpenTodayFromReminder());
    mockResponse = tap({ date: 2000 });
    await rerender({});
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });
});
