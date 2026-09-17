import crypto from "node:crypto";
import { Hono } from "hono";
import { buildIchOperationsDashboard } from "../../ich/operations-dashboard-v1";

export interface IchInternalOperationsRouteOptions {
  adminToken?: string;
  rootDirectory?: string;
  storePath?: string;
  now?: () => Date;
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function internalIchOperationsRoutes(options: IchInternalOperationsRouteOptions = {}): Hono {
  const app = new Hono();
  const expectedToken = options.adminToken ?? process.env.CHANCEPING_ICH_ADMIN_TOKEN ?? "";
  app.use("*", async (c, next) => {
    if (!expectedToken) return c.json({ error: { code: "ADMIN_DISABLED", message: "非遗管理接口尚未启用" } }, 503);
    const authorization = c.req.header("authorization") ?? "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!supplied || !secureEqual(supplied, expectedToken)) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "需要有效的非遗管理凭据" } }, 401);
    }
    await next();
  });
  app.get("/operations", (c) => c.json(buildIchOperationsDashboard({
    rootDirectory: options.rootDirectory,
    storePath: options.storePath,
    now: options.now?.() ?? new Date(),
  })));
  return app;
}
