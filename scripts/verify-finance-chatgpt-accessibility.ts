import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webUiRoutes } from "../src/api/routes/web-ui";
import { createHeadHunterStores } from "../src/headhunter/stores";
import type { WeeklySnapshot } from "../src/headhunter/model/weekly-snapshot";
import { createTestWeeklyLeadSnapshot } from "../src/headhunter/model/weekly-snapshot";

async function main(): Promise<void> {
  const previousPublic = process.env.FINANCE_PUBLIC_MODE;
  process.env.FINANCE_PUBLIC_MODE = "true";
  const dataDir = await mkdtemp(join(tmpdir(), "chanceping-finance-accessibility-"));
  try {
    const stores = createHeadHunterStores(dataDir);
    const lead = { ...createTestWeeklyLeadSnapshot(), company_name: "Accessibility Test Holdings", industry: "finance", region: "Hong Kong", why_now_zh: "近期扩张", trigger_summary_zh: "招聘扩张 Trigger", talent_need_zh: "Talent Acquisition", service_wedge_zh: "高端猎头", bd_action_zh: "联系招聘负责人", first_touch_script_zh: "您好", evidences: [{ evidence_id: "ev-access", source_url: "https://example.com/evidence", source_name: "official", source_type: "official", title: "Expansion announcement", summary: "recent hiring", published_at: "2026-09-01", evidence_level: "first_party" as const, is_first_party: true, cross_verified: true }], contacts: [{ contact_id: "contact-access", name: null, title: "官方联系入口", organization: "Accessibility Test Holdings", contact_type: "company_contact_form", url: "https://example.com/contact", email: null, phone: null, verification_status: "verified_public" as const }] };
    const snapshot: WeeklySnapshot = { weekly_snapshot_id: "weekly-2026-W37", week_key: "2026-W37", radar_run_id: "accessibility-run", published: true, published_at: "2026-09-03T10:00:00Z", lead_ids: [lead.id], trend_ids: [], leads: [lead], trends: [], markdown: null, created_at: "2026-09-03T10:00:00Z", updated_at: "2026-09-03T10:00:00Z", funnel_metrics: { candidate_url_count: 1, company_candidate_count: 1, company_resolved_count: 1, signal_count: 1, job_count: 1, person_candidate_count: 1, contact_count: 1, need_count: 1, a_count: 0, b_count: 1, blocking_reasons: { missing_contact: 1 } } };
    await stores.weeklySnapshots.upsertPublished(snapshot);
    const app = webUiRoutes({ stores, sessions: undefined as never, authConfig: { username: "", password_hash: "", session_secret: "public" } });
    const request = (path: string, headers: Record<string, string> = {}) => app.request(`https://finance.chanceping.com${path}`, { headers: { host: "finance.chanceping.com", ...headers } });
    const weekly = await request("/weekly");
    assert.equal(weekly.status, 200); assert.equal(weekly.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=600");
    const markdown = await request("/weekly.md"); const markdownText = await markdown.text();
    assert.equal(markdown.status, 200); assert.match(markdown.headers.get("content-type") ?? "", /text\/markdown/); assert.match(markdownText, /2026 W37/); assert.match(markdownText, /Accessibility Test Holdings/); assert.match(markdownText, /https:\/\/example\.com\/evidence/);
    const plain = await request("/weekly/plain"); const plainText = await plain.text();
    assert.equal(plain.status, 200); assert.match(plainText, /Accessibility Test Holdings/); assert.match(plainText, /https:\/\/example\.com\/evidence/); assert.match(plainText, /robots.*index,follow/s); assert.match(plainText, /canonical.*\/weekly/s);
    for (const path of ["/robots.txt", "/sitemap.xml"]) { const response = await request(path); assert.equal(response.status, 200); }
    console.log("finance ChatGPT accessibility hotfix verification: PASS");
  } finally { await rm(dataDir, { recursive: true, force: true }); if (previousPublic === undefined) delete process.env.FINANCE_PUBLIC_MODE; else process.env.FINANCE_PUBLIC_MODE = previousPublic; }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
