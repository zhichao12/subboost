import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  buttons: [] as Array<Record<string, any>>,
  cleanups: [] as Array<() => void>,
  enabled: false,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  stateIndex: 0,
  switches: [] as Array<Record<string, any>>,
  userState: {
    fetchUser: vi.fn(),
    logout: vi.fn(),
    user: null as null | {
      username: string;
      subscriptionCount: number;
      quota: { maxSubscriptions: number };
    },
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => {
      if (!harness.enabled) return actual.useEffect(effect, deps);
      const cleanup = effect();
      if (typeof cleanup === "function") harness.cleanups.push(cleanup);
    },
    useState: (initial: unknown) => {
      if (!harness.enabled) return actual.useState(initial);
      const index = harness.stateIndex++;
      const value = Object.prototype.hasOwnProperty.call(harness.overrides, index)
        ? harness.overrides[index]
        : initial;
      const setter = vi.fn();
      harness.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("lucide-react", () => ({
  LogOut: () => React.createElement("span", null, "logout"),
  Network: () => React.createElement("span", null, "network"),
  ServerCog: () => React.createElement("span", null, "server"),
  ShieldCheck: () => React.createElement("span", null, "shield"),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: ({ variant: _variant, ...props }: Record<string, any>) => {
    harness.buttons.push({ variant: _variant, ...props });
    return React.createElement("button", props, props.children);
  },
}));

vi.mock("@subboost/ui/components/ui/card", () => ({
  Card: (props: Record<string, any>) => React.createElement("section", props, props.children),
  CardContent: (props: Record<string, any>) => React.createElement("div", props, props.children),
  CardHeader: (props: Record<string, any>) => React.createElement("header", props, props.children),
  CardTitle: (props: Record<string, any>) => React.createElement("h2", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/switch-field", () => ({
  SwitchField: (props: Record<string, any>) => {
    harness.switches.push(props);
    return React.createElement("button", {
      disabled: props.disabled,
      onClick: () => props.onCheckedChange(!props.checked),
      role: "switch",
    });
  },
}));

vi.mock("@subboost/ui/store/user-store", () => ({
  useUserStore: () => harness.userState,
}));

import SettingsPage from "../../../local/app/dashboard/settings/page";

function response(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

function renderSettings(overrides: Record<number, unknown> = {}) {
  harness.enabled = true;
  harness.overrides = overrides;
  harness.stateIndex = 0;
  harness.setters = [];
  harness.cleanups = [];
  harness.buttons = [];
  harness.switches = [];
  try {
    const html = renderToStaticMarkup(React.createElement(SettingsPage));
    return {
      html,
      setters: harness.setters,
      cleanups: harness.cleanups,
      buttons: harness.buttons,
      switches: harness.switches,
    };
  } finally {
    harness.enabled = false;
  }
}

function buttonWithText(buttons: Array<Record<string, any>>, text: string) {
  return buttons.find((button) => JSON.stringify(button.children).includes(text));
}

function updateStatus(state: "idle" | "applying" | "succeeded" | "failed" = "idle") {
  return {
    available: true,
    currentBuildSha: "1234567",
    state,
    targetBuildSha: state === "idle" ? null : "abcdef0",
    message: state === "failed" ? "更新失败" : state === "succeeded" ? "应用更新完成" : "等待更新",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
}

async function flushPromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe("local source-import settings interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    harness.userState = {
      fetchUser: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      user: null,
    };
    vi.stubGlobal("window", {
      clearInterval: vi.fn(),
      location: { href: "" },
      setInterval: vi.fn(() => 1),
    });
  });

  it.each([
    [
      "reports that the Fork already matches upstream",
      { currentVersion: "2.7.0", latestVersion: "2.7.0", latestTag: "v2.7.0", hasUpdate: false, releaseUrl: null },
      "已是官方最新版本：当前 2.7.0，上游 v2.7.0。",
    ],
    [
      "reports an upstream release that needs a Fork sync",
      { currentVersion: "2.7.0", latestVersion: "2.8.0", latestTag: "v2.8.0", hasUpdate: true, releaseUrl: "https://example.com/release" },
      "发现官方新版本：v2.8.0。请先同步 Fork 并等待镜像构建完成。",
    ],
    [
      "falls back to a version number when an upstream tag is unavailable",
      { currentVersion: "2.7.0", latestVersion: "2.8.0", latestTag: null, hasUpdate: true, releaseUrl: null },
      "发现官方新版本：2.8.0。请先同步 Fork 并等待镜像构建完成。",
    ],
    [
      "uses a generic label when the upstream release has no version fields",
      { currentVersion: "2.7.0", latestVersion: null, latestTag: null, hasUpdate: true, releaseUrl: null },
      "发现官方新版本：新版本。请先同步 Fork 并等待镜像构建完成。",
    ],
    [
      "reports an unknown current version without hiding the upstream result",
      { currentVersion: null, latestVersion: "2.7.0", latestTag: "v2.7.0", hasUpdate: false, releaseUrl: null },
      "已是官方最新版本：当前 未识别，上游 v2.7.0。",
    ],
    [
      "reports that the upstream version is temporarily unavailable",
      { currentVersion: "2.7.0", latestVersion: null, latestTag: null, hasUpdate: false, releaseUrl: null },
      "暂时无法获取官方版本信息，请稍后重试。",
    ],
  ])("%s when checking updates", async (_label, releaseStatus, expectedMessage) => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/settings/source-import") return response({ allowUnsafeSubscriptionSources: false });
      if (url === "/api/releases/latest") return response(releaseStatus);
      return response(updateStatus());
    }));

    const view = renderSettings();
    await flushPromises();
    await buttonWithText(view.buttons, "检查更新")?.onClick();
    await flushPromises();

    expect(view.setters[9]).toHaveBeenLastCalledWith(expectedMessage);
    expect(view.setters[10]).toHaveBeenNthCalledWith(1, true);
    expect(view.setters[10]).toHaveBeenLastCalledWith(false);
  });

  it("shows a visible failure after an update check cannot be completed", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/settings/source-import") return response({ allowUnsafeSubscriptionSources: false });
      throw new Error(`failed to fetch ${url}`);
    }));

    const view = renderSettings();
    await flushPromises();
    await buttonWithText(view.buttons, "检查更新")?.onClick();
    await flushPromises();

    expect(view.setters[8]).toHaveBeenLastCalledWith("检查更新失败，请稍后重试");
    expect(view.setters[9]).toHaveBeenLastCalledWith(null);
  });

  it("renders visible update-check progress and result text", () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", vi.fn(async () => response({ allowUnsafeSubscriptionSources: false })));

    const completed = renderSettings({
      4: { currentVersion: "2.7.0", latestVersion: "2.7.0", latestTag: "v2.7.0", hasUpdate: false, releaseUrl: null },
      5: updateStatus(),
      6: false,
      7: false,
      8: null,
      9: "已是官方最新版本：当前 2.7.0，上游 v2.7.0。",
      10: false,
    });
    expect(completed.html).toContain("已是官方最新版本：当前 2.7.0，上游 v2.7.0。");

    const checking = renderSettings({
      4: { currentVersion: "2.7.0", latestVersion: "2.7.0", latestTag: "v2.7.0", hasUpdate: false, releaseUrl: null },
      5: updateStatus(),
      6: false,
      7: false,
      8: null,
      9: null,
      10: true,
    });
    expect(checking.html).toContain("正在检查官方版本...");
  });

  it("loads application update status and submits a signed update request", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/settings/source-import") return response({ allowUnsafeSubscriptionSources: false });
      if (url === "/api/releases/latest") {
        return response({ currentVersion: "2.7.0", latestVersion: "2.7.0", hasUpdate: false, releaseUrl: null });
      }
      if (url === "/api/app-update") return response(updateStatus());
      return response(updateStatus("applying"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = renderSettings();
    await flushPromises();
    buttonWithText(view.buttons, "应用已构建更新")?.onClick();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("/api/releases/latest", { cache: "no-store" });
    expect(fetchMock).toHaveBeenCalledWith("/api/app-update", expect.objectContaining({ method: "POST" }));
  });

  it("renders upstream and updater states", () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", vi.fn(async () => response({ allowUnsafeSubscriptionSources: false })));

    const upstream = renderSettings({
      4: { currentVersion: "2.7.0", latestVersion: "2.8.0", hasUpdate: true, releaseUrl: "https://example.com/release" },
      5: updateStatus("idle"),
      6: false,
      7: false,
      8: null,
    });
    expect(upstream.html).toContain("官方已发布 2.8.0");
    expect(upstream.html).toContain("同步 Fork");

    const failed = renderSettings({
      4: { currentVersion: "2.7.0", latestVersion: "2.7.0", hasUpdate: false, releaseUrl: null },
      5: updateStatus("failed"),
      6: false,
      7: false,
      8: "请求失败",
    });
    expect(failed.html).toContain("更新失败");
    expect(failed.html).toContain("请求失败");

    const applying = renderSettings({
      4: { currentVersion: "2.7.0", latestVersion: "2.7.0", hasUpdate: false, releaseUrl: null },
      5: updateStatus("applying"),
      6: false,
      7: false,
      8: null,
    });
    expect(applying.html).toContain("正在应用");

    const succeeded = renderSettings({
      4: { currentVersion: "2.7.0", latestVersion: "2.7.0", hasUpdate: false, releaseUrl: null },
      5: updateStatus("succeeded"),
      6: false,
      7: false,
      8: null,
    });
    expect(succeeded.html).toContain("应用更新完成");
    expect(succeeded.html).toContain("已完成");

    const unavailable = renderSettings({
      4: null,
      5: { available: false, state: "idle", message: null, requestedAt: null, completedAt: null, currentBuildSha: null, targetBuildSha: null },
      6: false,
      7: false,
      8: null,
    });
    expect(unavailable.html).toContain("未识别");
    expect(unavailable.html).toContain("当前 Fork 基于官方稳定版 -。");

    const fallbacks = renderSettings({
      4: { currentVersion: "2.7.0", latestVersion: null, latestTag: null, releaseUrl: null, hasUpdate: true },
      5: { available: true, state: "succeeded", message: null, requestedAt: null, completedAt: null, currentBuildSha: null, targetBuildSha: null },
      6: false,
      7: false,
      8: null,
    });
    expect(fallbacks.html).toContain("官方已发布 新版本");
    expect(fallbacks.html).toContain("应用已更新。");

    const failedFallback = renderSettings({
      4: { currentVersion: "2.7.0", latestVersion: "2.7.0", latestTag: "v2.7.0", releaseUrl: null, hasUpdate: false },
      5: { available: true, state: "failed", message: null, requestedAt: null, completedAt: null, currentBuildSha: null, targetBuildSha: null },
      6: false,
      7: false,
      8: null,
    });
    expect(failedFallback.html).toContain("应用更新失败，请查看服务器日志。");
  });

  it("finishes immediately for an anonymous visitor and runs effect cleanup", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const view = renderSettings();

    expect(view.html).toContain("未登录");
    expect(view.setters[1]).toHaveBeenCalledWith(false);
    expect(view.switches[0]).toMatchObject({ disabled: true, checked: false });
    expect(fetchMock).not.toHaveBeenCalled();
    view.cleanups[0]();
  });

  it("loads a valid persisted value for an authenticated administrator", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 2,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", vi.fn(async () => response({ allowUnsafeSubscriptionSources: true })));

    const view = renderSettings();
    await flushPromises();

    expect(view.html).toContain("2 / 9");
    expect(view.setters[0]).toHaveBeenCalledWith(true);
    expect(view.setters[1]).toHaveBeenNthCalledWith(1, true);
    expect(view.setters[1]).toHaveBeenLastCalledWith(false);
    expect(view.setters[3]).toHaveBeenCalledWith(null);
    expect(harness.userState.fetchUser).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an unsuccessful response", response({}, false)],
    ["a malformed response", response({ allowUnsafeSubscriptionSources: "yes" })],
  ])("shows a load error for %s", async (_label, fetchResponse) => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 0,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", vi.fn(async () => fetchResponse));

    const view = renderSettings();
    await flushPromises();

    expect(view.setters[3]).toHaveBeenCalledWith("加载失败，请刷新重试");
    expect(view.setters[1]).toHaveBeenLastCalledWith(false);
  });

  it("surfaces an application request failure and disables host updates while signed out", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? response({}, false) : response({ allowUnsafeSubscriptionSources: false })));
    const view = renderSettings();
    const applyButton = view.buttons.find((button) => JSON.stringify(button.children).includes("一键应用已构建更新"));
    await applyButton?.onClick();
    expect(view.setters[8]).toHaveBeenCalledWith("提交更新失败，请稍后重试");

    harness.userState.user = null;
    const signedOut = renderSettings();
    expect(signedOut.html).toContain("未登录");
  });

  it("persists and rolls back the unsafe source setting", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return response({ allowUnsafeSubscriptionSources: true });
      return response({ allowUnsafeSubscriptionSources: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    const success = renderSettings();
    await success.switches[0].onCheckedChange(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/source-import", expect.objectContaining({ method: "PATCH" }));
    expect(success.setters[0]).toHaveBeenLastCalledWith(true);

    vi.stubGlobal("fetch", vi.fn(async () => response({}, false)));
    const failure = renderSettings();
    await failure.switches[0].onCheckedChange(true);
    expect(failure.setters[0]).toHaveBeenLastCalledWith(false);
    expect(failure.setters[3]).toHaveBeenCalledWith("保存失败，请重试");
  });

  it("does not update state after the settings effect is cancelled", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 0,
      quota: { maxSubscriptions: 9 },
    };
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })));

    const view = renderSettings();
    view.cleanups[0]();
    resolveFetch(response({ allowUnsafeSubscriptionSources: true }));
    await flushPromises();

    expect(view.setters[0]).not.toHaveBeenCalled();
    expect(view.setters[1]).toHaveBeenCalledTimes(1);
    expect(view.setters[3]).toHaveBeenCalledTimes(1);
  });

  it("ignores a rejected settings request after cancellation", async () => {
    harness.userState.user = {
      username: "",
      subscriptionCount: 0,
      quota: { maxSubscriptions: 9 },
    };
    let rejectFetch!: (reason: Error) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    })));

    const view = renderSettings();
    expect(view.html).toContain("未登录");
    view.cleanups[0]();
    rejectFetch(new Error("cancelled request"));
    await flushPromises();

    expect(view.setters[3]).toHaveBeenCalledTimes(1);
    expect(view.setters[1]).toHaveBeenCalledTimes(1);
  });

  it("saves a toggle and redirects after logout", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ allowUnsafeSubscriptionSources: false }))
      .mockResolvedValueOnce(response({ allowUnsafeSubscriptionSources: true }));
    vi.stubGlobal("fetch", fetchMock);

    const view = renderSettings();
    await flushPromises();
    view.switches[0].onCheckedChange(true);
    await flushPromises();
    view.buttons.find((button) => button.variant === "destructive")?.onClick();
    await flushPromises();

    expect(fetchMock).toHaveBeenLastCalledWith("/api/settings/source-import", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ allowUnsafeSubscriptionSources: true }),
    }));
    expect(view.setters[0]).toHaveBeenCalledWith(true);
    expect(view.setters[2]).toHaveBeenNthCalledWith(1, true);
    expect(view.setters[2]).toHaveBeenLastCalledWith(false);
    expect(window.location.href).toBe("/login");
  });

  it("stops nested update polling after unmount", async () => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    let rejectFetch!: (reason: Error) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    })));

    const view = renderSettings();
    for (const cleanup of view.cleanups) cleanup();
    rejectFetch(new Error("cancelled"));
    await flushPromises();
    expect(view.setters[8]).not.toHaveBeenCalledWith("更新状态加载失败，请刷新重试");
  });

  it.each([
    ["an unsuccessful save", response({}, false)],
    ["a malformed save", response({ allowUnsafeSubscriptionSources: "yes" })],
  ])("rolls back %s", async (_label, patchResponse) => {
    harness.userState.user = {
      username: "admin",
      subscriptionCount: 1,
      quota: { maxSubscriptions: 9 },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ allowUnsafeSubscriptionSources: true }))
      .mockResolvedValueOnce(patchResponse);
    vi.stubGlobal("fetch", fetchMock);

    const view = renderSettings({ 0: true });
    await flushPromises();
    view.switches[0].onCheckedChange(false);
    await flushPromises();

    expect(view.setters[0]).toHaveBeenCalledWith(false);
    expect(view.setters[0]).toHaveBeenLastCalledWith(true);
    expect(view.setters[3]).toHaveBeenCalledWith("保存失败，请重试");
    expect(view.setters[2]).toHaveBeenLastCalledWith(false);
  });
});
