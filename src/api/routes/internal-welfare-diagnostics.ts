import crypto from "node:crypto";
import { Hono } from "hono";
import { buildWelfareFunnelDiagnostics } from "../../public/welfare-opportunities";

function secureEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function internalWelfareDiagnosticsRoutes(): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const expected = process.env.CHANCEPING_WELFARE_DIAGNOSTICS_TOKEN ?? "";
    if (!expected) return c.json({ error: { code: "DIAGNOSTICS_DISABLED", message: "福利漏斗诊断接口尚未启用" } }, 503);
    const supplied = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!supplied || !secureEqual(supplied, expected)) return c.json({ error: { code: "UNAUTHORIZED", message: "需要有效的诊断凭据" } }, 401);
    await next();
  });
  app.get("/funnel", (c) => c.json({ success: true, data: buildWelfareFunnelDiagnostics(), error: null }));
  app.get("/sources/health", (c) => c.json({ success: true, data: buildWelfareFunnelDiagnostics().sources, error: null }));
  return app;
}
