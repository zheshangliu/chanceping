import { loadLocalApiEnv } from "../src/config/local-env";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).slice(0, 2400);
}

type AppLike = {
  request: (path: string, init: RequestInit) => Response | Promise<Response>;
};

async function post(app: AppLike, path: string, body: unknown): Promise<any> {
  const response = await Promise.resolve(app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  const json = await response.json() as { success?: boolean; data?: any; error?: unknown };
  check(`${path} returns 200`, response.status === 200, String(response.status));
  check(`${path} succeeds`, json.success === true, safeJson(json.error));
  return json.data;
}

function textOf(value: unknown): string {
  return String(value ?? "");
}

function hasExampleUrl(value: string): boolean {
  return /(?:^|\.)example\.(?:com|org|net|cn|edu)|mock\.chanceping\.local/i.test(value);
}

function collectUrlText(searchData: any): string {
  return [
    ...(searchData?.rawCandidates ?? []).map((item: any) => `${item.title} ${item.url} ${item.sourceDomain}`),
    ...(searchData?.opportunityCards ?? []).map((item: any) => `${item.title} ${item.official_source_url} ${item.application_url}`),
  ].join("\n");
}

function formatOpenedUrl(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const record = item as { url?: unknown; sourceUrl?: unknown; href?: unknown };
    return textOf(record.url || record.sourceUrl || record.href || "");
  }
  return "";
}

