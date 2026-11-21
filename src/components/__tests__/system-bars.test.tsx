import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react-native";
import { StatusBar } from "expo-status-bar";

import { SystemBars } from "@/components/system-bars";
import { useColorScheme } from "@/hooks/use-color-scheme";

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: jest.fn() }));
jest.mock("expo-status-bar", () => ({ StatusBar: jest.fn(() => null) }));
const scheme = jest.mocked(useColorScheme);
const statusBar = jest.mocked(StatusBar);

/** The `style` the last rendered StatusBar got. */
function styleShown() {
  return statusBar.mock.calls.at(-1)?.[0].style;
}

describe("SystemBars (#54)", () => {
  beforeEach(() => {
    scheme.mockReset();
    statusBar.mockClear();
  });

  it("uses dark status bar icons on the light page", async () => {
    scheme.mockReturnValue("light");
    await render(<SystemBars />);
    expect(styleShown()).toBe("dark");
  });

  it("uses light status bar icons on the dark page", async () => {
    scheme.mockReturnValue("dark");
    await render(<SystemBars />);
    expect(styleShown()).toBe("light");
  });

  it("treats an unknown system setting as light, like the palette does", async () => {
    scheme.mockReturnValue(null);
    await render(<SystemBars />);
    expect(styleShown()).toBe("dark");
  });
});
