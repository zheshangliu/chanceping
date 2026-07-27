import { Hono } from "hono";
import { candidateKey, loadCandidates, saveCandidates, upsertCandidates } from "../../business/candidate-store";
import { loadSourceRegistry, sourceMayPublish, type CandidateRecord } from "../../business/data-pipeline";

const reviewableStates = new Set<CandidateRecord["state"]>(["EXTRACTED", "PENDING_VERIFICATION", "MANUAL_DEDUPE", "NEEDS_MANUAL_PARSE", "NEEDS_REVIEW"]);
function invalid(message: string) { return { success: false, data: null, error: { code: "INVALID_INTAKE", message }, duration_ms: 0 }; }

export function businessOperationsRoutes(): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => { const expected = process.env.CHANCEPING_BUSINESS_OPERATIONS_TOKEN; const auth = c.req.header("authorization"); if (!expected || auth !== `Bearer ${expected}`) return c.json({ success: false, data: null, error: { code: "UNAUTHORIZED", message: "需要运营权限" }, duration_ms: 0 }, 401); await next(); });
  app.get("/review-queue", (c) => {
    const registry = loadSourceRegistry(); const candidates = loadCandidates().filter((candidate) => reviewableStates.has(candidate.state));
    return c.json({ success: true, data: { candidates, candidateCount: candidates.length, sources: registry.sources.filter((source) => source.health.includes("待") || source.integrationStatus === "TECHNICAL_REVIEW"), generatedAt: new Date().toISOString() }, error: null, duration_ms: 0 });
  });

  app.post("/intake", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Partial<{ sourceId: string; officialUrl: string; title: string; publishedAt: string; deadline: string; categoryHint: string; rawBodyExcerpt: string }>;
    if (!body.sourceId || !body.officialUrl || !body.title) return c.json(invalid("sourceId、officialUrl 和 title 为必填项"), 400);
    const source = loadSourceRegistry().sources.find((item) => item.sourceId === body.sourceId);
    if (!source || !sourceMayPublish(source)) return c.json(invalid("来源未获准作为正式官方收录来源"), 400);
    let url: URL; try { url = new URL(body.officialUrl); } catch { return c.json(invalid("officialUrl 必须为 HTTPS 官方链接"), 400); }
    if (url.protocol !== "https:" || (url.hostname !== source.officialDomain && !url.hostname.endsWith(`.${source.officialDomain}`))) return c.json(invalid("链接域名与来源登记不一致"), 400);
    const now = new Date().toISOString(); const candidate: CandidateRecord = { candidateId: candidateKey(source.sourceId, body.officialUrl), sourceId: source.sourceId, discoveryUrl: body.officialUrl, canonicalUrl: body.officialUrl, rawTitle: body.title.trim(), rawPublishedAt: body.publishedAt, rawDeadlineText: body.deadline, rawBodyExcerpt: body.rawBodyExcerpt, categoryHint: body.categoryHint, state: "PENDING_VERIFICATION", duplicateStatus: "NONE", createdAt: now, updatedAt: now };
    const existing = loadCandidates(); saveCandidates(upsertCandidates(existing, [candidate]));
    return c.json({ success: true, data: { candidate, publicVisible: false, nextStep: "请在待核验队列补充证据、地区适用性和行动期后再发布。" }, error: null, duration_ms: 0 }, 201);
  });

  app.post("/review-queue/:candidateId/decision", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Partial<{ decision: "verify" | "reject"; note: string }>;
    if (body.decision !== "verify" && body.decision !== "reject") return c.json(invalid("decision 必须为 verify 或 reject"), 400);
    const items = loadCandidates(); const candidate = items.find((item) => item.candidateId === c.req.param("candidateId"));
    if (!candidate) return c.json({ success: false, data: null, error: { code: "CANDIDATE_NOT_FOUND", message: "候选不存在" }, duration_ms: 0 }, 404);
    candidate.state = body.decision === "verify" ? "FIELD_VERIFIED" : "REJECTED"; candidate.updatedAt = new Date().toISOString(); candidate.rawBodyExcerpt = [candidate.rawBodyExcerpt, body.note?.trim()].filter(Boolean).join("\n审核备注："); saveCandidates(items);
    return c.json({ success: true, data: { candidate, publicVisible: false, nextStep: body.decision === "verify" ? "字段核验完成；仍需通过发布门槛才可进入公开机会库。" : "已拒绝，不会进入公开机会库。" }, error: null, duration_ms: 0 });
  });
  return app;
}
