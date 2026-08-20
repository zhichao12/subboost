"use client";

import * as React from "react";
import { Network, ServerCog, ShieldCheck } from "lucide-react";

import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";

type ReleaseStatus = {
  currentVersion?: unknown;
  latestVersion?: unknown;
  latestTag?: unknown;
  releaseUrl?: unknown;
  hasUpdate?: unknown;
};

type AppUpdateStatus = {
  available?: unknown;
  state?: unknown;
  message?: unknown;
  requestedAt?: unknown;
  completedAt?: unknown;
  currentBuildSha?: unknown;
  targetBuildSha?: unknown;
};

type UpdateState = "idle" | "applying" | "succeeded" | "failed";

type NormalizedReleaseStatus = {
  currentVersion: string | null;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  hasUpdate: boolean;
};

type NormalizedAppUpdateStatus = {
  available: boolean;
  state: UpdateState;
  message: string | null;
  currentBuildSha: string | null;
  targetBuildSha: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeReleaseStatus(status: ReleaseStatus): NormalizedReleaseStatus {
  return {
    currentVersion: readString(status.currentVersion),
    latestVersion: readString(status.latestVersion),
    latestTag: readString(status.latestTag),
    releaseUrl: readString(status.releaseUrl),
    hasUpdate: status.hasUpdate === true,
  };
}

function normalizeAppUpdateStatus(status: AppUpdateStatus): NormalizedAppUpdateStatus {
  const state = status.state;
  return {
    available: status.available === true,
    state: state === "applying" || state === "succeeded" || state === "failed" ? state : "idle",
    message: readString(status.message),
    currentBuildSha: readString(status.currentBuildSha),
    targetBuildSha: readString(status.targetBuildSha),
  };
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 7) : "未识别";
}

export function AppUpdateCard({ disabled = false }: { disabled?: boolean }) {
  const [release, setRelease] = React.useState<NormalizedReleaseStatus | null>(null);
  const [update, setUpdate] = React.useState<NormalizedAppUpdateStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [checkResult, setCheckResult] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [releaseResponse, updateResponse] = await Promise.all([
      fetch("/api/releases/latest", { cache: "no-store" }),
      fetch("/api/app-update", { cache: "no-store" }),
    ]);

    if (!releaseResponse.ok || !updateResponse.ok) throw new Error("更新状态加载失败");
    const nextRelease = normalizeReleaseStatus((await releaseResponse.json()) as ReleaseStatus);
    const nextUpdate = normalizeAppUpdateStatus((await updateResponse.json()) as AppUpdateStatus);
    setRelease(nextRelease);
    setUpdate(nextUpdate);
    return { release: nextRelease, update: nextUpdate };
  }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    setError(null);
    try {
      const { release: nextRelease } = await refresh();
      setCheckResult(
        nextRelease.hasUpdate
          ? `发现官方新版本：${nextRelease.latestTag ?? nextRelease.latestVersion ?? "新版本"}。请先同步 Fork 并等待镜像构建完成。`
          : nextRelease.latestTag
            ? `已是官方最新版本：当前 ${nextRelease.currentVersion ?? "未识别"}，上游 ${nextRelease.latestTag}。`
            : "暂时无法获取官方版本信息，请稍后重试。",
      );
    } catch {
      setError("检查更新失败，请稍后重试");
      setCheckResult(null);
    } finally {
      setChecking(false);
    }
  };

  React.useEffect(() => {
    if (disabled) {
      setLoading(false);
      return;
    }

    let active = true;
    void refresh()
      .catch(() => {
        if (active) setError("更新状态加载失败，请刷新重试");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [disabled, refresh]);

  React.useEffect(() => {
    if (update?.state !== "applying") return;
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 3000);
    return () => window.clearInterval(timer);
  }, [refresh, update?.state]);

  const applyUpdate = async () => {
    setApplying(true);
    setError(null);
    try {
      const response = await fetch("/api/app-update", { method: "POST" });
      if (!response.ok) throw new Error("提交更新失败");
      setUpdate(normalizeAppUpdateStatus((await response.json()) as AppUpdateStatus));
    } catch {
      setError("提交更新失败，请稍后重试");
    } finally {
      setApplying(false);
    }
  };

  const upstreamMessage = release?.hasUpdate
    ? `官方已发布 ${release.latestTag ?? release.latestVersion ?? "新版本"}，请先同步 Fork 并等待镜像构建完成。`
    : `当前 Fork 基于官方稳定版 ${release?.latestTag ?? release?.currentVersion ?? "-"}。`;
  const stateMessage =
    update?.state === "applying"
      ? "正在拉取并重建应用，页面将短暂重连。"
      : update?.state === "succeeded"
        ? update.message ?? "应用已更新。"
        : update?.state === "failed"
          ? update.message ?? "应用更新失败，请查看服务器日志。"
          : "会拉取 Fork 已构建的最新镜像；数据库和订阅数据不会变更。";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="rounded-lg bg-violet-500/20 p-2 text-violet-300">
          {release?.hasUpdate ? <ShieldCheck className="h-5 w-5" /> : <ServerCog className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">应用更新</CardTitle>
          <p className="mt-1 text-xs text-white/50">官方版本检测与自定义镜像部署</p>
        </div>
        {update?.state === "succeeded" && <ShieldCheck className="h-5 w-5 text-emerald-400" aria-label="应用已更新" />}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-white/40">当前构建</p>
            <code className="mt-1 block rounded-md bg-white/5 px-3 py-2 text-white/70">{shortSha(update?.currentBuildSha ?? null)}</code>
          </div>
          <div>
            <p className="text-xs text-white/40">官方最新版</p>
            <p className="mt-1 rounded-md bg-white/5 px-3 py-2 text-white/70">{release?.latestTag ?? "检查中"}</p>
          </div>
          <div>
            <p className="text-xs text-white/40">更新状态</p>
            <p className="mt-1 rounded-md bg-white/5 px-3 py-2 text-white/70">
              {loading ? "检查中" : update?.state === "applying" ? "正在应用" : update?.state === "succeeded" ? "已完成" : "待命"}
            </p>
          </div>
        </div>

        <p className={release?.hasUpdate ? "text-sm text-amber-300" : "text-sm text-white/60"}>{upstreamMessage}</p>
        <p className={update?.state === "failed" ? "text-sm text-red-300" : "text-sm text-white/50"}>{stateMessage}</p>
        <p className="text-xs text-white/50" aria-live="polite">
          {checking ? "正在检查官方版本..." : checkResult ?? "点击“检查更新”可立即确认是否有可用版本。"}
        </p>
        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => void checkForUpdates()} disabled={loading || checking || applying || disabled}>
            <ServerCog className="h-4 w-4" />
            {checking ? "正在检查" : "检查更新"}
          </Button>
          <Button className="gap-2" onClick={() => void applyUpdate()} disabled={!update?.available || applying || update?.state === "applying" || disabled}>
            <ServerCog className="h-4 w-4" />
            {applying || update?.state === "applying" ? "正在应用" : "一键应用已构建更新"}
          </Button>
          {release?.hasUpdate && release.releaseUrl && (
            <Button variant="outline" className="gap-2" asChild>
              <a href={release.releaseUrl} target="_blank" rel="noreferrer">
                <Network className="h-4 w-4" />
                查看上游更新
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
