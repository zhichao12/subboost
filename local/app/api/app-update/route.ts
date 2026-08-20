import { withCurrentAdmin } from "@local/lib/api-auth";
import { getAppUpdateStatus, requestAppUpdate } from "@local/lib/app-update";
import { apiError, json } from "@local/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withCurrentAdmin(async () => json(await getAppUpdateStatus()));
}

export async function POST() {
  return withCurrentAdmin(async () => {
    try {
      return json(await requestAppUpdate(), 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交应用更新失败";
      return apiError(message, "CONFIGURATION_ERROR", 503);
    }
  });
}
