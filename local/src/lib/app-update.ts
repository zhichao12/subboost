import { createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type UpdateState = "idle" | "applying" | "succeeded" | "failed";

type UpdaterStatus = {
  available: boolean;
  state: UpdateState;
  message: string | null;
  requestedAt: string | null;
  completedAt: string | null;
  currentBuildSha: string | null;
  targetBuildSha: string | null;
};

type UpdaterConfig = {
  directory: string;
  token: string;
};

const REQUEST_FILE = "request";
const STATUS_FILE = "status";
const ALLOWED_STATUS_KEYS = new Set([
  "state",
  "message",
  "requested_at",
  "completed_at",
  "current_build_sha",
  "target_build_sha",
]);

function readString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function getUpdaterConfig(): UpdaterConfig | null {
  const directory = readString(process.env.SUBBOOST_UPDATER_DIR);
  const token = readString(process.env.SUBBOOST_UPDATER_TOKEN);
  return directory && token ? { directory, token } : null;
}

function parseStatus(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    if (!ALLOWED_STATUS_KEYS.has(key)) continue;
    values[key] = line.slice(separator + 1).trim();
  }
  return values;
}

function toStatus(config: UpdaterConfig | null, values: Record<string, string>): UpdaterStatus {
  const state = values.state;
  return {
    available: Boolean(config),
    state: state === "applying" || state === "succeeded" || state === "failed" ? state : "idle",
    message: values.message || null,
    requestedAt: values.requested_at || null,
    completedAt: values.completed_at || null,
    currentBuildSha: values.current_build_sha || readString(process.env.APP_BUILD_SHA),
    targetBuildSha: values.target_build_sha || null,
  };
}

export async function getAppUpdateStatus(): Promise<UpdaterStatus> {
  const config = getUpdaterConfig();
  if (!config) return toStatus(null, {});

  try {
    const content = await readFile(path.join(config.directory, STATUS_FILE), "utf8");
    return toStatus(config, parseStatus(content));
  } catch {
    return toStatus(config, {});
  }
}

export async function requestAppUpdate(): Promise<UpdaterStatus> {
  const config = getUpdaterConfig();
  if (!config) throw new Error("应用更新器尚未启用");

  const requestedAt = new Date().toISOString();
  const nonce = randomUUID();
  const signature = createHmac("sha256", config.token).update(`${requestedAt}\n${nonce}`).digest("hex");
  const content = `requested_at=${requestedAt}\nnonce=${nonce}\nsignature=${signature}\n`;
  const temporaryPath = path.join(config.directory, `${REQUEST_FILE}.${nonce}.tmp`);
  const requestPath = path.join(config.directory, REQUEST_FILE);

  await mkdir(config.directory, { recursive: true });
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, requestPath);

  return {
    available: true,
    state: "applying",
    message: "已提交更新，服务正在重启",
    requestedAt,
    completedAt: null,
    currentBuildSha: readString(process.env.APP_BUILD_SHA),
    targetBuildSha: null,
  };
}
