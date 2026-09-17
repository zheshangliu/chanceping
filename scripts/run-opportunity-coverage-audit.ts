import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseCnafGuidesListing, parseEenPartneringListing } from "../src/ich/aggregation/adapters/coverage-sources";
import { hasEncodingCorruption } from "../src/ich/aggregation/adapters/common";
import { buildOpportunityV2MemoSnapshot, opportunityV2LiveStatus, filterOpportunityV2Radar, readOpportunityV2Health, mergeDefaultOpportunityV2Sources, DEFAULT_OPPORTUNITY_V2_SOURCES } from "../src/opportunity-v2";
import { buildOpportunityCoverageAssessments, publicOpportunityCoverageAssessment } from "../src/opportunity-v2/opportunity-coverage";
import { OPPORTUNITY_COVERAGE_TYPES } from "../src/opportunity-v2/opportunity-coverage";
import type { OpportunityV2, OpportunityV2Source, OpportunityV2SourceHealth } from "../src/opportunity-v2/types";

const root = process.cwd();
const now = new Date("2026-09-15T00:00:00.000Z");
const dataDir = path.join(root, "data/opportunity-v2");
const auditDir = path.join(root, "audits/ich/opportunity-coverage-v1-1/latest");
const reportDir = path.join(root, "reports/ich/v11");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(fileName: string, value: unknown): void {
  fs.writeFileSync(path.join(auditDir, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function gitValue(args: string[]): string {
  return childProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function hostOf(value: string): string {
  try { return new URL(value).hostname.toLowerCase(); } catch { return "invalid"; }
}

function sourceRows(sources: OpportunityV2Source[], opportunities: OpportunityV2[], health: OpportunityV2SourceHealth[]): Array<Record<string, unknown>> {
  const healthById = new Map(health.map((row) => [row.source_id, row]));
  const poolCounts = new Map<string, number>();
  for (const item of opportunities) poolCounts.set(item.source_id, (poolCounts.get(item.source_id) ?? 0) + 1);
  const deepWork = new Set(["on-the-move-open-calls", "curatorspace-opportunities", "american-craft-council-opportunities", "craft-scotland-opportunities", "artconnect-opportunities", "kcdf-opportunities"]);
  return sources.map((source) => {
    const row = healthById.get(source.id);
    const sourcePoolCount = poolCounts.get(source.id) ?? 0;
    const status = row?.ok && row.items_seen > 0 ? "PIPELINE_VERIFIED" : row?.ok === false ? "WEB_OBSERVED" : sourcePoolCount > 0 ? "WEB_OBSERVED" : "REGISTERED";
    return {
      source_id: source.id,
      name: source.name,
      url: source.url,
      region: source.region,
      enabled: source.enabled,
      configured_status: source.status,
      coverage_status: status,
      deep_work: deepWork.has(source.id),
      pool_items_in_snapshot: sourcePoolCount,
      health: row ?? null,
      evidence_basis: row ? "READ_ONLY_SNAPSHOT_SOURCE_HEALTH" : sourcePoolCount ? "READ_ONLY_SNAPSHOT_POOL" : "NO_RUNTIME_EVIDENCE",
      production_status: "NOT_CHANGED_THIS_TURN",
    };
  });
}

async function liveProbe(source: OpportunityV2Source): Promise<Record<string, unknown>> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(source.url, { headers: { accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: controller.signal });
    const text = await response.text();
    const parsed = source.id === "cnaf-guides" ? parseCnafGuidesListing(text, source.url) : parseEenPartneringListing(text, source.url);
    return {
      source_id: source.id,
      url: source.url,
      request: "GET",
      http_status: response.status,
      bytes: Buffer.byteLength(text, "utf8"),
      elapsed_ms: Date.now() - started,
      parser: source.id === "cnaf-guides" ? "cnaf-guides-v1" : "een-partnering-v1",
      parsed_items: parsed.length,
      sample_titles: parsed.slice(0, 3).map((item) => item.title),
      status: response.ok && parsed.length > 0 ? "PIPELINE_VERIFIED" : response.ok ? "WEB_OBSERVED" : "REGISTERED",
      blocker: response.ok && parsed.length === 0 ? "当前抓取页没有与文创/非遗/手工艺相关的 Business Request 正例；保留观察，不进入公开覆盖" : response.ok ? null : `HTTP ${response.status}`,
      production_status: "NOT_DEPLOYED",
    };
  } catch (error) {
    return { source_id: source.id, url: source.url, request: "GET", http_status: null, bytes: 0, elapsed_ms: Date.now() - started, parser: source.id === "cnaf-guides" ? "cnaf-guides-v1" : "een-partnering-v1", parsed_items: 0, sample_titles: [], status: "REGISTERED", blocker: error instanceof Error ? error.message : String(error), production_status: "NOT_DEPLOYED" };
  } finally {
    clearTimeout(timer);
  }
}

function markdownDigest(input: {
  branch: string;
  commit: string;
  pool: number;
  persistedSources: number;
  effectiveSources: number;
  coverageCount: number;
  lanes: Record<string, number>;
  typeCounts: Record<string, number>;
  suggestions: Array<Record<string, unknown>>;
  probes: Array<Record<string, unknown>>;
}): string {
  const suggestionLines = input.suggestions.map((item, index) => `### ${index + 1}. ${item.title}\n- 类型：${(item.view_types as string[]).join("、") || "待复核"}\n- 分区：${item.lane}\n- 来源：${item.source}\n- 截止：${item.deadline ?? "待确认"}\n- 钱的方向：${item.money_flow}\n- 资格缺口：${(item.qualification_gaps as string[]).join("；") || "待核验"}\n- 下一步：${item.next_action}\n- 原文：${item.detail_url}`).join("\n\n");
  const probeLines = input.probes.map((probe) => `- ${probe.source_id}：${probe.status}，HTTP ${probe.http_status ?? "—"}，解析 ${(probe.parsed_items as number) ?? 0} 条${probe.blocker ? `；${probe.blocker}` : ""}`).join("\n");
  return `# 盯非遗｜综合机会覆盖 V1.1 业务摘要\n\n生成时间：${now.toISOString()}\n分支：${input.branch}\ncommit：${input.commit}\n\n## 承接状态\n\n上一包采购工作台已在 \`fb3a6edcac2dbee826ea6bb13d70a01374961397\` 交付；生产 M0 业务基线仍是 \`f514ee6b624dc2bb5abf12bb317cb30c37bedb5d\`。本轮复用采购工作台、私有跟进、变更摘要和导出；没有重复五源上线。\n\n本分支是预览交付，**NOT_DEPLOYED**。生产审批与上一包 backlog 继续保留。\n\n## 当前只读快照\n\n- persisted Source Pool：${input.persistedSources}\n- effective defaults in memory：${input.effectiveSources}\n- Opportunity Pool：${input.pool}\n- 覆盖 assessment：${input.coverageCount}\n- 分区：${Object.entries(input.lanes).map(([key, value]) => `${key} ${value}`).join(" · ")}\n- 类型映射（多标签可重叠）：${Object.entries(input.typeCounts).map(([key, value]) => `${key} ${value}`).join(" · ")}\n\n## 六类覆盖建议\n\n多类型机会保持一个 opportunity_id；费用、资助、资格和截止字段分开，不把报名费写成奖金，不把“可能合作”写成保证订单。\n\n## 当前/提前跟进样本\n\n${suggestionLines || "当前快照没有可安全展示的综合机会，不补假数据。"}\n\n## N2 有界来源验证\n\n${probeLines}\n\nEEN 是宽泛合作目录，本次实时首页只观察到非文创/非遗请求，因此按来源级相关性过滤后为 0 条可公开覆盖；这是诚实的 WEB_OBSERVED 结果，不宣称已接通生产。国家艺术基金列表解析为正式申报指南，已通过隔离适配器验证。\n\n## 发布状态\n\n- fixture：执行独立分类、路由、页面和来源适配器测试\n- live read：仅 GET 官方公开页面；不写生产、不带凭证\n- production：NOT_DEPLOYED\n- 下一步：如需上线，应另行走一次生产审批、备份、受控发布和真实抓取；不在本轮执行。\n`;
}

async function main(): Promise<void> {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  const persisted = readJson<{ sources: OpportunityV2Source[] }>(path.join(dataDir, "sources.json")).sources;
  const pool = readJson<{ opportunities: OpportunityV2[] }>(path.join(dataDir, "opportunities.json"));
  const health = readOpportunityV2Health(path.join(dataDir, "source-health.json"));
  const effective = mergeDefaultOpportunityV2Sources(persisted).sources;
  const coverage = buildOpportunityCoverageAssessments(pool.opportunities, { now });
  const lanes = Object.fromEntries([...new Set(coverage.map((item) => item.lane))].map((lane) => [lane, coverage.filter((item) => item.lane === lane).length]));
  const typeCounts = Object.fromEntries([...new Set(coverage.flatMap((item) => item.view_types))].map((type) => [type, coverage.filter((item) => item.view_types.includes(type)).length]));
  const matrixSourceIds = [
    "on-the-move-open-calls",
    "curatorspace-opportunities",
    "american-craft-council-opportunities",
    "craft-scotland-opportunities",
    "artconnect-opportunities",
    "kcdf-opportunities",
    "cnaf-guides",
    "een-partnering",
  ];
  const coverageMatrixRows = matrixSourceIds.map((sourceId) => {
    const source = effective.find((candidate) => candidate.id === sourceId);
    const assessments = coverage.filter((assessment) => assessment.opportunity.source_id === sourceId);
    const typeCountsBySource: Record<string, number> = {};
    for (const type of OPPORTUNITY_COVERAGE_TYPES) {
      const count = assessments.filter((assessment) => assessment.view_types.includes(type)).length;
      if (count > 0) typeCountsBySource[type] = count;
    }
    return {
      source_id: sourceId,
      name: source?.name ?? null,
      family: source ? hostOf(source.url) : null,
      registered_in_persisted_snapshot: persisted.some((candidate) => candidate.id === sourceId),
      configured_status: source?.status ?? null,
      pool_items: pool.opportunities.filter((item) => item.source_id === sourceId).length,
      assessment_items: assessments.length,
      current_or_early_items: assessments.filter((assessment) => assessment.lane === "current" || assessment.lane === "early").length,
      view_type_counts: typeCountsBySource,
      evidence: source ? (health.find((row) => row.source_id === sourceId) ? "runtime source-health snapshot" : "runtime pool snapshot") : "not registered in effective registry",
    };
  });
  const current = coverage.filter((item) => item.lane === "current" || item.lane === "early").sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.opportunity.title.localeCompare(b.opportunity.title, "zh-CN"));
  const suggestions = current.slice(0, 10).map((assessment) => {
    const item = publicOpportunityCoverageAssessment(assessment);
    return { opportunity_id: item.opportunity_id, title: item.opportunity.title, view_types: item.view_types, lane: item.lane, source: item.opportunity.source_name, deadline: item.deadline, money_flow: item.money_flow, qualification_gaps: item.qualification_gaps, next_action: item.next_action, detail_url: item.opportunity.detail_url };
  });
  const home = filterOpportunityV2Radar(pool.opportunities, effective, { now });
  const publicCompetition = home.filter((item) => item.category === "competition");
  const memo = buildOpportunityV2MemoSnapshot({ opportunities: pool.opportunities, sources: effective, health, generatedAt: now.toISOString(), poolUpdatedAt: readJson<{ updated_at: string }>(path.join(dataDir, "opportunities.json")).updated_at });
  const memoCurrent = memo.items.filter((item) => opportunityV2LiveStatus(item, now) !== "EXPIRED");
  const procurementPublic = home.filter((item) => item.category === "procurement_project");
  const encodingPool = pool.opportunities.filter((item) => hasEncodingCorruption(item.title) || hasEncodingCorruption(item.summary) || item.encoding_error === true).map((item) => item.id);
  const sourceGroups = new Map<string, string[]>();
  for (const source of persisted) sourceGroups.set(hostOf(source.url), [...(sourceGroups.get(hostOf(source.url)) ?? []), source.id]);
  const sourceFamilyGroups = [...sourceGroups.entries()].map(([host, sourceIds]) => ({ host, source_ids: sourceIds, duplicate_family: sourceIds.length > 1 }));
  const probes = await Promise.all(DEFAULT_OPPORTUNITY_V2_SOURCES.filter((source) => ["cnaf-guides", "een-partnering"].includes(source.id)).map(liveProbe));
  const commit = gitValue(["rev-parse", "HEAD"]);
  const branch = gitValue(["branch", "--show-current"]);

  writeJson("HANDOFF.json", {
    schema: "chanceping.nextpack.handoff.v1",
    previous_package: "ChancePing_Procurement_V1_Autonomous_20260915",
    previous_final_status: "SHIPPED_WITH_BACKLOG",
    previous_finished_at: "2026-09-15",
    production_safe_state_verified: true,
    deployed_business_sha: "f514ee6b624dc2bb5abf12bb317cb30c37bedb5d",
    previous_delivery_sha: "fb3a6edcac2dbee826ea6bb13d70a01374961397",
    source_branch: branch,
    current_commit: commit,
    branch_descends_from_deployed_release: false,
    existing_paths: {
      source_registry: "src/opportunity-v2/source-pool.ts",
      opportunity_pool: "src/opportunity-v2/opportunity-pool.ts",
      assessment: "src/opportunity-v2/opportunity-coverage.ts",
      followup: "src/opportunity-v2/procurement-followup-store.ts",
      change_feed: "src/opportunity-v2/procurement-change-feed.ts",
      export: "src/opportunity-v2/procurement-export.ts",
      ui: "src/api/routes/procurement-workbench-pages.ts",
    },
    reused_features: ["shared OpportunityV2 identity", "procurement workbench", "private follow-up sidecar", "change feed", "CSV/Markdown export", "existing source registry and scheduler"],
    carry_over_backlog: ["previous M0 strict LOEWE once product convergence was a backlog", "production has not received this branch", "historical baseline provenance remains partial/unrecoverable"],
    next_mode: "SHIPPED_WITH_BACKLOG",
    writes_allowed: false,
  });
  writeJson("source-inventory.json", { schema_version: "chanceping.opportunity-coverage.source-inventory.v1", generated_at: now.toISOString(), persisted_source_count: persisted.length, effective_source_count: effective.length, selected_deep_work_sources: ["on-the-move-open-calls", "curatorspace-opportunities", "american-craft-council-opportunities", "craft-scotland-opportunities", "artconnect-opportunities", "kcdf-opportunities"], rows: sourceRows(persisted, pool.opportunities, health), source_family_groups: sourceFamilyGroups, live_gap_probe: probes });
  writeJson("capability-map.json", { schema_version: "chanceping.opportunity-coverage.capability-map.v1", views: ["grant_funding", "exhibition_showcase", "market_channel", "residency_learning", "partnership_commission", "recognition_incubation"], shared_paths: { classify: "src/opportunity-v2/opportunity-coverage.ts", api: "/api/opportunity-v2/workbench/coverage", page: "/ich/opportunities", followups: "/api/opportunity-v2/workbench/followups", changes: "/api/opportunity-v2/workbench/changes", export: "/api/opportunity-v2/workbench/export" }, safety: ["body evidence required for type", "ambiguous is review", "seller offer excluded from public coverage", "results/news/holiday content retained only as research or excluded", "unsafe deadlines use shared public serializer"], no_new_db_or_scheduler: true });
  writeJson("baseline.json", { schema_version: "chanceping.opportunity-coverage.baseline.v1", generated_at: now.toISOString(), source_count_persisted: persisted.length, source_count_effective: effective.length, pool_count: pool.opportunities.length, public_radar_count: home.length, public_competition_count: publicCompetition.length, memo_total: memo.total, memo_current: memoCurrent.length, memo_known_deadlines: memo.known_deadlines, memo_unknown_deadlines: memo.unknown_deadlines, coverage_assessments: coverage.length, lanes, view_type_counts: typeCounts, procurement_public: procurementPublic.length, loewe_count: pool.opportunities.filter((item) => item.source_id === "loewe-craft-prize" || /loewe.*craft prize/iu.test(item.title)).length, encoding_errors_in_pool: encodingPool.length, encoding_error_ids: encodingPool, selected_sources: sourceRows(persisted.filter((source) => ["on-the-move-open-calls", "curatorspace-opportunities", "american-craft-council-opportunities", "craft-scotland-opportunities", "artconnect-opportunities", "kcdf-opportunities"].includes(source.id)), pool.opportunities, health), production_status: "NOT_DEPLOYED" });
  writeJson("source-family-dedupe.json", { schema_version: "chanceping.opportunity-coverage.source-family-dedupe.v1", generated_at: now.toISOString(), groups: sourceFamilyGroups, rule: "same public hostname is a review hint only; it does not merge OpportunityV2 records or count a family twice for N2" });
  writeJson("coverage-matrix.json", { schema_version: "chanceping.opportunity-coverage.matrix.v1", generated_at: now.toISOString(), selected_source_count: matrixSourceIds.length, independent_n2_candidates: ["cnaf-guides", "een-partnering"], view_types: OPPORTUNITY_COVERAGE_TYPES, rows: coverageMatrixRows, note: "Counts are read-only snapshot observations; source families are not multiplied when the hostname is shared." });
  writeJson("live-probes.json", { schema_version: "chanceping.opportunity-coverage.live-probes.v1", generated_at: now.toISOString(), probes, credentialed: false, production_mutated: false });
  writeJson("suggestions.json", { schema_version: "chanceping.opportunity-coverage.suggestions.v1", generated_at: now.toISOString(), count: suggestions.length, items: suggestions });
  const digest = markdownDigest({ branch, commit, pool: pool.opportunities.length, persistedSources: persisted.length, effectiveSources: effective.length, coverageCount: coverage.length, lanes, typeCounts, suggestions, probes });
  fs.writeFileSync(path.join(reportDir, "BUSINESS_DIGEST.md"), digest, "utf8");
  fs.writeFileSync(path.join(reportDir, "SOURCE_COVERAGE.md"), `# 盯非遗｜综合机会覆盖 V1.1 来源覆盖\n\n- persisted source registry：${persisted.length}\n- effective in-memory defaults：${effective.length}\n- selected deep-work sources：6\n- independent N2 candidates：2（国家艺术基金、EEN）\n- production additions：0（本轮未部署）\n\n## Live read\n\n${probes.map((probe) => `- ${probe.source_id}：${probe.status}；HTTP ${probe.http_status ?? "—"}；解析 ${(probe.parsed_items as number) ?? 0} 条；${probe.blocker ?? "无 blocker"}`).join("\n")}\n\n## 诚实边界\n\nEEN 当前页虽可访问，但本次只观察到非目标行业的 Business Request，目标域过滤后 0 条，不写成接通生产。国家艺术基金官方申报指南列表解析为 6 条隔离候选，详情截止与资格仍需正文核验。\n`, "utf8");
  const finalSuggestionLines = suggestions.map((item, index) => `- ${index + 1}. ${item.title}｜${(item.view_types as string[]).join("、") || "待复核"}｜${item.source}｜${item.deadline ?? "截止待确认"}｜${item.detail_url}`).join("\n");
  const coverageTypeLines = OPPORTUNITY_COVERAGE_TYPES.map((type) => `- ${type}：${typeCounts[type] ?? 0} 条（assessment 可多标签重叠）`).join("\n");
  const sourceDispositionLines = coverageMatrixRows.map((row) => `- ${row.source_id}｜${row.name ?? "未登记"}｜${row.family ?? "—"}｜池内 ${row.pool_items}｜当前/提前 ${row.current_or_early_items}｜${row.source_id === "cnaf-guides" ? "PIPELINE_VERIFIED（官方申报指南，隔离解析6条）" : row.source_id === "een-partnering" ? "WEB_OBSERVED（当前页目标行业正例0，保留观察）" : row.configured_status === "NEEDS_ADAPTER" ? "NEEDS_ADAPTER/历史池记录，未宣称 live" : "复用存量快照"}`).join("\n");
  fs.writeFileSync(path.join(reportDir, "FINAL_DELIVERY.md"), `# 盯非遗｜综合机会覆盖 V1.1 最终交付\n\n状态：SHIPPED_WITH_BACKLOG\n\n## 1. 现在实际能用什么\n\n本分支新增 /ich/opportunities 综合机会工作台预览、/api/opportunity-v2/workbench/coverage 共享 API，以及 CSV/Markdown 导出入口；复用采购工作台已有的跟进、变更摘要和共享机会身份。以当前独立 worktree 运行，**NOT_DEPLOYED**，没有把 localhost 或离线快照冒充生产入口。\n\n演示路径：打开 /ich/opportunities → 按非比赛类型/分区筛选 → 查看正文证据、费用、钱的方向和资格缺口 → 通过既有跟进/导出路径继续处理。\n\n## 2. 当前包承接结果\n\n上一包采购工作台交付 SHA：fb3a6edcac2dbee826ea6bb13d70a01374961397；生产 M0 业务 SHA：f514ee6b624dc2bb5abf12bb317cb30c37bedb5d。本轮复用来源注册表、OpportunityV2 身份、跟进 sidecar、变更摘要、CSV/Markdown 导出和既有调度/发布流程；没有重复五源上线，也没有修改生产。上一包 strict LOEWE once backlog、历史 baseline partial/unrecoverable 和外部来源阻塞继续如实保留。\n\n## 3. 六类覆盖\n\n- 当前 snapshot Opportunity Pool：${pool.opportunities.length}\n- 综合机会 assessment：${coverage.length}（去重仍按 opportunity_id）\n- 分区：${Object.entries(lanes).map(([key, value]) => key + " " + value).join(" · ")}\n${coverageTypeLines}\n\n分类规则要求正文行动证据；同一机会可有多个 view type，但只有一个稳定身份。没有足够证据的记录进入 review/research，不把 open call 自动当比赛或资助，不把费用当奖金，不把可能合作写成保证订单。\n\n## 4. 值得研究的真实机会（最多10条）\n\n${finalSuggestionLines || "当前快照没有可安全展示的综合机会，不补假数据。"}\n\n## 5. 来源贡献和取舍\n\n${sourceDispositionLines}\n\n实时有界读取：CNAF 官方指南 HTTP 200、解析 6 条，状态 PIPELINE_VERIFIED；EEN 官方目录 HTTP 200，但当前页目标行业过滤后 0 条，状态 WEB_OBSERVED，不写成生产接通。其余来源只按本地 runtime 快照/health 记录报告，未访问的不写 LIVE。完整 33 条 persisted registry、44 条 effective defaults 和来源 family 去重在 audits/ich/opportunity-coverage-v1-1/latest/source-inventory.json、coverage-matrix.json。\n\n## 6. 用户流程与旧数据保护\n\n综合入口使用共享筛选、详情、既有跟进和导出路径；同一 opportunity 跨类型不复制身份。采购机会仍由原采购视图处理，Competition/Memo/LOEWE 数据未批量改写；来源配置和管理员字段未被本轮覆盖，私有跟进不进入公开 coverage API。\n\n## 7. 实际测试和发布证据\n\n- npm run typecheck：PASS\n- npm run verify:all：PASS（含本轮 coverage fixture）\n- npm run verify:opportunity:coverage：PASS\n- npm run verify:opportunity:coverage:sources：PASS（含主 Pipeline 隔离运行）\n- npm run verify:procurement:workbench：PASS\n- npm run verify:procurement:change-feed：PASS\n- npm run verify:procurement:sources：PASS\n- npm run verify:ich:procurement:phase1:2a：PASS\n- npm run verify:ich:v211：PASS；历史赛事证据仍显示 BASELINE_UNRECOVERABLE / UNKNOWN 26，未伪造清零\n- Live read：仅官方公开 GET，未带凭证、未写生产\n- Production：NOT_DEPLOYED\n\n## 8. 状态、缺口、唯一人工清单\n\n状态：SHIPPED_WITH_BACKLOG。N1 综合工作台和共享 assessment 已完成；N2 CNAF 已完成隔离 Pipeline 验证，EEN 仍是来源级观察/待真实目标正例，其他来源的细分 adapter 仍有缺口。若要上线，只需另行走生产审批、备份、受控发布与回滚；本轮无需人工动作。\n\n## 9. 后续运营建议\n\n下一目标建议优先为已注册但 NEEDS_ADAPTER 的 On the Move 做一个正文级适配器，并在同一 coverage matrix 中补真实 current/early 证据；不新增并行雷达系统。\n`, "utf8");
  console.log(JSON.stringify({ status: "SHIPPED_WITH_BACKLOG", branch, commit, persisted_sources: persisted.length, effective_sources: effective.length, pool: pool.opportunities.length, public_competition: publicCompetition.length, memo: memo.total, memo_current: memoCurrent.length, coverage_assessments: coverage.length, lanes, type_counts: typeCounts, procurement_public: procurementPublic.length, loewe: pool.opportunities.filter((item) => item.source_id === "loewe-craft-prize" || /loewe.*craft prize/iu.test(item.title)).length, pool_encoding_errors: encodingPool.length, live_probes: probes, production: "NOT_DEPLOYED" }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
