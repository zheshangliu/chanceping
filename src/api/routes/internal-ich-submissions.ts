import crypto from "crypto";
import path from "path";
import { Hono, type Context } from "hono";
import { IchPublicationError } from "../../ich/publication-service";
import {
  IchSubmissionAcceptanceService,
  IchSubmissionError,
  IchSubmissionService,
} from "../../ich/submission-service";
import type { IchSourceSubmissionStatus } from "../../ich/submission-types";
import type { IchOpportunity } from "../../ich/types";
import { defaultIchStore, type IchReadRouteOptions } from "./public-ich";
import { defaultIchSubmissionStore } from "./ich-submissions";
import type { IchSubmissionStore } from "../../ich/submission-store";

const MAX_BODY_BYTES = 256 * 1024;

export interface IchInternalSubmissionRouteOptions extends IchReadRouteOptions {
  submissionStore?: IchSubmissionStore;
  transactionPath?: string;
  adminToken?: string;
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new IchSubmissionError("VALIDATION_FAILED", "请求体不得超过 256 KiB");
  }
  const text = await c.req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new IchSubmissionError("VALIDATION_FAILED", "请求体不得超过 256 KiB");
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object");
    return value as Record<string, unknown>;
  } catch {
    throw new IchSubmissionError("VALIDATION_FAILED", "请求体必须是 JSON 对象");
  }
}

function actor(c: Context): string {
  return c.req.header("x-ich-actor") || "ich-admin";
}

export function internalIchSubmissionRoutes(options: IchInternalSubmissionRouteOptions = {}): Hono {
  const app = new Hono();
  const submissionStore = options.submissionStore ?? defaultIchSubmissionStore();
  const opportunityStore = options.store ?? defaultIchStore();
  const service = new IchSubmissionService(submissionStore);
  const acceptance = new IchSubmissionAcceptanceService(
    submissionStore,
    opportunityStore,
    options.transactionPath ??
      process.env.CHANCEPING_ICH_SUBMISSION_TRANSACTION_PATH ??
      path.resolve(process.cwd(), "data/ich-submission-accept.transaction.json"),
  );
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
    if (error instanceof IchSubmissionError || error instanceof IchPublicationError) {
      const status = error.code === "NOT_FOUND" ? 404 :
        ["CONFLICT", "INVALID_STATE"].includes(error.code) ? 409 : 400;
      return c.json({ error: { code: error.code, message: error.message, details: error.details } }, status as 400);
    }
    console.error("[ICH Internal Submission API]", error instanceof Error ? error.message : "unknown error");
    return c.json({ error: { code: "INTERNAL_ERROR", message: "来源审核操作失败" } }, 500);
  });

  app.get("/submissions", (c) => {
    const status = c.req.query("status");
    const page = Number(c.req.query("page") ?? "1");
    const pageSize = Number(c.req.query("page_size") ?? "50");
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return c.json({ error: { code: "INVALID_QUERY", message: "分页参数无效" } }, 400);
    }
    const filtered = service.list().filter((item) => !status || item.status === status);
    const start = (page - 1) * pageSize;
    return c.json({
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      page_size: pageSize,
      total_pages: filtered.length === 0 ? 0 : Math.ceil(filtered.length / pageSize),
    });
  });

  app.get("/submissions/:id", (c) => c.json(service.get(c.req.param("id"))));

  for (const status of ["rejected", "duplicate", "spam"] as const satisfies ReadonlyArray<IchSourceSubmissionStatus>) {
    app.post(`/submissions/:id/${status === "rejected" ? "reject" : status}`, async (c) => {
      const body = await readJson(c);
      return c.json(service.review(c.req.param("id"), status, actor(c), body.reason, now()));
    });
  }

  app.post("/submissions/:id/accept", async (c) => {
    const body = await readJson(c);
    if (!body.opportunity || typeof body.opportunity !== "object" || Array.isArray(body.opportunity)) {
      throw new IchSubmissionError("VALIDATION_FAILED", "opportunity 对象不能为空");
    }
    return c.json(acceptance.accept(c.req.param("id"), body.opportunity as IchOpportunity, {
      actor: actor(c),
      now: now(),
    }));
  });

  return app;
}
