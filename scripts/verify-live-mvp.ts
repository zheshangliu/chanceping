import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { loadLocalApiEnv } from "../src/config/local-env";
import type { OpportunityCard } from "../src/schema/opportunity-card";
import type { RadarRequirementSpec } from "../src/schema/radar-requirement-spec";

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

function setConfirmed(spec: RadarRequirementSpec, now: string): void {
  spec.requirement_confidence.total = 95;
  spec.confirmation_status.status = "confirmed";
  spec.confirmation_status.user_confirmed = true;
  spec.confirmation_status.confirmed_at = now;
}

function addSources(
  spec: RadarRequirementSpec,
  now: string,
  sources: Array<{ name: string; url: string }>,
  manualSources: string[] = [],
): void {
  const sourceStrategy = spec.source_strategy!;
  sourceStrategy.manual_sources = manualSources;
  sourceStrategy.user_supplied_sources = sources.map((source) => ({
    source_name: source.name,
    source_url: source.url,
    added_at: now,
    contributed_by: "user",
  }));
}

interface LiveScenario {
  id: string;
  label: string;
  query: string;
  expectedDomains: string[];
  buildSpec: (base: RadarRequirementSpec, now: string) => RadarRequirementSpec;
}

async function main(): Promise<void> {
  const packageJsonSource = readFileSync("package.json", "utf-8");
  const packageJson = JSON.parse(packageJsonSource) as { scripts?: Record<string, string> };
  const scriptSource = readFileSync("scripts/verify-live-mvp.ts", "utf-8");

  check(
    "verify:live-mvp is opt-in and not part of verify:all",
    !String(packageJson.scripts?.["verify:all"] ?? "").includes("verify:live-mvp"),
  );
  const ignored = spawnSync("git", ["check-ignore", "-q", "api.env"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
  check("api.env is git-ignored", ignored.status === 0);
  check("live script does not print API key values or prefixes", !/SERPER_API_KEY\s*=|substring\(0|slice\(0,\s*8/.test(scriptSource));

  const localEnv = loadLocalApiEnv({ enabled: true });
  check("api.env loads only through explicit live script", localEnv.loaded, `reason=${localEnv.reason}`);
  check("SERPER_API_KEY is available for live search", Boolean(process.env.SERPER_API_KEY));

  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH = "true";
  check("global DATA_MODE remains mock during product-path live test", process.env.DATA_MODE === "mock");
  check("LLM_MODE stays mock for live search MVP", process.env.LLM_MODE === "mock");
  check("local live search switch is explicit", process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH === "true");

  if (!process.env.SERPER_API_KEY) {
    console.log(`live MVP verification: ${passed} PASS / ${failed} FAIL`);
    process.exit(1);
  }

  const [{ createApp }, { createAppContext }, { createDefaultSpec }] = await Promise.all([
    import("../src/api/app"),
    import("../src/api/context"),
    import("../src/schema/radar-requirement-spec"),
  ]);

  const ctx = createAppContext();
  const app = createApp(ctx);
  const now = new Date().toISOString();
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const productionBlocked = await app.request("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      spec: createDefaultSpec(),
      query: "table tennis",
      search_mode: "live",
      max_results: 1,
      enable_content_fetch: false,
    }),
  });
  check("production blocks request-level live search", productionBlocked.status === 403, `status=${productionBlocked.status}`);
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  const scenarios: LiveScenario[] = [
    {
      id: "table-tennis",
      label: "乒乓球选手 WTT / ITTF",
      query: "乒乓球 比赛 报名 WTT ITTF 2026",
      expectedDomains: ["ittf.com", "worldtabletennis.com"],
      buildSpec(base, timestamp) {
        base.client_profile.client_type = "个人";
        base.client_profile.industry = "体育";
        base.client_profile.business_type = "乒乓球选手";
        base.client_profile.regions = ["中国", "国际"];
        base.core_goals.primary_goal = "寻找未来30天内可报名的乒乓球比赛";
        base.core_goals.action_intent = ["报名比赛"];
        base.core_goals.priority_order = ["WTT", "ITTF", "中国乒协"];
        base.opportunity_scope.primary_opportunity_types = ["乒乓球比赛", "公开赛", "报名窗口"];
        base.region_scope.primary_regions = ["中国", "国际"];
        base.region_scope.global_allowed = true;
        base.keyword_strategy.core_keywords_zh = ["乒乓球", "比赛", "报名"];
        base.keyword_strategy.core_keywords_en = ["table tennis", "WTT", "ITTF"];
        base.filter_rules.must_exclude = ["培训广告"];
        addSources(base, timestamp, [
          { name: "WTT", url: "https://worldtabletennis.com/" },
          { name: "ITTF", url: "https://www.ittf.com/" },
        ], ["中国乒协官网"]);
        setConfirmed(base, timestamp);
        return base;
      },
    },
    {
      id: "go",
      label: "围棋选手国内外棋院",
      query: "site:nihonkiin.or.jp 囲碁 大会 2026",
      expectedDomains: ["nihonkiin.or.jp", "intergofed.org", "baduk.or.kr", "imsa.cn"],
      buildSpec(base, timestamp) {
        base.client_profile.client_type = "个人";
        base.client_profile.industry = "体育";
        base.client_profile.business_type = "围棋选手";
        base.client_profile.regions = ["中国", "日本", "韩国", "国际"];
        base.core_goals.primary_goal = "寻找未来30天内可报名或值得关注的围棋比赛";
        base.core_goals.action_intent = ["报名比赛", "保存观察"];
        base.core_goals.priority_order = ["中国围棋协会", "日本棋院", "韩国棋院", "国际围棋联盟"];
        base.opportunity_scope.primary_opportunity_types = ["围棋公开赛", "职业定段赛", "奖金赛事"];
        base.region_scope.primary_regions = ["中国", "日本", "韩国", "国际"];
        base.region_scope.global_allowed = true;
        base.keyword_strategy.core_keywords_zh = ["围棋", "囲碁", "大会", "比赛", "报名", "公开赛"];
        base.keyword_strategy.core_keywords_en = ["go tournament", "baduk", "weiqi"];
        base.filter_rules.must_exclude = ["培训广告"];
        addSources(base, timestamp, [
          { name: "日本棋院", url: "https://www.nihonkiin.or.jp/" },
          { name: "韩国棋院", url: "https://www.baduk.or.kr/" },
          { name: "国际围棋联盟", url: "https://www.intergofed.org/" },
        ], ["中国围棋协会"]);
        setConfirmed(base, timestamp);
        return base;
      },
    },
  ];

  for (const scenario of scenarios) {
    const spec = scenario.buildSpec(createDefaultSpec(), now);
    const searchResponse = await app.request("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spec,
        query: scenario.query,
        search_mode: "live",
        max_results: 3,
        enable_content_fetch: false,
      }),
    });
    const searchJson = await searchResponse.json() as {
      success?: boolean;
      data?: {
        opportunityCards?: OpportunityCard[];
        rawCandidates?: Array<{ title: string; url: string; sourceDomain: string }>;
        sourceHintChecks?: unknown[];
        sourceCoverage?: unknown[];
        candidateAccounting?: unknown;
        executionLog?: { openedUrls?: string[]; queryExecutions?: Array<{ provider: string; status: string; rawResultCount: number }> };
      };
      error?: { message?: string };
    };
    const cards = searchJson.data?.opportunityCards ?? [];
    const rawCandidates = searchJson.data?.rawCandidates ?? [];
    const domains = rawCandidates.map((candidate) => candidate.sourceDomain).filter(Boolean);
    const firstTitle = titleOf(cards[0]);

    check(`${scenario.label}: product /api/search returns 200`, searchResponse.status === 200, `status=${searchResponse.status}, error=${sanitize(searchJson.error?.message)}`);
    check(`${scenario.label}: product /api/search succeeds`, searchJson.success === true, sanitize(searchJson.error?.message));
    check(`${scenario.label}: live product path returns raw candidates`, rawCandidates.length > 0, `rawCandidates=${rawCandidates.length}`);
    check(`${scenario.label}: raw candidates include sourceDomain`, domains.length === rawCandidates.length && domains.length > 0, domains.join(", "));
    check(`${scenario.label}: live product path does not return mock/example URLs`, rawCandidates.every((candidate) => !hasMockOrExampleUrl(candidate.url)));
    check(`${scenario.label}: opportunity cards include real URL`, cards.some((card) => /^https?:\/\//.test(card.official_source_url || "")));
    check(`${scenario.label}: opportunity cards are live and not demo`, cards.length > 0 && cards.every((card) => card.data_mode === "live" && card.is_demo_data !== true));
    check(`${scenario.label}: source status stays待复核`, cards.every((card) => card.evidence_status !== "confirmed" && card.verificationStatus !== "verified"));
    check(`${scenario.label}: result has one expected source family`, domains.some((domain) => scenario.expectedDomains.some((expected) => domain.includes(expected))), domains.join(", "));
    check(`${scenario.label}: no openedUrls without content fetch`, (searchJson.data?.executionLog?.openedUrls ?? []).length === 0);

    const reportResponse = await app.request("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spec,
        radar_type: "custom",
        opportunities: cards.slice(0, 3),
        sourceHintChecks: searchJson.data?.sourceHintChecks ?? searchJson.data?.sourceCoverage,
        candidateAccounting: searchJson.data?.candidateAccounting,
      }),
    });
    const reportJson = await reportResponse.json() as {
      success?: boolean;
      data?: { markdown?: string };
      error?: { message?: string };
    };
    const markdown = reportJson.data?.markdown ?? "";

    check(`${scenario.label}: report endpoint returns 200`, reportResponse.status === 200, `status=${reportResponse.status}`);
    check(`${scenario.label}: report succeeds`, reportJson.success === true, sanitize(reportJson.error?.message));
    check(`${scenario.label}: report includes live opportunity title`, firstTitle.length > 0 && markdown.includes(firstTitle), firstTitle);
    check(`${scenario.label}: report separates searched sources`, markdown.includes("### 搜索到的来源"));
    check(`${scenario.label}: report separates verified facts`, markdown.includes("### 字段已核验事实"));
    check(`${scenario.label}: report separates model judgment`, markdown.includes("### 模型判断"));
    check(`${scenario.label}: report separates review items`, markdown.includes("### 待复核项"));
    check(`${scenario.label}: report does not claim demo/mock data`, !markdown.includes("演示 / 测试数据") && !markdown.includes("未真实联网搜索"));
    check(`${scenario.label}: report does not claim verified eligibility or fees`, !/已确认(报名资格|费用|截止日期|版权义务)/.test(markdown));

    const providerSummary = (searchJson.data?.executionLog?.queryExecutions ?? [])
      .map((item) => `${item.provider}:${item.status}:${item.rawResultCount}`)
      .join(", ");
    console.log(`LIVE ${scenario.id} provider summary: ${providerSummary}`);
    console.log(`LIVE ${scenario.id} sample title: ${firstTitle}`);
    console.log(`LIVE ${scenario.id} sample domains: ${domains.slice(0, 5).join(", ")}`);
  }

  console.log(`live MVP verification: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  check("live MVP script completes", false, sanitize(err));
  console.log(`live MVP verification: ${passed} PASS / ${failed} FAIL`);
  process.exit(1);
});
