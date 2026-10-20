import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Hono } from "hono";
import type { Context } from "hono";
import { readOpportunityV2Pool } from "../../opportunity-v2/opportunity-pool";
import { readOpportunityV2Sources } from "../../opportunity-v2/source-pool";
import { readOpportunityV2Translations } from "../../opportunity-v2/display";
import { readAgentRequest } from "../../ich/agent/intent";
import { IchAgentBudget } from "../../ich/agent/budget";
import { runIchAgentTurn, type IchAgentServiceOptions } from "../../ich/agent/orchestrator";
import { createIchAgentSessionStore, type IchAgentTurnRecord } from "../../ich/agent/session-store";
import type { IchAgentTurnResponse } from "../../ich/agent/contracts";
import type { OpportunityV2, OpportunityV2Source } from "../../opportunity-v2/types";

const COOKIE_NAME = "ich_agent_session";
const COOKIE_PATH = "/api/public/ich/agent";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_DAILY_BUDGET_CNY = 5;

export interface IchAgentRouteOptions extends Partial<Pick<IchAgentServiceOptions, "search" | "fetchPage" | "translateTitles" | "deepseek">> {
  enabled?: boolean;
  webEnabled?: boolean;
  allowedOrigins?: string[];
  now?: () => Date;
  poolPath?: string;
  sourcesPath?: string;
  translationsPath?: string;
  stateDir?: string;
  dailyBudgetCny?: number;
  opportunities?: OpportunityV2[];
  sources?: OpportunityV2Source[];
  store?: ReturnType<typeof createIchAgentSessionStore>;
  budget?: IchAgentBudget;
  secureCookies?: boolean;
  env?: NodeJS.ProcessEnv;
}

async function readLimitedJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: number; code: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) return { ok: false, status: 415, code: "JSON_REQUIRED" };
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false, status: 413, code: "BODY_TOO_LARGE" };
  if (!request.body) return { ok: false, status: 400, code: "INVALID_JSON" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, code: "BODY_TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, code: "INVALID_JSON" };
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown };
  } catch {
    return { ok: false, status: 400, code: "INVALID_JSON" };
  }
}

