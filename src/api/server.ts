import { serve } from "@hono/node-server";
import fs from "fs";
import path from "path";
import { loadLocalApiEnv } from "../config/local-env";
import { getDataMode, getLlmMode } from "../demo/data-mode";

function loadEnvFile(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  let loaded = 0;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
      loaded++;
    }
  }
  console.log(`[ChancePing API] 已加载 .env 文件（${loaded} 个新变量）`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const localEnv = loadLocalApiEnv();
  if (localEnv.loaded) {
    console.log(`[ChancePing API] 已加载本地 api.env（${localEnv.keysLoaded.length} 个新变量）`);
  } else if (process.env.CHANCEPING_LOAD_API_ENV === "true") {
    console.log(`[ChancePing API] 未加载 api.env：${localEnv.reason}`);
  }

  const [{ createApp }, { createAppContext }, { Scheduler }] = await Promise.all([
    import("./app"),
    import("./context"),
    import("../scheduler/scheduler"),
  ]);

  console.log(`[ChancePing API] 数据模式: ${getDataMode()} | LLM 模式: ${getLlmMode()}`);

  const port = parseInt(process.env.PORT ?? "3000", 10);
  const ctx = createAppContext();
  const app = createApp(ctx);

  console.log(`[ChancePing API] 服务器启动中...`);
  console.log(`[ChancePing API] 端口: ${port}`);
  console.log(`[ChancePing API] 健康检查: http://localhost:${port}/health`);

  const scheduler = new Scheduler(ctx);
  let isTicking = false;
  setInterval(() => {
    if (isTicking) return;
    isTicking = true;
    scheduler.tick().catch((err) => {
      console.error("[Scheduler] tick 异常:", err);
    }).finally(() => {
      isTicking = false;
    });
  }, 60_000);
  console.log(`[Scheduler] 已启动，间隔 60s`);

  serve({ fetch: app.fetch, port });
  console.log(`[ChancePing API] 服务器已启动`);
}

main().catch((err) => {
  console.error("[ChancePing API] 启动失败:", err);
  process.exit(1);
});
