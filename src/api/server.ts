import { serve } from "@hono/node-server";
import { loadLocalApiEnv } from "../config/local-env";

async function main(): Promise<void> {
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

  const port = parseInt(process.env.PORT ?? "3000", 10);
  // V1.6-02: 显式创建 ctx，供 Scheduler 复用
  const ctx = createAppContext();
  const app = createApp(ctx);

  console.log(`[ChancePing API] 服务器启动中...`);
  console.log(`[ChancePing API] 端口: ${port}`);
  console.log(`[ChancePing API] 健康检查: http://localhost:${port}/health`);

  // V1.6-02 新增：启动 Scheduler tick 循环（60s 间隔）
  // V1.6a 自检修复:增加 isTicking 守卫,避免 tick 重叠执行
  const scheduler = new Scheduler(ctx);
  let isTicking = false;
  setInterval(() => {
    if (isTicking) return; // 前一个 tick 未完成,跳过
    isTicking = true;
    scheduler.tick().catch((err) => {
      console.error("[Scheduler] tick 异常:", err);
    }).finally(() => {
      isTicking = false;
    });
  }, 60_000);
  console.log(`[Scheduler] 已启动，间隔 60s`);

  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`[ChancePing API] 服务器已启动`);
}

main().catch((err) => {
  console.error("[ChancePing API] 启动失败:", err);
  process.exit(1);
});
