import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  button: vi.fn(),
  classAdd: vi.fn(),
  classRemove: vi.fn(),
  getItem: vi.fn(),
  matches: false,
  setItem: vi.fn(),
  setState: vi.fn(),
  stateValue: null as "light" | "dark" | null,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useState: (initial: "light" | "dark") => [mocks.stateValue ?? initial, mocks.setState],
  };
});

vi.mock("@subboost/ui/components/ui/icon-button", () => ({
  IconButton: (props: unknown) => {
    mocks.button(props);
    return null;
  },
}));

import { ThemeToggle } from "./theme-toggle";

type ToggleProps = {
  label: string;
  onClick: () => void;
};

function renderToggle() {
  renderToStaticMarkup(React.createElement(ThemeToggle));
  return mocks.button.mock.calls.at(-1)?.[0] as ToggleProps;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.matches = false;
  mocks.stateValue = null;
  mocks.getItem.mockReturnValue(null);

  vi.stubGlobal("window", {
    localStorage: {
      getItem: mocks.getItem,
      setItem: mocks.setItem,
    },
    matchMedia: vi.fn(() => ({ matches: mocks.matches })),
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        add: mocks.classAdd,
        remove: mocks.classRemove,
      },
      style: {},
    },
    querySelector: vi.fn(() => null),
  });
});

describe("ThemeToggle", () => {
  it("uses the saved light preference during initialization", () => {
    mocks.getItem.mockReturnValue("light");

    const props = renderToggle();

    expect(mocks.getItem).toHaveBeenCalledWith("subboost-theme");
    expect(mocks.classRemove).toHaveBeenCalledWith("light", "dark");
    expect(mocks.classAdd).toHaveBeenCalledWith("light");
    expect(mocks.setState).toHaveBeenCalledWith("light");
    expect(props.label).toBe("切换到明亮模式");
  });

  it("falls back to the system preference when no saved preference exists", () => {
    mocks.matches = true;

    renderToggle();

    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: light)");
    expect(mocks.classAdd).toHaveBeenCalledWith("light");
    expect(mocks.setState).toHaveBeenCalledWith("light");
  });

  it.each([
    ["dark", "light", "切换到明亮模式"],
    ["light", "dark", "切换到黑暗模式"],
  ] as const)("toggles %s to %s", (current, next, label) => {
    mocks.stateValue = current;
    mocks.getItem.mockReturnValue(current);

    const props = renderToggle();
    props.onClick();

    expect(props.label).toBe(label);
    expect(mocks.setItem).toHaveBeenCalledWith("subboost-theme", next);
    expect(mocks.classAdd).toHaveBeenCalledWith(next);
    expect(mocks.setState).toHaveBeenCalledWith(next);
  });
});
