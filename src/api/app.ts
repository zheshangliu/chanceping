import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { AppContext } from "./context";
import { createAppContext } from "./context";
import { chatRoutes } from "./routes/chat";
import { opportunityRoutes } from "./routes/opportunities";
import { searchRoutes } from "./routes/search";
import { reminderRoutes } from "./routes/reminders";
import { watchRulesRoutes } from "./routes/watch-rules";
import { reportRoutes } from "./routes/reports";
import { schedulerRoutes } from "./routes/scheduler";
import { reviewRoutes } from "./routes/review";
import { webUiRoutes } from "./routes/web-ui";
import { uploadRoutes } from "./routes/upload";
import { radarsRoutes } from "./routes/radars";
import { radarChatRoutes } from "./routes/radar-chats";
import { radarJobRoutes } from "./routes/radar-jobs";
import { publicAiEventsRoutes } from "./routes/public-ai-events";
import { publicWelfareOpportunityRoutes } from "./routes/public-welfare-opportunities";
import { businessRadarRoutes } from "./routes/business-radar";
import { businessWorkflowRoutes } from "./routes/business-workflows";
import { businessProfileRoutes } from "./routes/business-profiles";
import { businessOperationsRoutes } from "./routes/business-operations";
import { publicIchRoutes } from "./routes/public-ich";
import { ichPagesRoutes } from "./routes/ich-pages";
import { internalIchRoutes } from "./routes/internal-ich";
import { ichAdminPagesRoutes } from "./routes/ich-admin-pages";
import { ichSubmissionRoutes } from "./routes/ich-submissions";
import { internalIchSubmissionRoutes } from "./routes/internal-ich-submissions";
import { internalIchOperationsRoutes } from "./routes/internal-ich-operations";
import type { ApiResponse } from "./types";
import { createHeadHunterApi } from "../headhunter/api/headhunter-api";
import { createHeadHunterApiContext } from "../headhunter/api/context";

/** 从 package.json 读取版本号（启动时一次性读取，避免每次请求读文件） */
const APP_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
})();

export function createApp(context?: AppContext): Hono {
  const ctx = context ?? createAppContext();
  const app = new Hono();

  // 中间件
  app.use("*", logger());
  app.use("*", cors());

  // 健康检查
  app.get("/health", (c) => {
    return c.json({
      success: true,
      data: { status: "ok", version: APP_VERSION },
      error: null,
      duration_ms: 0,
    } satisfies ApiResponse);
  });

  // 注册路由
  app.route("/api/chat", chatRoutes(ctx));
  app.route("/api/opportunities", opportunityRoutes(ctx));
  app.route("/api/search", searchRoutes(ctx));
  app.route("/api/reminders", reminderRoutes(ctx));
  app.route("/api/watch-rules", watchRulesRoutes(ctx));
  app.route("/api/reports", reportRoutes(ctx));
  app.route("/api/scheduler", schedulerRoutes(ctx));
  app.route("/api/review", reviewRoutes(ctx));
  app.route("/api/upload", uploadRoutes(ctx));
  app.route("/api/radars", radarsRoutes(ctx));
  app.route("/api/radar-chats", radarChatRoutes(ctx));
  app.route("/api/radar-jobs", radarJobRoutes(ctx));
  app.route("/api/public", publicAiEventsRoutes(ctx));
  app.route("/api/public/welfare", publicWelfareOpportunityRoutes());
  app.route("/api/business", businessRadarRoutes());
  app.route("/api/business/workflows", businessWorkflowRoutes());
  app.route("/api/business/profiles", businessProfileRoutes());
  app.route("/api/business/operations", businessOperationsRoutes());
  app.route("/api/public/ich", publicIchRoutes());
  app.route("/api/public/ich", ichSubmissionRoutes());
  app.route("/api/internal/ich", internalIchRoutes());
  app.route("/api/internal/ich", internalIchSubmissionRoutes());
  app.route("/api/internal/ich", internalIchOperationsRoutes());
  // Finance is mounted with admin auth, or explicitly as read-only public mode.
  const financePublicMode = process.env.FINANCE_PUBLIC_MODE === "true";
  const financeConfigured = financePublicMode || Boolean(process.env.FINANCE_ADMIN_USERNAME && process.env.FINANCE_ADMIN_PASSWORD_HASH && process.env.FINANCE_SESSION_SECRET);
  const financeContext = financeConfigured ? createHeadHunterApiContext() : undefined;
  if (financeConfigured) {
    app.route("/api/finance", createHeadHunterApi({ context: financeContext }));
  }
  app.route("/ich/admin", ichAdminPagesRoutes());
  app.route("/ich", ichPagesRoutes());

  // Web UI 静态文件服务（根路径）
  app.route("/", webUiRoutes(financeContext));

  // 全局错误处理
  app.onError((err, c) => {
    console.error("[API Error]", err);
    return c.json({
      success: false, data: null,
      error: { code: "INTERNAL_ERROR", message: err.message },
      duration_ms: 0,
    } satisfies ApiResponse, 500);
  });

  // 404 处理
  app.notFound((c) => {
    return c.json({
      success: false, data: null,
      error: { code: "NOT_FOUND", message: `路径不存在: ${c.req.method} ${c.req.path}` },
      duration_ms: 0,
    } satisfies ApiResponse, 404);
  });

  return app;
}
