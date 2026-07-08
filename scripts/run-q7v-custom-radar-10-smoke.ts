import fs from "fs";
import path from "path";
import { createApp } from "../src/api/app";
import type { AppContext } from "../src/api/context";
import { createAdapter } from "../src/agents/model-router";
import { LocalFileStore } from "../src/agents/opportunity-store";
import { StarManager } from "../src/agents/star-manager";
import { LocalWatchStore } from "../src/watch/watch-store";
import { JsonRadarStore, JsonRadarRunStore } from "../src/agents/radar-store";
import { RadarRegistry } from "../src/agents/radar-registry";
import { JsonReportStore } from "../src/agents/report-store";
import type { ApiResponse } from "../src/api/types";
import type { RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { OpportunityCard } from "../src/schema/opportunity-card";

type Scenario = {
  id: string;
  label: string;
  input: string;
  expectedKeywords: string[];
};

type ScenarioStatus = "pass" | "near_pass" | "fail";

type ScenarioResult = {
  id: string;
  label: string;
  status: ScenarioStatus;
  generatedName: string;
  radarId: string;
  runId: string;
  reportId: string;
  cardCount: number;
  storedEntryCount: number;
  reasons: string[];
  firstCards: string[];
};

const REPORT_FILE = "Q7V_Custom_Radar_10_Smoke_Report.md";
const TEMP_PREFIX = "q7v-custom-radar-10";
const TEMP_FILES = [
  `data/radars-${TEMP_PREFIX}.json`,
  `data/radar-runs-${TEMP_PREFIX}.json`,
  `data/opportunities-${TEMP_PREFIX}.json`,
  `data/watch-rules-${TEMP_PREFIX}.txt`,
  `data/report-index-${TEMP_PREFIX}.json`,
];

const SCENARIOS: Scenario[] = [
  {
    id: "heritage-embroidery",
    label: "广绣非遗传承人",
    input: "我是在广州从事广绣的非遗传承人，我想找订购广绣订单需求的客户，看看有没有项目采购、文旅合作、企业礼品定制或者展陈委托机会。",
    expectedKeywords: ["广绣", "非遗", "文旅", "礼品", "展陈"],
  },
  {
    id: "employee-benefits",
    label: "员工福利供应商",
    input: "我们做员工福利和节日礼品供应，想找广东和香港未来 60 天企业福利采购、工会福利项目、节日礼品招标，排除加盟广告。",
    expectedKeywords: ["员工福利", "节日礼品", "工会", "采购", "招标"],
  },
  {
    id: "pet-products",
    label: "宠物用品品牌",
    input: "我们是宠物用品品牌，想找宠物展、渠道商、平台招商、品牌联名和线下市集机会。",
    expectedKeywords: ["宠物", "渠道", "招商", "联名", "市集"],
  },
  {
    id: "industrial-green",
    label: "工业环保设备商",
    input: "我们做工业环保设备，想找环保项目招标、政府采购、园区改造、制造业绿色转型项目机会，重点看广东和长三角。",
    expectedKeywords: ["工业环保", "环保", "招标", "园区", "绿色转型"],
  },
  {
    id: "kids-coding",
    label: "少儿编程机构",
    input: "我们是少儿编程培训机构，想找招生合作、学校课后服务、赛事承办、课程采购和机构合作机会。",
    expectedKeywords: ["少儿编程", "课后服务", "赛事承办", "课程", "招生"],
  },
  {
    id: "wedding",
    label: "广州婚庆公司",
    input: "我们是一家广州婚庆公司，想找高端客户、酒店合作、商场活动、品牌联名和婚礼展会机会。",
    expectedKeywords: ["婚庆", "酒店", "高端客户", "商场", "婚礼"],
  },
  {
    id: "b2b-saas-retail",
    label: "B2B 商品交易 SaaS",
    input: "我们是 B2B 商品交易 SaaS，准备出海东南亚，想找零售展会、FMCG 渠道、便利店商超、POS/ERP 伙伴和代理商线索。",
    expectedKeywords: ["B2B", "商品交易", "零售", "FMCG", "代理商"],
  },
  {
    id: "handmade-accessory",
    label: "手工饰品工作室",
    input: "我们是手工饰品工作室，想找能卖货或者曝光的机会，比如市集、平台入驻、买手店合作和品牌联名。",
    expectedKeywords: ["手工饰品", "市集", "入驻", "买手店", "联名"],
  },
  {
    id: "eap",
    label: "企业心理咨询 EAP",
    input: "我们做企业心理咨询和 EAP 服务，想找企业员工关怀采购、工会福利、HR 服务商合作和园区企业合作机会。",
    expectedKeywords: ["心理咨询", "EAP", "员工关怀", "HR", "园区"],
  },
  {
    id: "ai-events",
    label: "AI 赛事 OPC",
    input: "我是大湾区 OPC / AI 产品创业者，想找未来 30-60 天还可报名的 AI 比赛、Hackathon、云资源扶持和产品展示机会。",
    expectedKeywords: ["AI", "OPC", "Hackathon", "云资源", "比赛"],
  },
];

function cleanupTempFiles(): void {
  for (const file of TEMP_FILES) {
    const abs = path.resolve(process.cwd(), file);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
}

function createSmokeContext(): AppContext {
  cleanupTempFiles();
  process.env.DATA_MODE = process.env.DATA_MODE ?? "mock";
  process.env.LLM_MODE = process.env.LLM_MODE ?? "mock";
  process.env.STORE_TYPE = "local";

  const store = new LocalFileStore({ file_path: TEMP_FILES[2] });
  store.load();
  const radarStore = new JsonRadarStore({ file_path: TEMP_FILES[0] });
  const radarRunStore = new JsonRadarRunStore({ file_path: TEMP_FILES[1] });
  const radarRegistry = new RadarRegistry(radarStore);
  radarRegistry.initialize();

  return {
    llmAdapter: createAdapter(),
    store,
    starManager: new StarManager(store),
    watchStore: new LocalWatchStore({ file_path: TEMP_FILES[3] }),
    conversations: new Map(),
    radarStore,
    radarRunStore,
    radarRegistry,
    reportStore: new JsonReportStore({ file_path: TEMP_FILES[4] }),
  };
}

async function parseResponse(res: Response): Promise<ApiResponse> {
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    throw new Error(`响应不是 JSON: status=${res.status}, body=${text.slice(0, 220)}`);
  }
}

async function postJson(app: ReturnType<typeof createApp>, url: string, body: unknown, userId: string): Promise<{ res: Response; json: ApiResponse }> {
  const res = await app.request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ChancePing-User-Id": userId,
    },
    body: JSON.stringify(body),
  });
  return { res, json: await parseResponse(res) };
}

