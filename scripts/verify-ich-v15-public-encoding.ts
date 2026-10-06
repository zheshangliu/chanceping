import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { opportunityV2Routes } from "../src/api/routes/opportunity-v2";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { isOpportunityV2PublicCopyAllowed } from "../src/opportunity-v2/source-governance";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const NOW = "2026-10-06T10:00:00.000Z";
const SOURCE_ID = "proc-ca-canadabuys";
const source: OpportunityV2Source = {
  id: SOURCE_ID, name: "CanadaBuys Open Tenders CSV", url: "https://example.test/tenders",
  region: "GLOBAL", priority: "P1", types: ["competition"], radars: ["ich"],
  enabled: true, status: "ACTIVE", last_fetch_at: NOW,
};

function opportunity(id: string, title: string, summary: string, encodingFields: OpportunityV2["encoding_error_fields"] = []): OpportunityV2 {
  return {
    id, title, summary, source_id: SOURCE_ID, source_name: source.name, source_url: source.url,
    detail_url: `https://example.test/opportunities/${id}`, category: "competition", region: "GLOBAL", tags: ["文创", "工艺"],
    deadline: null, status: "UNKNOWN_DEADLINE", first_seen_at: NOW, last_seen_at: NOW,
    discovered_by_sources: [SOURCE_ID], radar_relevance: "RELEVANT",
    ...(encodingFields.length ? { encoding_error: true, encoding_error_fields: encodingFields } : {}),
  };
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ich-v15-public-encoding-"));
  const sourcesPath = path.join(dir, "sources.json");
  const poolPath = path.join(dir, "opportunities.json");
  const corruptTitle = opportunity("opp-corrupt-title", "2026工艺大赛 ����", "来源摘要", ["title"]);
  const safe = opportunity("opp-safe-title", "2026工艺创意赛事", "可公开的摘要");
  const corruptSummary = opportunity("opp-corrupt-summary", "2026国际工艺创意征集", "来源摘要 � 损坏", ["summary"]);
  try {
    fs.writeFileSync(sourcesPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.sources.v1", updated_at: NOW, sources: [source] }));
    fs.writeFileSync(poolPath, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: NOW, opportunities: [corruptTitle, safe, corruptSummary] }));
    assert.equal(isOpportunityV2PublicCopyAllowed(corruptTitle), true, "fixture reaches public detail guards through the normal source permission path");

    const api = new Hono().route("/api/opportunity-v2", opportunityV2Routes({ sourcesPath, poolPath }));
    const pages = new Hono().route("/ich", ichPagesRoutes({ opportunityV2: true, opportunityV2SourcesPath: sourcesPath, opportunityV2PoolPath: poolPath, now: () => new Date(NOW) }));

    const titleApi = await api.request(`/api/opportunity-v2/opportunities/${corruptTitle.id}`);
    assert.equal(titleApi.status, 404, "corrupt-title API detail is fail-closed");
    const titlePage = await pages.request(`/ich/opportunities/${corruptTitle.id}`);
    assert.equal(titlePage.status, 404, "corrupt-title HTML detail is fail-closed");
    assert.equal((await titlePage.text()).includes("�"), false, "404 HTML never renders the corrupted title");

    const listed = await (await api.request("/api/opportunity-v2/opportunities")).json() as { opportunities: OpportunityV2[] };
    assert.deepEqual(listed.opportunities.map((item) => item.id).sort(), [safe.id, corruptSummary.id].sort(), "public list excludes corrupt titles but keeps sound titles");
    const memo = await (await pages.request("/ich/memo.json")).json() as { items: OpportunityV2[] };
    assert.equal(memo.items.some((item) => item.id === corruptTitle.id), false, "memo continues to exclude corrupt titles");
    assert.equal(memo.items.some((item) => item.id === safe.id), true, "memo keeps sound opportunities");

    const summaryApi = await api.request(`/api/opportunity-v2/opportunities/${corruptSummary.id}`);
    assert.equal(summaryApi.status, 200, "summary-only corruption does not hide a sound title");
    const summaryJson = await summaryApi.json() as OpportunityV2;
    assert.equal(summaryJson.summary, "", "public JSON omits a corrupt summary");
    const summaryPage = await pages.request(`/ich/opportunities/${corruptSummary.id}`);
    assert.equal(summaryPage.status, 200, "summary-only corruption keeps the detail page available");
    assert.equal((await summaryPage.text()).includes("来源摘要 � 损坏"), false, "HTML detail never renders the corrupt original summary");
    console.log("ICH_V15_PUBLIC_ENCODING: PASS (corrupt titles fail closed across detail/list/Memo; corrupt summaries are omitted without hiding safe titles)");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
