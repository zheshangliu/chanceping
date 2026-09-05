import fs from "node:fs";
import path from "node:path";
import { AI_EVENT_SOURCE_NETWORK } from "../src/demo/ai-events-sample-room";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import crypto from "node:crypto";

type AuditRow = { source_radar: string; target_radar: string; mapping_reason: string; confidence: "high" | "medium" | "low"; action: string };
const root = process.cwd();
const read = (file: string) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const normalize = (url: string | undefined) => { try { const u = new URL(url ?? ""); u.hash = ""; for (const key of [...u.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(key)) u.searchParams.delete(key); return u.toString().replace(/\/$/, ""); } catch { return url ?? ""; } };
const registry = getIchSourceRegistryV2();
const ichStore = read("data/ich-opportunities.json") as { entries: Array<{ title: string; sources?: Array<{ url?: string }>; is_published?: boolean; status?: string }> };
const ichUrls = new Set(ichStore.entries.flatMap((entry) => (entry.sources ?? []).map((source) => normalize(source.url))));
const q5Radars = read("data/q5-r-live/radars.json").radars as Array<{ id: string; name: string }>;
const q5Entries = read("data/q5-r-live/opportunity-store.json").entries as Array<{ radarId: string; card: { title: string; official_source_url?: string; verificationStatus?: string } }>;
const globalRadars = q5Radars.filter((radar) => /Golden Q5-R Test #(?:9|20)/.test(radar.name));
const globalRows = globalRadars.flatMap((radar) => q5Entries.filter((entry) => entry.radarId === radar.id).map((entry) => ({ radar, entry })));
const strongRe = /非遗|非物质文化|传统工艺|工艺美术|手工艺|文创|文旅|博物馆|museum|heritage|craft|artisan|handmade|cultural|design|伴手礼|供应商|展销|市集|IP/i;
const sourcePageRe = /(^首页|政府采购$|采购资讯|征集调查|商家入驻|挑战杯官网|design竞赛网$|^设计竞赛网|联系我们|买手店的四种经营模式|Indeed|Reddit|Scribd)/i;
const unrelatedRe = /文学|职位|招聘|门票|ticket|乒乓|体育|足球|software|AI(?!.*文化)/i;
const globalCandidates = globalRows.map(({ radar, entry }) => {
  const title = entry.card.title;
  const url = entry.card.official_source_url ?? "";
  const isSource = sourcePageRe.test(title);
  const unrelated = unrelatedRe.test(title);
  const strong = strongRe.test(title);
  const inIch = ichUrls.has(normalize(url));
  const officialish = /\.gov\.cn|\.gov$|\.gov\.hk|museum|cnacs\.net\.cn|ctta\.cn|\.org\.cn/i.test(url);
  const candidate = !isSource && !unrelated && strong;
  return { opportunity: title, source: url, original_radar: radar.name, ich_candidate: candidate, in_ich: inIch, reason: unrelated ? "与非遗/文化创意范围无关" : isSource ? "来源索引/聚合页，不是单项机会详情" : strong ? (officialish ? "命中文创/工艺/博物馆/文旅语义，建议回溯官方详情页" : "命中相关语义，但来源需回溯官方详情页") : "未命中融合规则", priority: candidate ? (officialish && /非遗|工艺|博物馆|文创|供应商|伴手礼/i.test(title) ? "P0" : "P1") : "保留原雷达", confidence: officialish ? "medium" : "low" as const };
});
const aiSeed = read("src/demo/ai-events.recorded.json").opportunities as Array<{ title: string; url: string; verification_status?: string }>;
const aiCulture = aiSeed.filter((item) => strongRe.test(item.title));
const allStore = read("data/opportunity-store.json").entries as Array<{ radarId?: string; radarIds?: string[]; radar_type?: string; card: { title: string; official_source_url?: string; verificationStatus?: string } }>;
const bridgeCards = allStore.filter((entry) => entry.radarId === "builtin_cultural_heritage" || entry.radarIds?.includes("builtin_cultural_heritage"));
const sourceDomains = new Set(registry.sources.map((source) => { try { return new URL(source.canonical_url).hostname.replace(/^www\./, ""); } catch { return source.canonical_url; } }));
const userSources = ["shejijingsai.com", "cnyisai.com", "yishujs.com", "ncda.org.cn", "competition.design", "bhuntr.com", "ichaward"];
const missingSources = userSources.map((domain) => ({ domain, in_ich_registry: [...sourceDomains].some((value) => value === domain || value.endsWith(`.${domain}`)), seen_in_global_radar: globalRows.some(({ entry }) => (entry.card.official_source_url ?? "").includes(domain)), recommendation: domain === "bhuntr.com" || domain === "shejijingsai.com" ? "仅作为发现源，必须回溯官方详情页" : "先做来源端点核验，再决定注册" }));
const tags = [
  { tag: "AI", owner: "AI Events", ich_policy: "仅当同时命中文化/非遗/博物馆/传统工艺或文化IP语义时进入 ICH 候选" },
  { tag: "Design", owner: "Global Competition / custom radars", ich_policy: "文创、工艺美术、文旅礼物或文化设计进入候选；普通工业/UI/平面设计保留原雷达" },
  { tag: "Craft", owner: "Global Competition", ich_policy: "手工艺、artisan、traditional craft 进入候选" },
  { tag: "ICH", owner: "ICH Radar", ich_policy: "正式发布仍以 ICH Evidence/DS3/DS14 门禁为准" },
  { tag: "Culture", owner: "ICH / AI Events", ich_policy: "文化创作、博物馆、文化遗产相关机会进入候选" },
  { tag: "Game", owner: "AI Events", ich_policy: "仅传统文化/非遗数字化或文化叙事游戏进入候选" },
  { tag: "Education", owner: "AI Events / ICH", ich_policy: "非遗研学、传承培训、博物馆教育可进入候选" },
  { tag: "Business", owner: "Business Radar / ICH", ich_policy: "文创采购、供应商、渠道合作需官方行动入口" },
];
const mappingRows: AuditRow[] = [
  { source_radar: "Global Competition / Golden Q5-R #9", target_radar: "ICH", mapping_reason: "押花、文创、伴手礼、博物馆文创、工艺美术等语义", confidence: "high", action: "候选化；逐条回溯官方详情页" },
  { source_radar: "Global Competition / Golden Q5-R #20", target_radar: "ICH", mapping_reason: "手工市集、手工艺展、珠宝展和摊主招募语义", confidence: "medium", action: "候选化；聚合/社媒仅保留线索" },
  { source_radar: "AI Events", target_radar: "ICH", mapping_reason: "当前录制种子未出现文化/非遗/博物馆/传统工艺语义", confidence: "high", action: "不迁移；继续保留 AI Events" },
  { source_radar: "AI Events → builtin_cultural_heritage bridge", target_radar: "ICH", mapping_reason: "已有 3 条桥接卡，但均为 unverified 示例 URL", confidence: "high", action: "撤销自动迁移资格，改为待核验候选" },
];
const sourceAudit = ["# Stage 4E 跨雷达来源审计", "", `- ICH Source Registry：${registry.sources.length} 个来源`, `- AI Events Source Network：${AI_EVENT_SOURCE_NETWORK.length} 个来源`, `- Global Competition 可确认相关雷达：${globalRadars.length} 个`, "", "## ICH 当前来源列表", "", "| id | name | role | source_role | evidence | categories |", "| --- | --- | --- | --- | --- | --- |", ...registry.sources.map((source) => `| ${source.id} | ${source.name} | ${source.role} | ${source.source_role} | ${source.evidence_level} | ${source.categories.join(", ")} |`), "", "## 来源归属判断", "", "| source_radar | target_radar | mapping_reason | confidence | action |", "| --- | --- | --- | --- | --- |", ...mappingRows.map((row) => `| ${row.source_radar} | ${row.target_radar} | ${row.mapping_reason} | ${row.confidence} | ${row.action} |`)].join("\n");
const oppAudit = ["# Stage 4E 跨雷达机会审计", "", "本报告只读分析，不代表迁移或正式发布。聚合页、示例 URL、社交媒体和未核验页面不得直接进入 ICH 正式库。", "", `- Global Competition 相关记录：${globalRows.length}`, `- 规则命中的 ICH 候选：${globalCandidates.filter((row) => row.ich_candidate).length}`, `- 已在 ICH（按规范化主来源 URL）：${globalCandidates.filter((row) => row.in_ich).length}`, `- AI Events 录制种子：${aiSeed.length}`, `- AI Events 录制种子命中文化语义：${aiCulture.length}`, `- 旧桥接卡：${bridgeCards.length}（全部未核验）`, "", "## Global Competition → ICH", "", "| opportunity | source | original_radar | ich_candidate | reason | priority |", "| --- | --- | --- | --- | --- | --- |", ...globalCandidates.map((row) => `| ${row.opportunity.replace(/\|/g, "／")} | ${row.source} | ${row.original_radar} | ${row.ich_candidate ? "yes" : "no"} | ${row.reason} | ${row.priority} |`), "", "## AI Events → ICH", "", "| item | official_url | decision | evidence |", "| --- | --- | --- | --- |", ...aiSeed.map((item) => `| ${item.title} | ${item.url} | ${strongRe.test(item.title) ? "candidate_review" : "retain AI Events"} | ${item.verification_status ?? "未确认"} |`), "", "### 旧桥接卡", "", ...bridgeCards.map((entry) => `- ${entry.card.title} — ${entry.card.official_source_url ?? "未提供 URL"} — ${entry.card.verificationStatus ?? "未确认"}；不得直接导入。`)].join("\n");
const missingReport = ["# Stage 4E 缺失来源报告", "", "对用户指定来源和当前 ICH Source Registry 做仓库内静态比对；未进行网络可达性或当前届次确认。", "", "| domain | in_ich_registry | seen_in_global_radar | recommendation |", "| --- | --- | --- | --- |", ...missingSources.map((row) => `| ${row.domain} | ${row.in_ich_registry ? "yes" : "no"} | ${row.seen_in_global_radar ? "yes" : "no"} | ${row.recommendation} |`), "", "## 优先级建议", "", "1. 先注册并核验 shejijingsai.com、bhuntr.com 为 discovery_source，不允许直接发布。", "2. 对 cnyisai.com、yishujs.com、ncda.org.cn、competition.design、ichaward 建立 endpoint healthcheck 后再决定是否注册。", "3. 设计竞赛、博物馆、市集、采购等机会必须落到单项官方详情页，不能把聚合首页当作机会。"].join("\n");
const crossReference = ["# ChancePing 跨雷达机会映射设计", "", "本阶段只定义审计和映射，不写入统一机会池。", "", "## Mapping Contract", "", "```json", JSON.stringify({ source_radar: "Global Competition | AI Events | ICH", target_radar: "ICH", mapping_reason: "可解释的文化/非遗/工艺/文创/博物馆/文旅关联", confidence: "high | medium | low", action: "retain | candidate_review | official_backtrace | do_not_merge" }, null, 2), "```", "", "## 统一 Opportunity Tags", "", "| tag | owner | ICH policy |", "| --- | --- | --- |", ...tags.map((row) => `| ${row.tag} | ${row.owner} | ${row.ich_policy} |`), "", "## 迁移门禁", "", "- `ich_candidate=true` 只表示进入审核队列，不代表 `is_published=true`。", "- 主来源 URL、申请入口、截止时间、适用对象和证据必须重新通过 ICH DS3/DS14。", "- AI/设计/游戏等跨域机会必须有明确文化/非遗关联；普通 AI、普通软件、普通设计赛事保留原雷达。", "- 统一机会池应先建立只读索引和 provenance，再考虑受控导入；当前不执行导入。"].join("\n");
fs.mkdirSync(path.resolve(root, "docs"), { recursive: true });
fs.writeFileSync(path.resolve(root, "docs/cross-radar-source-audit-report.md"), `${sourceAudit}\n`);
fs.writeFileSync(path.resolve(root, "docs/cross-radar-opportunity-audit-report.md"), `${oppAudit}\n`);
fs.writeFileSync(path.resolve(root, "docs/missing-source-report.md"), `${missingReport}\n`);
fs.writeFileSync(path.resolve(root, "docs/radar-cross-reference.md"), `${crossReference}\n`);
const formalStoreSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root, "data/ich-opportunities.json"))).digest("hex");
const summary = { stage: "4E", readonly: true, formal_store_write: false, formal_store_sha256: formalStoreSha256, ich_source_count: registry.sources.length, ai_event_source_count: AI_EVENT_SOURCE_NETWORK.length, global_radar_count: globalRadars.length, global_related_records: globalRows.length, global_ich_candidates: globalCandidates.filter((row) => row.ich_candidate).length, global_already_in_ich: globalCandidates.filter((row) => row.in_ich).length, ai_seed_count: aiSeed.length, ai_culture_candidates: aiCulture.length, ai_bridge_cards: bridgeCards.length, missing_user_sources: missingSources.filter((row) => !row.in_ich_registry).length, recommended_next_stage: "先做跨雷达只读索引与官方回溯，再决定 Universal Opportunity Pool" };
fs.writeFileSync(path.resolve(root, "docs/stage4e-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
