import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  button: vi.fn(),
  classAdd: vi.fn(),
  classRemove: vi.fn(),
  dataset: {} as Record<string, string>,
  getItem: vi.fn(),
  matches: false,
  mediaAddEventListener: vi.fn(),
  mediaRemoveEventListener: vi.fn(),
  radioGroup: vi.fn(),
  setItem: vi.fn(),
  setState: vi.fn(),
  stateValue: null as "system" | "light" | "dark" | null,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useState: (initial: "system" | "light" | "dark") => [mocks.stateValue ?? initial, mocks.setState],
  };
});

vi.mock("@subboost/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: (props: { children?: unknown }) => props.children,
  DropdownMenuContent: (props: { children?: unknown }) => props.children,
  DropdownMenuLabel: (props: { children?: unknown }) => props.children,
  DropdownMenuRadioGroup: (props: unknown) => {
    mocks.radioGroup(props);
    return null;
  },
  DropdownMenuRadioItem: () => null,
  DropdownMenuTrigger: (props: { children?: unknown }) => props.children,
}));

vi.mock("@subboost/ui/components/ui/icon-button", () => ({
  IconButton: (props: unknown) => {
    mocks.button(props);
    return null;
  },
}));

import { ThemeToggle } from "./theme-toggle";

type ToggleProps = {
  label: string;
};

type RadioGroupProps = {
  onValueChange: (value: string) => void;
  value: string;
};

function renderToggle() {
  renderToStaticMarkup(React.createElement(ThemeToggle));
  return mocks.button.mock.calls.at(-1)?.[0] as ToggleProps;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.matches = false;
  mocks.dataset = {};
  mocks.stateValue = null;
  mocks.radioGroup.mockClear();
  mocks.getItem.mockReturnValue(null);

  vi.stubGlobal("window", {
    localStorage: {
      getItem: mocks.getItem,
      setItem: mocks.setItem,
    },
    matchMedia: vi.fn(() => ({
      addEventListener: mocks.mediaAddEventListener,
      matches: mocks.matches,
      removeEventListener: mocks.mediaRemoveEventListener,
    })),
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        add: mocks.classAdd,
        remove: mocks.classRemove,
      },
      dataset: mocks.dataset,
      style: {},
    },
    querySelector: vi.fn(() => null),
  });
});

describe("ThemeToggle", () => {
  it("uses the saved light preference during initialization", () => {
    mocks.stateValue = "light";
    mocks.getItem.mockReturnValue("light");

    const props = renderToggle();

    expect(mocks.getItem).toHaveBeenCalledWith("subboost-theme");
    expect(mocks.classRemove).toHaveBeenCalledWith("light", "dark");
    expect(mocks.classAdd).toHaveBeenCalledWith("light");
    expect(mocks.dataset.themePreference).toBe("light");
    expect(props.label).toBe("界面主题：明亮模式");
  });

  it("defaults to the system preference and listens for system changes", () => {
    mocks.stateValue = "system";
    mocks.matches = true;

    const props = renderToggle();

    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: light)");
    expect(mocks.classAdd).toHaveBeenCalledWith("light");
    expect(mocks.dataset.themePreference).toBe("system");
    expect(mocks.mediaAddEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(props.label).toBe("界面主题：跟随系统");
  });

  it.each([
    ["system", "light", "light"],
    ["light", "dark", "dark"],
    ["dark", "system", "dark"],
  ] as const)("selects %s preference from %s", (current, next, expectedTheme) => {
    mocks.stateValue = current;
    mocks.getItem.mockReturnValue(current);

    renderToggle();
    const radioProps = mocks.radioGroup.mock.calls.at(-1)?.[0] as RadioGroupProps;
    radioProps.onValueChange(next);

    expect(mocks.setItem).toHaveBeenCalledWith("subboost-theme", next);
    expect(mocks.classAdd).toHaveBeenCalledWith(expectedTheme);
    expect(mocks.dataset.themePreference).toBe(next);
  });
});
