import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createIchAgentRoutes } from "../src/api/routes/ich-agent";
import { createIchAgentSessionStore } from "../src/ich/agent/session-store";
import { interpretIchAgentRequest } from "../src/ich/agent/intent";
import { retrievePublishedIchOpportunities } from "../src/ich/agent/retrieval";
import { validateExternalTargetUrl } from "../src/ich/agent/url-safety";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const now = new Date("2026-10-20T04:00:00.000Z");
const source: OpportunityV2Source = { id: "source-ok", name: "手工艺机会", url: "https://craft.example/opportunities", region: "CN", priority: "P0", types: ["competition"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: now.toISOString() };
function item(id: string, overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return { id, title: `${id} 押花手工艺征集`, summary: "面向手工艺人的创作征集", source_id: "source-ok", source_item_id: id, source_name: "手工艺机会", source_url: "https://craft.example/list", detail_url: `https://craft.example/${id}`, category: "competition", region: "CN", tags: ["押花", "手工艺"], deadline: "2026-12-01", deadline_text: "截止2026-12-01", status: "CURRENT", first_seen_at: now.toISOString(), last_seen_at: now.toISOString(), discovered_by_sources: ["source-ok"], radar_relevance: "RELEVANT", directions: ["craft_arts"], work_formats: ["material_craft"], ...overrides };
}

const fixtures = [item("open-1"), item("open-2", { radar_relevance: "IRRELEVANT" }), item("open-3"), item("open-4"), item("open-5"), item("expired", { deadline: "2026-01-01", status: "EXPIRED" }), item("unsafe", { deadline_conflict_unsafe: true }), item("bad-title", { title: "����logo" }), item("hold", { source_id: "artconnect-opportunities" })];
const marketSource: OpportunityV2Source = { ...source, id: "source-market", name: "手工艺市集", types: ["exhibition_market"] };

async function run(): Promise<void> {
  const results = retrievePublishedIchOpportunities({ message: "我做押花，找最近可以报名的手工艺比赛", opportunities: fixtures, sources: [source], now });
  assert.equal(results.some((row) => row.opportunity_id === "open-1"), true, "相关公开库记录必须被检索");
  const broadPoolResults = retrievePublishedIchOpportunities({ message: "我做押花，找手工艺比赛", opportunities: fixtures.slice(0, 2), sources: [source], now });
  assert.equal(broadPoolResults.some((row) => row.opportunity_id === "open-2"), true, "不能只读取主页RELEVANT结果子集");
  assert.equal(results.some((row) => ["expired", "bad-title", "hold"].includes(row.opportunity_id ?? "")), false, "过期、乱码和hold不得泄漏到助手");
  const sourceNameOnlyMatch = retrievePublishedIchOpportunities({
    message: "我做竹编，找广州文创手工艺比赛",
    opportunities: [item("source-name-only", {
      title: "广州青创杯科技创新创业大赛",
      summary: "来源页面未提供更详细摘要。",
      source_name: "文创赛网｜鲸创意",
      tags: ["competition"],
      event_location: "广州",
      directions: [],
      work_formats: [],
    })],
    sources: [source],
    now,
  });
  assert.equal(sourceNameOnlyMatch.length, 0, "来源品牌里的‘文创’不能把无关科技创业赛误配给竹编需求");
  const navigationContent = retrievePublishedIchOpportunities({
    message: "我做竹编，找手工艺比赛",
    opportunities: [item("navigation-content", {
      title: "Recipients",
      summary: "Archives | Search | Login | Become a Member | About | What we do | Stories | FAQs | Contact | Recipients",
      source_name: "Heritage Crafts",
      tags: ["competition", "craft", "heritage craft", "maker", "makers"],
    })],
    sources: [source],
    now,
  });
  assert.equal(navigationContent.length, 0, "导航摘要和通用来源标签不能将非机会页面当作比赛");
  const misclassifiedType = retrievePublishedIchOpportunities({
    message: "我做手工艺，想找海外驻地研修机会",
    opportunities: [item("tour-misclassified", {
      title: "2026 Craft and Textile Immersive Tour",
      summary: "A guided craft and textile learning journey.",
      category: "competition",
      region: "GLOBAL",
      tags: ["craft", "competition"],
    })],
    sources: [source],
    now,
  });
  assert.equal(misclassifiedType[0]?.opportunity_type, "研修 / 国际交流", "明确的研修/之旅标题不能沿用错误的赛事分类");
  const mixedTypes = retrievePublishedIchOpportunities({
    message: "我做押花，请比较手工艺比赛和市集",
    opportunities: [...fixtures.slice(0, 6), item("market-1", { title: "Craft Makers Market Open Call", summary: "An open craft fair for makers", tags: ["craft", "market"], category: "exhibition_market", source_id: "source-market", source_name: "泛设计来源" })],
    sources: [source, marketSource],
    now,
  });
  assert.equal(mixedTypes.some((row) => row.opportunity_id === "market-1"), true, "多类型请求应为每个有候选的类型保留至少一条结果，便于同轮比较");
  const unsafeResult = results.find((row) => row.opportunity_id === "unsafe");
  if (unsafeResult) {
    assert.equal(unsafeResult.lifecycle, "conflict");
    assert.notEqual(unsafeResult.deadline_fact.value, "2026-12-01", "不安全精确截止不能对用户显示");
  }

  const intent = interpretIchAgentRequest({ message: "我做押花，想找广州最近还能报名、只看免费的比赛" });
  assert.equal(intent.constraints.region, "all", "地点偏好不能推断为法定参赛资格或仅限国内");
  assert.equal(intent.constraints.location_terms.includes("广州"), true);
  assert.equal(intent.constraints.budget_preference, "free_only");
  const changed = interpretIchAgentRequest({ message: "这次只看国内", previous: intent.constraints });
  assert.equal(changed.constraints.craft_terms.includes("押花"), true, "改变地区时必须保留工艺条件");
  assert.equal(interpretIchAgentRequest({ message: "我是张三，我做竹编，想找赛事" }).constraints.craft_terms.includes("竹编"), true, "本地解析保留需求语义，同时外发脱敏身份信息");

  assert.equal(validateExternalTargetUrl("https://example.org/call").ok, true);
  for (const url of ["http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data", "https://user:pass@example.org/", "file:///etc/passwd", "http://localhost/"]) {
    assert.equal(validateExternalTargetUrl(url).ok, false, `must reject unsafe URL: ${url}`);
  }

  const store = createIchAgentSessionStore({ now: () => now, maxTurns: 2 });
  const created = store.create();
  assert.equal(created.token.length >= 43, true, "session token must have 256 bits entropy");
  assert.equal(store.get(created.token)?.turns.length, 0);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ich-v17-agent-"));
  let searchCalls = 0;
  let fetchCalls = 0;
  const app = createIchAgentRoutes({
    enabled: true,
    webEnabled: false,
    now: () => now,
    poolPath: path.join(temp, "pool.json"),
    sourcesPath: path.join(temp, "sources.json"),
    stateDir: temp,
    opportunities: fixtures,
    sources: [source],
    search: async () => { searchCalls++; return { results: [], http_status: 200, billable: false }; },
    fetchPage: async () => { fetchCalls++; return { title: "", content: "", final_url: "https://craft.example/", http_status: 200 }; },
  });
  const response = await app.request("/agent/query", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://ich.chanceping.com" },
    body: JSON.stringify({ request_id: "request-library-1", message: "我做押花，找手工艺比赛", mode: "library" }),
  }, { hostname: "ich.chanceping.com" });
  assert.equal(response.status, 200);
  const payload = await response.json() as { turn_id: string; results: Array<{ result_ref: string; opportunity_id?: string }>; tool_receipt: { search_calls: number; fetch_calls: number } };
  assert.equal(payload.results.length > 0, true);
  assert.equal(payload.tool_receipt.search_calls, 0);
  assert.equal(payload.tool_receipt.fetch_calls, 0);
  assert.equal(searchCalls, 0);
  assert.equal(fetchCalls, 0);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie ?? "", /HttpOnly/);
  assert.match(cookie ?? "", /SameSite=Strict/);
  const repeated = await app.request("/agent/query", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://ich.chanceping.com", cookie: cookie?.split(";")[0] ?? "" },
    body: JSON.stringify({ request_id: "request-library-1", message: "changed message ignored for same id", mode: "web" }),
  }, { hostname: "ich.chanceping.com" });
  assert.equal(repeated.status, 200, "same request id must replay its stored response");
  assert.equal(searchCalls, 0, "idempotent replay must not call search");
  assert.equal(fetchCalls, 0, "idempotent replay must not fetch");

  const libraryCookie = cookie?.split(";")[0] ?? "";
  const followUp = await app.request("/agent/query", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://ich.chanceping.com", cookie: libraryCookie },
    body: JSON.stringify({ request_id: "request-follow-002", message: "请详细看第2条", parent_turn_id: payload.turn_id, mode: "library" }),
  });
  assert.equal(followUp.status, 200, "自然语言序号引用应该解析到上一轮具体结果");
  const followPayload = await followUp.json() as { parent_turn_id: string | null; results: Array<{ opportunity_id?: string }> };
  assert.equal(followPayload.parent_turn_id, payload.turn_id);
  assert.equal(followPayload.results.length, 1);
  assert.equal(followPayload.results[0].opportunity_id, payload.results[1].opportunity_id, "序号应绑定用户实际看到的上一轮顺序");
  const comparison = await app.request("/agent/query", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://ich.chanceping.com", cookie: libraryCookie },
    body: JSON.stringify({ request_id: "request-compare-003", message: "比较一下", compare_result_refs: payload.results.slice(0, 2).map((row) => row.result_ref), parent_turn_id: payload.turn_id, mode: "library" }),
  });
  assert.equal(comparison.status, 200);
  const comparisonPayload = await comparison.json() as { comparison?: Array<unknown> };
  assert.equal(comparisonPayload.comparison?.length, 2);
  const invalidParent = await app.request("/agent/query", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://ich.chanceping.com", cookie: libraryCookie },
    body: JSON.stringify({ request_id: "request-parent-004", message: "比较", compare_result_refs: payload.results.slice(0, 2).map((row) => row.result_ref), parent_turn_id: "turn-does-not-exist-000", mode: "library" }),
  });
  assert.equal(invalidParent.status, 400, "无效父轮次不能回退到其他轮次");

  const crossOrigin = await app.request("/agent/query", { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: JSON.stringify({ message: "test" }) });
  assert.equal(crossOrigin.status, 403);

  let liveSearchQuery = "";
  let liveFetchCalls = 0;
  let liveTranslationCalls = 0;
  const poolBefore = JSON.stringify(fixtures);
  const webApp = createIchAgentRoutes({
    enabled: true, webEnabled: true, secureCookies: false, now: () => now, stateDir: temp, dailyBudgetCny: 0.5,
    env: { DEEPSEEK_API_KEY: "fixture-only-never-sent" } as NodeJS.ProcessEnv,
    opportunities: fixtures, sources: [source],
    search: async (query, safeQuestion) => {
      liveSearchQuery = `${query} ${safeQuestion}`;
      return { results: [
        { title: "International Craft Festival Open Call 2026", url: "https://new.example/call", snippet: "An open call for craft makers.", summary: "An open call for craft makers.", date: null, site_name: "New Example" },
        { title: "华农师生在全国数字艺术设计大赛中斩获佳绩", url: "https://news.example/winners", snippet: "获奖结果报道", summary: "获奖结果报道", date: null, site_name: "News Example" },
      ], http_status: 200, billable: true };
    },
    translateTitles: async (titles) => { liveTranslationCalls++; return { translations: titles.map((row) => ({ id: row.id, title_zh: "国际手工艺节公开征集 2026" })), input_tokens: 100, output_tokens: 30 }; },
    fetchPage: async () => {
      liveFetchCalls++;
      return { title: "International Craft Festival Open Call", final_url: "https://new.example/call", http_status: 200, content: "# 关于征集参赛作品的通知\n名称：2026手工艺参赛作品征集公告\n报名时间：即日起至2026年10月15日\n1\\.Application fee: none.\n参赛对象：面向全国和海内外符合主题的个人和单位。\n个人参赛者：年满18周岁的工艺美术从业者、独立设计师及相关院校师生。\n单位/团队参赛者：文创产品设计开发单位、产品设计机构及创意团队。\n参赛群体：新时代湾区青少年及相关创作团队。\n多人合作参赛作品，所有作者均须年满18周岁。\n（一）参赛作品要求\nWork requirements: Submit two unpublished woven bamboo works.\n参赛作品以照片形式投稿，单张分辨率不低于1200万像素、文件大于2MB，每个个人或团队报送作品不超过3件。" };
    },
  });
  const webResponse = await webApp.request("/agent/query", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://ich.chanceping.com" },
    body: JSON.stringify({ request_id: "request-web-001", message: "我叫张三，电话13812345678，邮箱 zhangsan@example.org。我做竹编，帮我网上找近期手工艺比赛的报名要求", mode: "web" }),
  });
  assert.equal(webResponse.status, 200);
  const webPayload = await webResponse.json() as { results: Array<{ source_kind: string; title_zh: string; title_translation?: string; original_title?: string; lifecycle?: string; deadline_fact?: { value: string | null; status: string }; key_gap?: string; next_action?: string; money_facts?: Array<{ value: string | null }>; eligibility_facts?: Array<{ value: string | null }>; work_requirements?: Array<{ value: string | null }> }>; evidences: Array<{ field: string; value: string }>; tool_receipt: { search_calls: number; fetch_calls: number; chat_calls: number } };
  assert.equal(webPayload.results.some((row) => row.source_kind === "web_new"), true, "网页候选应作为临时线索返回");
  assert.equal(webPayload.results.some((row) => row.title_zh.includes("斩获佳绩")), false, "已结束的获奖新闻不能当作当前机会");
  const webCandidate = webPayload.results.find((row) => row.source_kind === "web_new");
  assert.equal(webCandidate?.title_translation, "translated", "网页外文标题必须标识为已翻译");
  assert.equal(webCandidate?.title_zh, "国际手工艺节公开征集 2026");
  assert.equal(webPayload.tool_receipt.search_calls, 1);
  assert.equal(webPayload.tool_receipt.fetch_calls, 1);
  assert.equal(webPayload.tool_receipt.chat_calls, 1);
  assert.equal(liveTranslationCalls, 1);
  assert.equal(liveFetchCalls, 1);
  assert.equal(/张三|13812345678|zhangsan@example\.org/u.test(liveSearchQuery), false, "外部查询不得包含个人身份、电话或邮箱");
  assert.equal(webPayload.evidences.some((row) => row.field === "deadline" && row.value.includes("2026年10月15日")), true);
  assert.equal(webCandidate?.deadline_fact?.value, "2026-10-15", "明确的即日起至日期应解析成截止日");
  assert.equal(webCandidate?.lifecycle, "historical", "已经过去的报名截止不得标作当前开放");
  assert.match(webCandidate?.next_action ?? "", /不建议提交/u, "过期候选的下一步不得仍然建议申请");
  assert.equal(webPayload.evidences.some((row) => row.field === "money"), true);
  assert.equal(webPayload.evidences.some((row) => row.field === "eligibility"), true);
  assert.equal(webPayload.results.find((row) => row.source_kind === "web_new")?.eligibility_facts?.some((fact) => fact.value?.includes("青少年")), true, "年龄群体线索必须保留原文摘录");
  assert.equal(webPayload.results.find((row) => row.source_kind === "web_new")?.eligibility_facts?.some((fact) => fact.value?.includes("年满18周岁")), true, "年龄/申请对象字段应保留原文，但不能代替用户资格判断");
  assert.equal(webPayload.results.find((row) => row.source_kind === "web_new")?.eligibility_facts?.some((fact) => fact.value?.includes("单位/团队参赛者")), true, "单位/团队资格不能被个人参赛条件覆盖");
  assert.match(webPayload.results.find((row) => row.source_kind === "web_new")?.key_gap ?? "", /未确认这是资格限制/u, "不得把提及年龄群体直接推断为资格限制");
  const webWorkFacts = webPayload.results.find((row) => row.source_kind === "web_new")?.work_requirements ?? [];
  const webMoneyFacts = webPayload.results.find((row) => row.source_kind === "web_new")?.money_facts ?? [];
  assert.equal(webWorkFacts.some((fact) => fact.value?.includes("Submit two unpublished woven bamboo works")), true);
  assert.equal(webWorkFacts.some((fact) => fact.value?.includes("1200万像素") && fact.value.includes("不超过3件")), true, "作品的实际提交材料限制应从原文摘录");
  assert.equal(webWorkFacts.some((fact) => fact.value === "（一）参赛作品要求"), false, "章节标题不能冒充具体作品要求");
  assert.equal(webMoneyFacts.some((fact) => fact.value === "1.Application fee: none."), true, "Fetch Markdown 转义符不应污染可读证据");
  assert.equal(webWorkFacts.some((fact) => fact.value?.startsWith("名称：") || fact.value?.startsWith("#")), false, "网页标题/元数据不得冒充作品要求");
  assert.equal(webPayload.evidences.some((row) => row.field === "work_requirements"), true);
  assert.equal(JSON.stringify(fixtures), poolBefore, "新网页线索不得写入正式机会池");
  const webCookie = webResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
  const webRepeated = await webApp.request("/agent/query", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://ich.chanceping.com", cookie: webCookie },
    body: JSON.stringify({ request_id: "request-web-001", message: "please repeat", mode: "web" }),
  });
  assert.equal(webRepeated.status, 200);
  assert.equal(liveFetchCalls, 1, "重复提交不得再次触发付费工具");
  assert.equal(liveTranslationCalls, 1);
  fs.rmSync(temp, { recursive: true, force: true });
  console.log("ICH_V17_AGENT: PASS");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