function publicError(code: string, status: 400 | 403 | 404 | 409 | 413 | 415 | 429 | 503) {
  return new Response(JSON.stringify({ error: { code } }), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function findCachedResponse(session: ReturnType<ReturnType<typeof createIchAgentSessionStore>["get"]>, requestId: string): IchAgentTurnResponse | undefined {
  if (!session) return undefined;
  const longLived = session.idempotency_responses.get(requestId);
  if (longLived) return longLived;
  for (let i = session.turns.length - 1; i >= 0; i--) {
    const cached = session.turns[i].response_by_request_id.get(requestId);
    if (cached) return cached;
  }
  return undefined;
}

export function createIchAgentRoutes(options: IchAgentRouteOptions = {}): Hono {
  const app = new Hono();
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const store = options.store ?? createIchAgentSessionStore({ now });
  const configuredBudget = Math.max(0, Math.min(MAX_DAILY_BUDGET_CNY, options.dailyBudgetCny ?? Number(env.CHANCEPING_ICH_AGENT_DAILY_BUDGET_CNY || 0)));
  const budget = options.budget ?? new IchAgentBudget({ stateDir: options.stateDir, dailyBudgetCny: configuredBudget, now, env });
  const allowedOrigins = new Set((options.allowedOrigins ?? String(env.CHANCEPING_ICH_AGENT_ALLOWED_ORIGINS || "https://ich.chanceping.com").split(",")).map((origin) => origin.trim()).filter(Boolean));
  const keyConfigured = Boolean(options.deepseek?.apiKey ?? env.DEEPSEEK_API_KEY);
  const webEnabled = options.webEnabled ?? (env.CHANCEPING_ICH_AGENT_PUBLIC_WEB_ENABLED === "true" && keyConfigured);
  const enabled = options.enabled ?? env.CHANCEPING_ICH_AGENT_ENABLED !== "false";

  const originAllowed = (request: Request): boolean => {
    const origin = request.headers.get("origin");
    return Boolean(origin && allowedOrigins.has(origin));
  };
  const setSessionCookie = (context: Context, token: string) => {
    setCookie(context, COOKIE_NAME, token, {
      httpOnly: true, secure: options.secureCookies ?? env.NODE_ENV === "production",
      sameSite: "Strict", path: COOKIE_PATH, maxAge: 2 * 60 * 60,
    });
  };

  app.get("/agent/status", (c) => c.json({
    enabled,
    library_available: enabled,
    web_available: enabled && webEnabled && budget.configured() && keyConfigured,
    public_daily_budget_cny: budget.configured() ? configuredBudget : 0,
    private_follow_up: false,
  }, 200, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }));

  app.post("/agent/query", async (c) => {
    if (!originAllowed(c.req.raw)) return publicError("ORIGIN_NOT_ALLOWED", 403);
    if (!enabled) return publicError("ASSISTANT_DISABLED", 503);
    const parsedBody = await readLimitedJson(c.req.raw);
    if (!parsedBody.ok) return publicError(parsedBody.code, parsedBody.status as 400 | 413 | 415);
    const request = readAgentRequest(parsedBody.value);
    if (!request) return publicError("INVALID_REQUEST", 400);

    // The session token comes only from the HttpOnly cookie; body-supplied tokens are ignored.
    let session = store.get(getCookie(c, COOKIE_NAME));
    if (!session) {
      session = store.create();
      setSessionCookie(c, session.token);
    }
    const cached = findCachedResponse(session, request.request_id);
    if (cached) {
      c.header("Cache-Control", "no-store");
      return c.json(cached);
    }
    const submission = store.startSubmission(session, request.request_id);
    if (submission === "in_flight") return publicError("REQUEST_IN_PROGRESS", 409);
    if (submission === "rate_limited") return publicError("RATE_LIMITED", 429);
    if (submission !== "ok") return publicError("SESSION_EXPIRED", 409);

    try {
      const opportunities = options.opportunities ?? readOpportunityV2Pool(options.poolPath).opportunities;
      const sources = options.sources ?? readOpportunityV2Sources(options.sourcesPath);
      const translations = readOpportunityV2Translations(options.translationsPath);
      const result = await runIchAgentTurn({
        session,
        request: { ...request, conversation_token: undefined },
        signal: c.req.raw.signal,
        options: { opportunities, sources, translations, webEnabled, budget, now, search: options.search, fetchPage: options.fetchPage, translateTitles: options.translateTitles, deepseek: options.deepseek },
      });
      const turn: IchAgentTurnRecord = {
        turn_id: result.response.turn_id,
        created_at: result.response.as_of,
        result_refs: result.response.results.map((row) => row.result_ref),
        results_by_ref: result.resultsByRef,
        evidences_by_id: result.evidencesById,
        response_by_request_id: new Map([[request.request_id, result.response]]),
      };
      store.finishSubmission(session, turn);
      c.header("Cache-Control", "no-store");
      return c.json(result.response);
    } catch (error) {
      store.finishSubmission(session);
      const code = error instanceof Error && ["INVALID_PARENT_TURN", "INVALID_RESULT_REF", "RESULT_REFERENCE_NOT_FOUND", "TOO_MANY_COMPARE_ITEMS"].includes(error.message) ? error.message : "ASSISTANT_REQUEST_FAILED";
      const status = code === "ASSISTANT_REQUEST_FAILED" ? 503 : 400;
      c.header("Cache-Control", "no-store");
      return c.json({ error: { code } }, status as 400 | 503);
    }
  });

  app.delete("/agent/session", (c) => {
    if (!originAllowed(c.req.raw)) return publicError("ORIGIN_NOT_ALLOWED", 403);
    const token = getCookie(c, COOKIE_NAME);
    if (token) store.clear(token);
    c.header("Cache-Control", "no-store");
    deleteCookie(c, COOKIE_NAME, { path: COOKIE_PATH, secure: options.secureCookies ?? env.NODE_ENV === "production", sameSite: "Strict", httpOnly: true });
    return c.body(null, 204);
  });

  return app;
}
