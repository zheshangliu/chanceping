import crypto from "crypto";
import fs from "fs";
import { Hono, type Context } from "hono";
import {
  defaultIchSubmissionStorePath,
  legacyIchSubmissionStorePath,
} from "../../ich/submission-runtime";
import { IchSubmissionError, IchSubmissionService } from "../../ich/submission-service";
import { IchSubmissionStore } from "../../ich/submission-store";

const MAX_BODY_BYTES = 16 * 1024;
const MIN_FORM_AGE_MS = 1500;
const MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;

export interface IchSubmissionRouteOptions {
  store?: IchSubmissionStore;
  hmacSecret?: string;
  now?: () => Date;
}

export function defaultIchSubmissionStore(): IchSubmissionStore {
  const storePath = defaultIchSubmissionStorePath();
  const store = new IchSubmissionStore(storePath);
  const legacyPath = legacyIchSubmissionStorePath();
  if (storePath !== legacyPath && !fs.existsSync(storePath) && fs.existsSync(legacyPath)) {
    const legacy = new IchSubmissionStore(legacyPath).list();
    if (legacy.length > 0) store.replaceAll(legacy);
  }
  return store;
}

function fixedResponse(c: Context, code: string, message: string, status: 400 | 413 | 429 | 503) {
  return c.json({ error: { code, message } }, status, {
    "Cache-Control": "no-store",
    ...(status === 429 ? { "Retry-After": "600" } : {}),
  });
}

async function readBody(c: Context): Promise<Record<string, unknown>> {
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new IchSubmissionError("VALIDATION_FAILED", "请求体过大");
  }
  const text = await c.req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new IchSubmissionError("VALIDATION_FAILED", "请求体过大");
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object");
    return value as Record<string, unknown>;
  } catch {
    throw new IchSubmissionError("VALIDATION_FAILED", "请求格式无效");
  }
}

function requestFingerprint(c: Context, secret: string): string {
  const forwardedParts = c.req.header("x-forwarded-for")?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  const forwarded = forwardedParts.at(-1) || "unknown";
  const userAgent = c.req.header("user-agent") || "unknown";
  return crypto.createHmac("sha256", secret).update(`${forwarded}\n${userAgent}`).digest("hex");
}

export function ichSubmissionRoutes(options: IchSubmissionRouteOptions = {}): Hono {
  const app = new Hono();
  const service = new IchSubmissionService(options.store ?? defaultIchSubmissionStore());
  const secret = options.hmacSecret ??
    process.env.CHANCEPING_ICH_SUBMISSION_HMAC_SECRET ??
    process.env.CHANCEPING_ICH_ADMIN_TOKEN ??
    "";
  const now = options.now ?? (() => new Date());

  app.post("/submissions", async (c) => {
    if (!secret) return fixedResponse(c, "SUBMISSIONS_DISABLED", "来源提交暂不可用", 503);
    try {
      const body = await readBody(c);
      if (typeof body.website === "string" && body.website.trim()) {
        return c.json({ accepted: true }, 202, { "Cache-Control": "no-store" });
      }
      const startedAt = typeof body.form_started_at === "number"
        ? body.form_started_at
        : Date.parse(String(body.form_started_at ?? ""));
      const age = now().getTime() - startedAt;
      if (!Number.isFinite(startedAt) || age < MIN_FORM_AGE_MS || age > MAX_FORM_AGE_MS) {
        return fixedResponse(c, "INVALID_SUBMISSION", "提交信息无效", 400);
      }
      service.submit(body, {
        fingerprint: requestFingerprint(c, secret),
        now: now(),
      });
      return c.json({ accepted: true }, 202, { "Cache-Control": "no-store" });
    } catch (error) {
      if (error instanceof IchSubmissionError) {
        if (error.code === "RATE_LIMITED") {
          return fixedResponse(c, "RATE_LIMITED", "提交过于频繁，请稍后重试", 429);
        }
        const tooLarge = error.message === "请求体过大";
        return fixedResponse(c, tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_SUBMISSION",
          tooLarge ? "请求体过大" : "提交信息无效", tooLarge ? 413 : 400);
      }
      console.error("[ICH Submission API]", error instanceof Error ? error.message : "unknown error");
      return fixedResponse(c, "SUBMISSION_FAILED", "来源提交失败", 503);
    }
  });

  return app;
}
