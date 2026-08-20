import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAppUpdateStatus, requestAppUpdate } from "./app-update";

const originalEnvironment = { ...process.env };
let directory = "";

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "subboost-updater-"));
  process.env.SUBBOOST_UPDATER_DIR = directory;
  process.env.SUBBOOST_UPDATER_TOKEN = "test-updater-token";
  process.env.APP_BUILD_SHA = "current-sha";
});

afterEach(async () => {
  process.env = { ...originalEnvironment };
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("app update requests", () => {
  it("reports an idle updater when no status file exists", async () => {
    await expect(getAppUpdateStatus()).resolves.toMatchObject({
      available: true,
      state: "idle",
      currentBuildSha: "current-sha",
    });
  });

  it("writes a signed request that the host updater can validate", async () => {
    const status = await requestAppUpdate();
    const request = await readFile(path.join(directory, "request"), "utf8");
    const values = Object.fromEntries(
      request
        .trim()
        .split("\n")
        .map((line) => line.split("=", 2))
    );

    expect(status).toMatchObject({ available: true, state: "applying", requestedAt: values.requested_at });
    expect(values.signature).toBe(
      createHmac("sha256", "test-updater-token")
        .update(`${values.requested_at}\n${values.nonce}`)
        .digest("hex")
    );
  });

  it("reads the limited status format written by the host updater", async () => {
    await writeFile(
      path.join(directory, "status"),
      "state=succeeded\nmessage=应用已更新\nrequested_at=2026-08-20T00:00:00.000Z\ncompleted_at=2026-08-20T00:01:00.000Z\ncurrent_build_sha=old\ntarget_build_sha=new\nignored=value\n"
    );
    await expect(getAppUpdateStatus()).resolves.toEqual({
      available: true,
      state: "succeeded",
      message: "应用已更新",
      requestedAt: "2026-08-20T00:00:00.000Z",
      completedAt: "2026-08-20T00:01:00.000Z",
      currentBuildSha: "old",
      targetBuildSha: "new",
    });
  });

  it("treats malformed status data as idle", async () => {
    await writeFile(
      path.join(directory, "status"),
      "state=not-valid\nmessage=ignored\nrequested_at=invalid\ncompleted_at=invalid\ncurrent_build_sha=\ntarget_build_sha=\n"
    );
    await expect(getAppUpdateStatus()).resolves.toMatchObject({
      state: "idle",
      message: "ignored",
      requestedAt: "invalid",
      completedAt: "invalid",
      currentBuildSha: "current-sha",
      targetBuildSha: null,
    });
  });

  it("disables the feature when updater settings are absent", async () => {
    delete process.env.SUBBOOST_UPDATER_DIR;
    delete process.env.SUBBOOST_UPDATER_TOKEN;

    await expect(getAppUpdateStatus()).resolves.toEqual({
      available: false,
      state: "idle",
      message: null,
      requestedAt: null,
      completedAt: null,
      currentBuildSha: "current-sha",
      targetBuildSha: null,
    });
    await expect(requestAppUpdate()).rejects.toThrow("应用更新器尚未启用");
  });
});
