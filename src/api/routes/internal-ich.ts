import crypto from "crypto";
import { Hono, type Context } from "hono";
import { IchPublicationError, IchPublicationService } from "../../ich/publication-service";
import type { IchOpportunity, IchWorkflowEvent, IchWorkflowState } from "../../ich/types";
import { defaultIchStore, type IchReadRouteOptions } from "./public-ich";

export interface IchInternalRouteOptions extends IchReadRouteOptions {
  adminToken?: string;
}

const MAX_BODY_BYTES = 256 * 1024;

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new IchPublicationError("VALIDATION_FAILED", "请求体不得超过 256 KiB");
  }
  const text = await c.req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new IchPublicationError("VALIDATION_FAILED", "请求体不得超过 256 KiB");
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
    return parsed as Record<string, unknown>;
  } catch {
    throw new IchPublicationError("VALIDATION_FAILED", "请求体必须是 JSON 对象");
  }
}

function actor(c: Context): string {
  return c.req.header("x-ich-actor") || "ich-admin";
}

function statusFor(error: IchPublicationError): 400 | 404 | 409 {
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "CONFLICT" || error.code === "INVALID_STATE") return 409;
  return 400;
}

function actionFor(path: string): { to: IchWorkflowState; action: IchWorkflowEvent["action"] } | null {
  const actions: Record<string, { to: IchWorkflowState; action: IchWorkflowEvent["action"] }> = {
    "submit-review": { to: "pending_review", action: "submitted" },
    approve: { to: "approved", action: "approved" },
    reject: { to: "rejected", action: "rejected" },
    publish: { to: "published", action: "published" },
    withdraw: { to: "withdrawn", action: "withdrawn" },
    archive: { to: "archived", action: "archived" },
    restore: { to: "draft", action: "restored" },
  };
  return actions[path] ?? null;
}

export function internalIchRoutes(options: IchInternalRouteOptions = {}): Hono {
  const app = new Hono();
  const service = new IchPublicationService(options.store ?? defaultIchStore());
  const expectedToken = options.adminToken ?? process.env.CHANCEPING_ICH_ADMIN_TOKEN ?? "";
  const now = options.now ?? (() => new Date());

  app.use("*", async (c, next) => {
    if (!expectedToken) return c.json({ error: { code: "ADMIN_DISABLED", message: "非遗管理接口尚未启用" } }, 503);
    const authorization = c.req.header("authorization") ?? "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!supplied || !secureEqual(supplied, expectedToken)) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "需要有效的非遗管理凭据" } }, 401);
    }
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof IchPublicationError) {
      return c.json({
        error: { code: error.code, message: error.message, details: error.details },
      }, statusFor(error));
    }
    console.error("[ICH Internal API]", error instanceof Error ? error.message : "unknown error");
    return c.json({ error: { code: "INTERNAL_ERROR", message: "非遗管理操作失败" } }, 500);
  });

  app.get("/opportunities", (c) => {
    const state = c.req.query("state");
    const items = service.list().filter((item) => !state || item.workflow.state === state);
    return c.json({ items, total: items.length });
  });

  app.get("/opportunities/:id", (c) => c.json(service.get(c.req.param("id"))));

  app.post("/opportunities", async (c) => {
    const body = await readJson(c);
    const opportunity = body.opportunity;
    if (!opportunity || typeof opportunity !== "object" || Array.isArray(opportunity)) {
      throw new IchPublicationError("VALIDATION_FAILED", "opportunity 对象不能为空");
    }
    const created = service.create(opportunity as IchOpportunity, { actor: actor(c), now: now() });
    return c.json(created, 201);
  });

  app.put("/opportunities/:id", async (c) => {
    const body = await readJson(c);
    const patch = body.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new IchPublicationError("VALIDATION_FAILED", "patch 对象不能为空");
    }
    return c.json(service.update(c.req.param("id"), patch as Partial<IchOpportunity>, {
      actor: actor(c),
      now: now(),
      expectedRevision: Number(body.expected_revision),
    }));
  });

  app.post("/opportunities/:id/:action", async (c) => {
    const target = actionFor(c.req.param("action"));
    if (!target) return c.json({ error: { code: "NOT_FOUND", message: "管理操作不存在" } }, 404);
    const body = await readJson(c);
    return c.json(service.transition(c.req.param("id"), target.to, target.action, {
      actor: actor(c),
      now: now(),
      expectedRevision: Number(body.expected_revision),
      reason: typeof body.reason === "string" ? body.reason : null,
    }));
  });

  return app;
}
