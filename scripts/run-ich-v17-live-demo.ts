import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadLocalApiEnv } from "../src/config/local-env";
import { createIchAgentRoutes } from "../src/api/routes/ich-agent";
import { IchAgentBudget } from "../src/ich/agent/budget";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const primaryProject = process.env.CHANCEPING_PRIMARY_PROJECT_DIR || "/Users/1sunflower/Projects/Codex/chanceping";
const outputDir = path.join(primaryProject, "output/ich-v17-r2");
const task = "我是做竹编的工作室，想在广州找近期可报名的文创征集；请联网补查，并帮我核对资格、费用、截止和作品材料要求。";
const followUpTask = "请详细核对这条网上新发现的机会：谁可以参加、是否收费、截止日期和要交哪些作品材料？每项都给我原文依据，没找到就明确说待核。";

function assertLiveApproval(): void {
  if (process.env.ICH_V17_LIVE_DEMO !== "1") throw new Error("需要显式设置 ICH_V17_LIVE_DEMO=1 才会调用外部 DeepSeek API");
  if (process.env.NODE_ENV === "production") throw new Error("Live demo 只能在本地隔离环境运行");
}

async function run(): Promise<void> {
  assertLiveApproval();
  const loaded = loadLocalApiEnv({ enabled: true, cwd: primaryProject, envFile: "api.env", allowInProduction: false });
  if (!loaded.loaded || !process.env.DEEPSEEK_API_KEY) throw new Error(`DeepSeek local credential unavailable (${loaded.reason}); no key value was read into output`);
  const [radarResponse, sourcesResponse] = await Promise.all([
    fetch("https://ich.chanceping.com/api/opportunity-v2/radar", { signal: AbortSignal.timeout(15_000) }),
    fetch("https://ich.chanceping.com/api/opportunity-v2/sources", { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!radarResponse.ok || !sourcesResponse.ok) throw new Error(`Production read-only snapshot failed (radar=${radarResponse.status}, sources=${sourcesResponse.status})`);
  const radar = await radarResponse.json() as { total: number; opportunities: OpportunityV2[] };
  const sourcePayload = await sourcesResponse.json() as { sources: OpportunityV2Source[] };
  if (!Array.isArray(radar.opportunities) || radar.opportunities.length !== radar.total || !Array.isArray(sourcePayload.sources)) throw new Error("Production public snapshot has invalid shape");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ich-v17-live-shadow-"));
  try {
    const budget = new IchAgentBudget({ stateDir: tempDir, dailyBudgetCny: 0.2 });
    const app = createIchAgentRoutes({
      enabled: true,
      webEnabled: true,
      dailyBudgetCny: 0.2,
      stateDir: tempDir,
      budget,
      secureCookies: false,
      allowedOrigins: ["https://ich.chanceping.com"],
      opportunities: radar.opportunities,
      sources: sourcePayload.sources,
    });
    const response = await app.request("/agent/query", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://ich.chanceping.com" },
      body: JSON.stringify({ request_id: `live-${Date.now()}`, message: task, mode: "web" }),
    }, { hostname: "ich.chanceping.com" });
    if (!response.ok) throw new Error(`Isolated assistant returned HTTP ${response.status}`);
    const payload = await response.json() as {
      turn_id: string; as_of: string; understood_constraints: unknown; results: Array<Record<string, unknown>>;
      evidences: Array<Record<string, unknown>>; tool_receipt: Record<string, unknown>; notice: string; partial_failures: string[];
    };
    const webResults = payload.results.filter((row) => row.source_kind === "web_new");
    const firstWebResult = webResults.find((row) => typeof row.original_url === "string" && new URL(row.original_url).hostname.endsWith(".gov.cn")) ?? webResults[0];
    if (!firstWebResult || typeof firstWebResult.result_ref !== "string") throw new Error("Live first turn returned no selectable new web lead");
    const sessionCookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!sessionCookie) throw new Error("Isolated session cookie was not issued");
    const followUpResponse = await app.request("/agent/query", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://ich.chanceping.com", cookie: sessionCookie },
      body: JSON.stringify({ request_id: `live-follow-up-${Date.now()}`, message: followUpTask, result_ref: firstWebResult.result_ref, parent_turn_id: payload.turn_id, mode: "web" }),
    }, { hostname: "ich.chanceping.com" });
    if (!followUpResponse.ok) throw new Error(`Isolated follow-up returned HTTP ${followUpResponse.status}`);
    const followUp = await followUpResponse.json() as {
      turn_id: string; as_of: string; results: Array<Record<string, unknown>>; evidences: Array<Record<string, unknown>>;
      tool_receipt: Record<string, unknown>; notice: string; partial_failures: string[];
    };
    const spend = budget.summary();
    const libraryIds = new Set(radar.opportunities.map((item) => item.id));
    const report = {
      schema_version: "chanceping-ich-v17-live-shadow.v1",
      captured_at: new Date().toISOString(),
      environment: "isolated-local-shadow",
      production_snapshot: { api: "GET /api/opportunity-v2/radar", source_count: sourcePayload.sources.length, public_radar_count: radar.total, fetched_count: radar.opportunities.length, data_written_to_production: false },
      request: task,
      follow_up_request: followUpTask,
      follow_up_target_title: firstWebResult.title_zh,
      deepseek_key_value_recorded: false,
      daily_shadow_budget_cny: 0.2,
      tool_cost_estimate: { ...spend, currency: "CNY", basis: "本地预算台账按已读DeepSeek单价和保守汇率估算；非供应商账单" },
      response: {
        turn_id: payload.turn_id, as_of: payload.as_of, understood_constraints: payload.understood_constraints,
        tool_receipt: payload.tool_receipt, notice: payload.notice, partial_failures: payload.partial_failures,
        results: payload.results.map((row) => ({
          source_kind: row.source_kind, title_zh: row.title_zh, original_title: row.original_title,
          opportunity_id: row.opportunity_id, opportunity_type: row.opportunity_type, lifecycle: row.lifecycle,
          region: row.region, deadline_fact: row.deadline_fact, money_facts: row.money_facts,
          eligibility_facts: row.eligibility_facts, work_requirements: row.work_requirements,
          original_url: row.original_url, evidence_refs: row.evidence_refs, verification_state: row.verification_state,
          candidate_admitted_to_pool: typeof row.opportunity_id === "string" && libraryIds.has(row.opportunity_id),
        })),
        evidence_count: payload.evidences.length,
        evidence: payload.evidences.map((row) => ({ field: row.field, status: row.status, value: row.value, excerpt: row.excerpt, source_url: row.source_url, recorded_at: row.recorded_at })),
      },
      follow_up_response: {
        turn_id: followUp.turn_id, as_of: followUp.as_of, tool_receipt: followUp.tool_receipt, notice: followUp.notice, partial_failures: followUp.partial_failures,
        results: followUp.results.map((row) => ({ source_kind: row.source_kind, title_zh: row.title_zh, original_title: row.original_title, opportunity_id: row.opportunity_id, lifecycle: row.lifecycle, region: row.region, deadline_fact: row.deadline_fact, money_facts: row.money_facts, eligibility_facts: row.eligibility_facts, work_requirements: row.work_requirements, key_gap: row.key_gap, next_action: row.next_action, original_url: row.original_url, evidence_refs: row.evidence_refs, verification_state: row.verification_state, candidate_admitted_to_pool: typeof row.opportunity_id === "string" && libraryIds.has(row.opportunity_id) })),
        evidence_count: followUp.evidences.length,
        evidence: followUp.evidences.map((row) => ({ field: row.field, status: row.status, value: row.value, excerpt: row.excerpt, source_url: row.source_url, recorded_at: row.recorded_at })),
      },
    };
    fs.mkdirSync(outputDir, { recursive: true });
    const outputFile = path.join(outputDir, "live-example.json");
    fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({
      report: outputFile,
      production_snapshot: report.production_snapshot,
      tool_receipt: payload.tool_receipt,
      follow_up_tool_receipt: followUp.tool_receipt,
      results: report.response.results.map(({ source_kind, title_zh, opportunity_id, candidate_admitted_to_pool }) => ({ source_kind, title_zh, opportunity_id, candidate_admitted_to_pool })),
      evidence_count: payload.evidences.length,
      follow_up_evidence_count: followUp.evidences.length,
      daily_shadow_budget_cny: report.daily_shadow_budget_cny,
      tool_cost_estimate: report.tool_cost_estimate,
      secret_values_printed: false,
    }, null, 2));
  } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
}

run().catch((error) => { console.error(error instanceof Error ? error.message : "Live demo failed"); process.exitCode = 1; });
