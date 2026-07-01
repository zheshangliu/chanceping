import { readFileSync } from "fs";
import { loadLocalApiEnv } from "../src/config/local-env";
import type { OpportunityCard } from "../src/schema/opportunity-card";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function sanitize(message: unknown): string {
  let text = message instanceof Error ? message.message : String(message ?? "");
  for (const keyName of ["SERPER_API_KEY"]) {
    const value = process.env[keyName];
    if (value && value.length > 0) {
      text = text.split(value).join("[redacted]");
    }
  }
  return text;
}

function hasMockOrExampleUrl(url: string): boolean {
  return /mock\.chanceping\.local|example\.(com|org|net|cn|edu)/i.test(url);
}

function titleOf(card: OpportunityCard | undefined): string {
  return String(card?.title ?? "").trim();
}

async function main(): Promise<void> {
const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as {
  scripts?: Record<string, string>;
};
check(
  "verify:live-mvp is opt-in and not part of verify:all",
  !String(packageJson.scripts?.["verify:all"] ?? "").includes("verify:live-mvp"),
);

const localEnv = loadLocalApiEnv({ enabled: true });
check("api.env loads only through explicit live script", localEnv.loaded, `reason=${localEnv.reason}`);
check("SERPER_API_KEY is available for live search", Boolean(process.env.SERPER_API_KEY));

process.env.DATA_MODE = process.env.DATA_MODE ?? "live";
process.env.LLM_MODE = process.env.LLM_MODE ?? "mock";
check("DATA_MODE=live for this smoke test", process.env.DATA_MODE === "live", `DATA_MODE=${process.env.DATA_MODE}`);
check("LLM_MODE stays mock unless explicitly overridden", process.env.LLM_MODE === "mock", `LLM_MODE=${process.env.LLM_MODE}`);

if (!process.env.SERPER_API_KEY) {
  console.log(`live MVP verification: ${passed} PASS / ${failed} FAIL`);
  process.exit(1);
}

const [
  { createApp },
  { createAppContext },
  { createDefaultSpec },
  { SearchOrchestrator },
] = await Promise.all([
  import("../src/api/app"),
  import("../src/api/context"),
  import("../src/schema/radar-requirement-spec"),
  import("../src/search/orchestrator"),
]);

const ctx = createAppContext();
const app = createApp(ctx);
const now = new Date().toISOString();
const spec = createDefaultSpec();
spec.client_profile.client_type = "个人";
spec.client_profile.industry = "体育";
spec.client_profile.business_type = "乒乓球选手";
spec.client_profile.regions = ["中国", "国际"];
spec.core_goals.primary_goal = "寻找未来30天内可报名的乒乓球比赛";
spec.core_goals.action_intent = ["报名比赛"];
spec.core_goals.priority_order = ["WTT", "ITTF", "中国乒协"];
spec.opportunity_scope.primary_opportunity_types = ["乒乓球比赛", "公开赛", "报名窗口"];
spec.region_scope.primary_regions = ["中国", "国际"];
spec.region_scope.global_allowed = true;
spec.keyword_strategy.core_keywords_zh = ["乒乓球", "比赛", "报名"];
spec.keyword_strategy.core_keywords_en = ["table tennis", "WTT", "ITTF"];
spec.filter_rules.must_exclude = ["培训广告"];
const sourceStrategy = spec.source_strategy!;
sourceStrategy.manual_sources = ["中国乒协官网"];
sourceStrategy.user_supplied_sources = [
  {
    source_name: "WTT",
    source_url: "https://worldtabletennis.com/",
    added_at: now,
    contributed_by: "user",
  },
  {
    source_name: "ITTF",
    source_url: "https://www.ittf.com/",
    added_at: now,
    contributed_by: "user",
  },
];
spec.requirement_confidence.total = 95;
spec.confirmation_status.status = "confirmed";
spec.confirmation_status.user_confirmed = true;
spec.confirmation_status.confirmed_at = now;

const query = "乒乓球 比赛 报名 WTT ITTF 2026";
const orchestrator = new SearchOrchestrator({
  llmAdapter: ctx.llmAdapter,
  maxResultsPerProvider: 3,
  minRelevance: 0,
  enableContentFetch: false,
  mockContent: true,
  dataMode: "live",
});

let searchResult;
try {
  searchResult = await orchestrator.search(spec, query, { primary: ["serper"], fallback: [] });
} catch (err) {
  check("live Serper search does not throw", false, sanitize(err));
}

if (searchResult) {
  const executions = searchResult.executionLog?.queryExecutions ?? [];
  const rawCandidates = searchResult.rawCandidates ?? [];
  const cards = searchResult.opportunityCards ?? [];
  const firstCard = cards[0];
  const firstTitle = titleOf(firstCard);

  check("live search executed through Serper", executions.some((item) => item.provider === "serper" && item.status === "succeeded"));
  check("live search returned raw candidates", rawCandidates.length > 0, `rawCandidates=${rawCandidates.length}`);
  check("live search did not use mock/example URLs", rawCandidates.every((item) => !hasMockOrExampleUrl(item.url)));
  check("live search produced opportunity cards", cards.length > 0, `cards=${cards.length}`);
  check("live cards are not marked as demo data", cards.every((card) => card.is_demo_data !== true));
  check("openedUrls stays empty when pages were not fetched", (searchResult.executionLog?.openedUrls ?? []).length === 0);
  check("source hint checks include user supplied sources", (searchResult.sourceHintChecks ?? []).length >= 2);

  const reportResponse = await app.request("/api/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spec,
      radar_type: "custom",
      opportunities: cards.slice(0, 3),
      sourceHintChecks: searchResult.sourceHintChecks,
      candidateAccounting: searchResult.candidateAccounting,
    }),
  });
  const reportJson = await reportResponse.json() as {
    success?: boolean;
    data?: { markdown?: string };
    error?: { message?: string };
  };
  const markdown = reportJson.data?.markdown ?? "";

  check("live MVP report endpoint returns 200", reportResponse.status === 200, `status=${reportResponse.status}`);
  check("live MVP report succeeds", reportJson.success === true, sanitize(reportJson.error?.message));
  check("report includes at least one live opportunity title", firstTitle.length > 0 && markdown.includes(firstTitle), firstTitle);
  check("report does not claim mock/demo data", !markdown.includes("演示 / 测试数据") && !markdown.includes("未真实联网搜索"));

  const providerSummary = executions
    .filter((item) => item.provider === "serper")
    .map((item) => `${item.provider}:${item.status}:${item.rawResultCount}`)
    .join(", ");
  const domains = rawCandidates.slice(0, 3).map((item) => item.sourceDomain).join(", ");
  console.log(`LIVE provider summary: ${providerSummary}`);
  console.log(`LIVE sample title: ${firstTitle}`);
  console.log(`LIVE sample domains: ${domains}`);
}

console.log(`live MVP verification: ${passed} PASS / ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  check("live MVP script completes", false, sanitize(err));
  console.log(`live MVP verification: ${passed} PASS / ${failed} FAIL`);
  process.exit(1);
});