async function main(): Promise<void> {
  const envResult = loadLocalApiEnv({ enabled: true });
  check("api.env loaded explicitly for Q7 live demo", envResult.loaded, envResult.reason);

  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH = "true";
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_LLM = "true";
  process.env.CHANCEPING_LLM_PROFILE = process.env.CHANCEPING_LLM_PROFILE || "commercial";
  process.env.LLM_MODE = "live";
  process.env.DATA_MODE = "live";
  process.env.NODE_ENV = process.env.NODE_ENV === "production" ? "development" : process.env.NODE_ENV;

  const [{ providerRegistry }, { createApp }, { createAppContext }] = await Promise.all([
    import("../src/search/provider-registry"),
    import("../src/api/app"),
    import("../src/api/context"),
  ]);
  const serper = providerRegistry.get("serper") as { mockMode?: boolean; healthCheck?: () => Promise<boolean> } | undefined;
  check("serper provider is registered for Q7 live demo", Boolean(serper));
  check("serper provider is not mockMode for Q7 live demo", serper?.mockMode !== true);
  if (serper?.healthCheck) {
    check("serper provider health passes for Q7 live demo", await serper.healthCheck());
  }

  const app = createApp(createAppContext());
  const demoPrompt = "我是大湾区的 OPC / AI 产品创业者，正在打磨 ChancePing AI 赛事雷达 Demo。我想找未来 30-60 天内仍可报名、可提交项目或作品、适合个人开发者或小团队参加的 AI 比赛、AI Agent Hackathon、AI 创作赛事、AI IDE / Vibe Coding 比赛、云厂商开发者挑战、创业扶持和产品展示机会。请优先搜索 Qwen Cloud Hackathon、TRAE、Devpost、DoraHacks、Lablab.ai、Kaggle、阿里云、腾讯云、AWS、Google Cloud、Microsoft、GitHub、Hugging Face、Product Hunt、AI Grant、粤港澳大湾区和海外线上比赛，以及官方报名页、赛事官网、云厂商活动页和主办方公告。请排除展会资讯、培训广告、学生专属且 OPC 不能参加的比赛、已截止活动、纯新闻转载、社媒转帖和没有报名入口的页面。报告里请按 S/A/B/C 评级，给我报名截止、奖金或云资源、参赛资格、适合 ChancePing 的打法、材料清单、风险提醒，并明确本周先做哪三件事。";

  const generated = await post(app, "/api/radars/generate", { description: demoPrompt });
  const spec = generated?.spec;
  if (spec?.confirmation_status) {
    spec.confirmation_status = {
      ...spec.confirmation_status,
      status: "confirmed",
      user_confirmed: true,
      confirmed_at: new Date().toISOString(),
    };
  }
  check("Q7 live demo generates AI event radar spec", Boolean(spec?.radar_version), safeJson(generated));
  check("Q7 live demo keeps AI event radar positioning", /AI|赛事|Hackathon|开发者|OPC/i.test(safeJson(spec?.radar_version)), safeJson(spec?.radar_version));

  const search = await post(app, "/api/search", {
    spec,
    query: demoPrompt,
    search_mode: "live",
    max_results: 5,
    enable_content_fetch: true,
    providerRouting: { primary: ["serper"], fallback: [] },
  });
  const rawCandidates = search?.rawCandidates ?? [];
  const cards = search?.opportunityCards ?? [];
  const urlText = collectUrlText(search);
  const rawUrls = rawCandidates.map((item: any) => `${item.url} ${item.sourceDomain}`).join("\n");
  const cardTitles = cards.map((item: any) => `${item.visible_level || item.level || "-"} ${item.title}`).join(" | ");

  check("Q7 live demo search outcome is not failed", search?.runOutcome?.status !== "failed", safeJson(search?.runOutcome));
  check("Q7 live demo returns real raw candidates", rawCandidates.length > 0, safeJson(search?.runOutcome));
  check("Q7 live demo raw candidates do not include mock/example URLs", rawCandidates.length > 0 && !hasExampleUrl(rawUrls), rawUrls);
  check("Q7 live demo returns opportunity cards", cards.length > 0, safeJson(search?.candidateAccounting));
  check("Q7 live demo surfaces action-grade AI contest sources", /qwencloud-hackathon\.devpost\.com|forum\.trae\.cn|devpost\.com|dorahacks\.io|lablab\.ai|kaggle\.com/i.test(urlText), urlText.slice(0, 1800));
  check("Q7 live demo has S/A/B/C visible levels", cards.some((item: any) => /^(S|A|B|C)$/.test(textOf(item.visible_level || item.level))), cardTitles);
  check("Q7 live demo cards preserve review-safe wording", cards.every((item: any) => !/已确认报名资格|已确认费用|已确认截止|已核验报名资格|已核验费用|已核验截止/.test(safeJson(item))), safeJson(cards.slice(0, 3)));

  const report = await post(app, "/api/reports/generate", {
    spec,
    opportunities: cards,
    radar_type: "custom",
    profile: spec?.profile_summary || spec?.profile,
    sourceHintChecks: search?.sourceCoverage || search?.sourceHintChecks || [],
    candidateAccounting: search?.candidateAccounting,
    executionLog: search?.executionLog,
    rawCandidates,
  });
  const markdown = String(report?.markdown ?? "");
  check("Q7 live demo report contains markdown", markdown.length > 1000, markdown.slice(0, 500));
  check("Q7 live demo report includes GPT-like daily judgment", markdown.includes("Demo 补充｜今日总判断") || markdown.includes("本轮结论"), markdown.slice(0, 1200));
  check("Q7 live demo report includes S/A/B/C overview", /S\s*\/\s*A\s*\/\s*B|S 级|A级|A 级/i.test(markdown), markdown.slice(0, 1600));
  check("Q7 live demo report keeps evidence-safe wording", /待复核|搜索发现|以官方页面为准/.test(markdown) && !/已确认报名资格|已确认费用|已确认截止/.test(markdown), markdown.slice(0, 2000));

  console.log("Q7 live demo summary:");
  console.log(`  rawCandidates=${rawCandidates.length}`);
  console.log(`  opportunityCards=${cards.length}`);
  console.log(`  cards=${cardTitles}`);
  console.log(`  openedUrls=${(search?.executionLog?.openedUrls ?? []).map(formatOpenedUrl).filter(Boolean).join(" | ")}`);
  console.log(`Q7 live AI event demo verification: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`FAIL Q7 live demo script completes -> ${message}`);
  process.exit(1);
});