async function getJson(app: ReturnType<typeof createApp>, url: string, userId: string): Promise<{ res: Response; json: ApiResponse }> {
  const res = await app.request(url, {
    method: "GET",
    headers: { "X-ChancePing-User-Id": userId },
  });
  return { res, json: await parseResponse(res) };
}

function confirmSpec(spec: RadarRequirementSpec): RadarRequirementSpec {
  return {
    ...spec,
    confirmation_status: {
      ...spec.confirmation_status,
      status: "confirmed",
      user_confirmed: true,
      confirmed_at: new Date().toISOString(),
    },
  };
}

function containsAny(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function statusFromChecks(reasons: string[], hardFailure: boolean): ScenarioStatus {
  if (hardFailure) return "fail";
  return reasons.some((reason) => reason.startsWith("WARN:")) ? "near_pass" : "pass";
}

async function runScenario(app: ReturnType<typeof createApp>, scenario: Scenario): Promise<ScenarioResult> {
  const userId = `q7v_${scenario.id}`;
  const reasons: string[] = [];
  let hardFailure = false;
  let generatedName = "";
  let radarId = "";
  let runId = "";
  let reportId = "";
  let cardCount = 0;
  let storedEntryCount = 0;
  let firstCards: string[] = [];

  try {
    const generated = await postJson(app, "/api/radars/generate", { description: scenario.input }, userId);
    if (generated.res.status !== 200 || generated.json.success !== true) {
      return {
        id: scenario.id,
        label: scenario.label,
        status: "fail",
        generatedName,
        radarId,
        runId,
        reportId,
        cardCount,
        storedEntryCount,
        reasons: [`生成雷达失败: status=${generated.res.status}, message=${generated.json.error?.message ?? ""}`],
        firstCards,
      };
    }

    const data = generated.json.data as {
      spec?: RadarRequirementSpec;
      suggestedName?: string;
      radarVersion?: unknown;
      profileSummary?: unknown;
    };
    const spec = data?.spec ? confirmSpec(data.spec) : null;
    generatedName = data?.suggestedName ?? "";
    const generatedText = JSON.stringify({
      suggestedName: data?.suggestedName,
      spec: data?.spec,
      radarVersion: data?.radarVersion,
      profileSummary: data?.profileSummary,
    });
    if (!spec) {
      hardFailure = true;
      reasons.push("没有生成 RadarRequirementSpec");
    }
    if (!containsAny(generatedText, scenario.expectedKeywords)) {
      reasons.push(`WARN: 生成雷达未明显体现行业关键词: ${scenario.expectedKeywords.join(" / ")}`);
    }
    if (scenario.id !== "ai-events" && /AI 赛事雷达|全球 AI 赛事导航/.test(generatedName)) {
      hardFailure = true;
      reasons.push(`非 AI 行业被命名为 AI 赛事雷达: ${generatedName}`);
    }
    if (!spec) {
      return { id: scenario.id, label: scenario.label, status: "fail", generatedName, radarId, runId, reportId, cardCount, storedEntryCount, reasons, firstCards };
    }

    const radarName = generatedName || `${scenario.label}机会雷达`;
    const created = await postJson(app, "/api/radars", { name: radarName, kind: "custom", spec }, userId);
    if (created.res.status !== 200 || created.json.success !== true) {
      return {
        id: scenario.id,
        label: scenario.label,
        status: "fail",
        generatedName,
        radarId,
        runId,
        reportId,
        cardCount,
        storedEntryCount,
        reasons: [...reasons, `保存雷达失败: status=${created.res.status}, message=${created.json.error?.message ?? ""}`],
        firstCards,
      };
    }
    radarId = ((created.json.data ?? {}) as { id?: string }).id ?? "";

    const activated = await postJson(app, `/api/radars/${radarId}/activate`, {}, userId);
    if (activated.res.status !== 200 || activated.json.success !== true) {
      hardFailure = true;
      reasons.push(`激活雷达失败: status=${activated.res.status}, message=${activated.json.error?.message ?? ""}`);
    }

    const run = await postJson(app, `/api/radars/${radarId}/run`, { query: scenario.input }, userId);
    if (run.res.status !== 200 || run.json.success !== true) {
      return {
        id: scenario.id,
        label: scenario.label,
        status: "fail",
        generatedName,
        radarId,
        runId,
        reportId,
        cardCount,
        storedEntryCount,
        reasons: [...reasons, `运行雷达失败: status=${run.res.status}, message=${run.json.error?.message ?? ""}`],
        firstCards,
      };
    }
    const runData = run.json.data as { run?: { id?: string; status?: string }; opportunityCards?: OpportunityCard[] };
    runId = runData?.run?.id ?? "";
    const cards = runData?.opportunityCards ?? [];
    cardCount = cards.length;
    firstCards = cards.slice(0, 3).map((card) => card.title);
    if (runData?.run?.status !== "succeeded") {
      hardFailure = true;
      reasons.push(`运行状态不是 succeeded: ${runData?.run?.status ?? "unknown"}`);
    }
    if (cards.length === 0) {
      hardFailure = true;
      reasons.push("运行没有返回机会卡");
    }

    const opportunities = await getJson(app, `/api/opportunities?radar_id=${encodeURIComponent(radarId)}`, userId);
    const entries = ((opportunities.json.data ?? {}) as { entries?: unknown[] }).entries ?? [];
    storedEntryCount = entries.length;
    if (storedEntryCount === 0) {
      hardFailure = true;
      reasons.push("机会没有按 radarId 入库");
    }

    const report = await postJson(app, "/api/reports/generate", {
      radar_id: radarId,
      run_id: runId,
      radar_type: "custom",
      opportunities: cards,
      spec,
    }, userId);
    if (report.res.status !== 200 || report.json.success !== true) {
      return {
        id: scenario.id,
        label: scenario.label,
        status: "fail",
        generatedName,
        radarId,
        runId,
        reportId,
        cardCount,
        storedEntryCount,
        reasons: [...reasons, `报告生成失败: status=${report.res.status}, message=${report.json.error?.message ?? ""}`],
        firstCards,
      };
    }
    const reportData = report.json.data as { reportId?: string; markdown?: string };
    reportId = reportData?.reportId ?? "";
    const markdown = reportData?.markdown ?? "";
    if (!reportId) {
      hardFailure = true;
      reasons.push("报告没有 reportId");
    }
    if (!markdown || (firstCards[0] && !markdown.includes(firstCards[0]))) {
      hardFailure = true;
      reasons.push("Markdown 报告没有包含首个机会标题");
    }
  } catch (err) {
    return {
      id: scenario.id,
      label: scenario.label,
      status: "fail",
      generatedName,
      radarId,
      runId,
      reportId,
      cardCount,
      storedEntryCount,
      reasons: [`异常: ${err instanceof Error ? err.message : String(err)}`],
      firstCards,
    };
  }

  return {
    id: scenario.id,
    label: scenario.label,
    status: statusFromChecks(reasons, hardFailure),
    generatedName,
    radarId,
    runId,
    reportId,
    cardCount,
    storedEntryCount,
    reasons: reasons.length > 0 ? reasons : ["V1.0 生成、运行、入库和报告链路通过"],
    firstCards,
  };
}

function renderReport(results: ScenarioResult[], stoppedEarly: boolean): string {
  const passLike = results.filter((result) => result.status === "pass" || result.status === "near_pass").length;
  const failed = results.filter((result) => result.status === "fail").length;
  const lines = [
    "# Q7V Custom Radar 10 Smoke Report",
    "",
    `生成时间：${new Date().toISOString()}`,
    `总体结果：${passLike}/${SCENARIOS.length} 个场景达到 pass / near_pass，失败 ${failed} 个。`,
    `是否连续 3 个失败提前停止：${stoppedEarly ? "是" : "否"}`,
    "",
    "| # | 行业 | 结果 | 雷达名 | 机会卡 | 入库 | 报告 | 主要原因 |",
    "|---|---|---|---|---:|---:|---|---|",
  ];
  results.forEach((result, index) => {
    const reason = result.reasons.join("；").replace(/\|/g, "/");
    lines.push(`| ${index + 1} | ${result.label} | ${result.status} | ${result.generatedName || "-"} | ${result.cardCount} | ${result.storedEntryCount} | ${result.reportId ? "有" : "无"} | ${reason} |`);
  });
  lines.push("", "## 首批机会标题");
  for (const result of results) {
    lines.push("", `### ${result.label}`, ...(result.firstCards.length ? result.firstCards.map((title) => `- ${title}`) : ["- 无"]));
  }
  lines.push(
    "",
    "## 判定说明",
    "",
    "- `pass`：雷达生成、运行、入库和 Markdown 报告均通过，并且生成雷达能体现该行业。",
    "- `near_pass`：主链路通过，但雷达表达或候选相关性有轻微警告，适合作为下一轮质量优化输入。",
    "- `fail`：生成、运行、入库或报告任一主链路失败，或非 AI 行业误入 AI 赛事雷达。",
  );
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const ctx = createSmokeContext();
  const app = createApp(ctx);
  const results: ScenarioResult[] = [];
  let consecutiveFailures = 0;
  let stoppedEarly = false;

  console.log("=== Q7V 自定义雷达 10 行业 V1.0 验收 ===");
  for (const scenario of SCENARIOS) {
    const result = await runScenario(app, scenario);
    results.push(result);
    console.log(`${result.status.toUpperCase().padEnd(9)} ${scenario.label} cards=${result.cardCount} stored=${result.storedEntryCount}`);
    if (result.status === "fail") {
      consecutiveFailures += 1;
    } else {
      consecutiveFailures = 0;
    }
    if (consecutiveFailures >= 3) {
      stoppedEarly = true;
      console.log("连续 3 个行业失败，按验收规则提前停止。");
      break;
    }
  }

  const report = renderReport(results, stoppedEarly);
  fs.writeFileSync(path.resolve(process.cwd(), REPORT_FILE), report);

  const passLike = results.filter((result) => result.status === "pass" || result.status === "near_pass").length;
  const enough = !stoppedEarly && passLike >= 9;
  console.log(`\n报告已写入 ${REPORT_FILE}`);
  console.log(`结果：${passLike}/${SCENARIOS.length} pass-like，stoppedEarly=${stoppedEarly}`);
  cleanupTempFiles();
  process.exit(enough ? 0 : 1);
}

main().catch((err) => {
  console.error("Q7V 验收脚本执行失败：", err);
  cleanupTempFiles();
  process.exit(1);
});
