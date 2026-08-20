import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppUpdateStatus: vi.fn(),
  requestAppUpdate: vi.fn(),
  withCurrentAdmin: vi.fn(),
}));

vi.mock("@local/lib/api-auth", () => ({
  withCurrentAdmin: mocks.withCurrentAdmin,
}));

vi.mock("@local/lib/app-update", () => ({
  getAppUpdateStatus: mocks.getAppUpdateStatus,
  requestAppUpdate: mocks.requestAppUpdate,
}));

import { GET, POST } from "./route";

async function readJson(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe("application update route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withCurrentAdmin.mockImplementation(async (handler: () => Promise<Response>) => handler());
  });

  it("returns the restricted updater status to an administrator", async () => {
    mocks.getAppUpdateStatus.mockResolvedValue({ available: true, state: "idle" });

    await expect(readJson(await GET())).resolves.toEqual({
      status: 200,
      body: { available: true, state: "idle" },
    });
  });

  it("accepts an update request and returns accepted status", async () => {
    mocks.requestAppUpdate.mockResolvedValue({ available: true, state: "applying" });

    await expect(readJson(await POST())).resolves.toEqual({
      status: 202,
      body: { available: true, state: "applying" },
    });
  });

  it("returns a safe error when the host updater rejects a request", async () => {
    mocks.requestAppUpdate.mockRejectedValue(new Error("应用更新器尚未启用"));

    await expect(readJson(await POST())).resolves.toEqual({
      status: 503,
      body: { error: "应用更新器尚未启用", code: "CONFIGURATION_ERROR" },
    });
  });

  it("returns the fallback error for non-Error failures", async () => {
    mocks.requestAppUpdate.mockRejectedValue("worker unavailable");

    await expect(readJson(await POST())).resolves.toEqual({
      status: 503,
      body: { error: "提交应用更新失败", code: "CONFIGURATION_ERROR" },
    });
  });
});
