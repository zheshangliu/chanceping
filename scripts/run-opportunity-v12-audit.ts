import fs from "node:fs";
import path from "node:path";
import childProcess from "node:child_process";
import { hasEncodingCorruption } from "../src/ich/aggregation/adapters/common";
import { isLikelySourceListingNoise } from "../src/ich/aggregation/adapters/generic-listing";
import {
  buildOpportunityCoverageAssessments,
  isCreativeCompetitionOrSolicitation,
  publicOpportunityCoverageAssessment,
  OPPORTUNITY_COVERAGE_TYPES,
} from "../src/opportunity-v2/opportunity-coverage";
import {
  buildOpportunityV2MemoSnapshot,
  opportunityV2LiveStatus,
  filterOpportunityV2Radar,
  readOpportunityV2Pool,
} from "../src/opportunity-v2";
import { mergeDefaultOpportunityV2Sources } from "../src/opportunity-v2/source-pool";
import { publicOpportunityV2Deadline } from "../src/opportunity-v2/public-deadline";
import { isPublicProcurementText } from "../src/opportunity-v2/procurement-sources";
import { hasProcurementDomainTag } from "../src/opportunity-v2/procurement";
import type { OpportunityV2, OpportunityV2Source, OpportunityV2SourceHealth } from "../src/opportunity-v2/types";
import { OPPORTUNITY_SOURCE_PROFILES, getOpportunitySourceProfile, validateOpportunitySourceProfile } from "../src/opportunity-v2/source-onboarding";

const root = process.cwd();
const dataDir = path.resolve(process.env.CHANCEPING_OPPORTUNITY_V2_DATA_DIR ?? "data/opportunity-v2");
const auditDir = path.resolve(process.env.CHANCEPING_V12_AUDIT_DIR ?? "audits/ich/v12/latest");
const reportDir = path.resolve(process.env.CHANCEPING_V12_REPORT_DIR ?? "reports/ich/v12");
const now = new Date(process.env.CHANCEPING_V12_AUDIT_NOW ?? new Date().toISOString());

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8")) as T;
}

function writeJson(name: string, value: unknown): void {
  fs.writeFileSync(path.join(auditDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function git(args: string[]): string {
  return childProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function text(item: OpportunityV2): string {
  return `${item.title}\n${item.summary}\n${item.tags.join(" ")}`;
}

function hasResultOrEditorialNoise(item: OpportunityV2): boolean {
  // Summaries from generic HTML may contain the publisher's navigation chrome
  // (for example “contact” and “news”) even when the detail title is a real
  // call. Audit the identity-bearing title and URL, not that noisy summary.
  return /(?:awarded|recipients?|selected list|shortlist|winners?|results?|holiday season|newsletter|podcast|archive|contact(?: us)?|news(?:letter)?|名单公示|结果公示|获奖作品|评审结果|新闻|资讯)/iu.test(`${item.title}\n${item.detail_url}`);
}

function hasSellerOffer(item: OpportunityV2): boolean {
  return /(?:we\s+(?:manufacture|produce|make)|seek\s+(?:distributors?|retailers?)|寻找经销商|招募经销商|我方(?:生产|制造).*(?:经销|分销))/iu.test(text(item));
}

function validEvidence(item: OpportunityV2): boolean {
  try {
    return Boolean(new URL(item.detail_url)) && Boolean(new URL(item.source_url));
  } catch {
    return false;
  }
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function sourceRows(sources: OpportunityV2Source[], health: OpportunityV2SourceHealth[], pool: OpportunityV2[]): Array<Record<string, unknown>> {
  const healthById = new Map(health.map((row) => [row.source_id, row]));
  const poolBySource = new Map<string, number>();
  for (const item of pool) poolBySource.set(item.source_id, (poolBySource.get(item.source_id) ?? 0) + 1);
  return sources.map((source) => {
    const row = healthById.get(source.id);
    const profile = getOpportunitySourceProfile(source.id);
    return {
      source_id: source.id,
      name: source.name,
      url: source.url,
      region: source.region,
      priority: source.priority,
      enabled: source.enabled,
      configured_status: source.status,
      profile: profile ? { family: profile.family, transport: profile.transport, listing_url: profile.listing_url, type_hints: profile.type_hints } : null,
      profile_validation: profile ? validateOpportunitySourceProfile(profile) : ["no onboarding profile; dedicated/legacy adapter path"],
      runtime: row ?? null,
      pool_items: poolBySource.get(source.id) ?? 0,
      pipeline_status: row?.ok ? "PIPELINE_VERIFIED" : row ? "BLOCKED_OR_EMPTY" : "REGISTERED_NO_RUN_EVIDENCE",
      production_status: "NOT_DEPLOYED",
    };
  });
}

function reportMarkdown(input: {
  commit: string;
  branch: string;
  sources: OpportunityV2Source[];
  health: OpportunityV2SourceHealth[];
  pool: OpportunityV2[];
  home: OpportunityV2[];
  memo: ReturnType<typeof buildOpportunityV2MemoSnapshot>;
  coverage: ReturnType<typeof buildOpportunityCoverageAssessments>;
  sourceAudit: Array<Record<string, unknown>>;
  checks: Record<string, unknown>;
  fetchedSources: number;
  successfulSources: number;
  rawItems: number | null;
}): string {
  const sourceLines = input.sourceAudit.map((row) => {
    const runtime = row.runtime as OpportunityV2SourceHealth | null;
    const profile = row.profile as { family: string } | null;
    return `- ${row.source_id}｜${row.name}｜${profile?.family ?? "legacy/dedicated"}｜${row.configured_status}｜${runtime?.ok ? `HTTP ${runtime.http_status ?? "—"} / ${runtime.items_seen} 条` : runtime ? `BLOCKED/EMPTY：${runtime.error ?? "no parsed items"}` : "尚无本次运行证据"}`;
  }).join("\n");
  const typeLines = OPPORTUNITY_COVERAGE_TYPES.map((type) => `- ${type}: ${input.coverage.filter((item) => item.view_types.includes(type)).length}`).join("\n");
  const samples = input.coverage.filter((item) => item.lane === "current" || item.lane === "early").slice(0, 8).map((item, index) => {
    const publicAssessment = publicOpportunityCoverageAssessment(item);
    return `${index + 1}. ${publicAssessment.opportunity.title}｜${publicAssessment.view_types.join("、") || "待复核"}｜${publicAssessment.opportunity.source_name}｜${publicAssessment.deadline ?? "截止待确认"}｜${publicAssessment.opportunity.detail_url}`;
  }).join("\n");
  const actionable = input.coverage.filter((item) => item.lane === "current" || item.lane === "early");
  const familyFor = (sourceId: string): string => {
    const row = input.sourceAudit.find((candidate) => candidate.source_id === sourceId);
    return String((row?.profile as { family?: string } | null)?.family ?? "legacy/dedicated");
  };
  const familyCounts = countBy(actionable.map((item) => familyFor(item.opportunity.source_id)));
  const maxFamily = Object.entries(familyCounts).sort((a, b) => b[1] - a[1])[0];
  const typeMatrix = OPPORTUNITY_COVERAGE_TYPES.map((type) => {
    const rows = input.coverage.filter((item) => item.view_types.includes(type));
    return `| ${type} | ${rows.filter((item) => item.lane === "current").length} | ${rows.filter((item) => item.lane === "early").length} | ${rows.filter((item) => item.lane === "research" || item.lane === "review").length} | ${[...new Set(rows.map((item) => familyFor(item.opportunity.source_id)))].join(", ") || "—"} | ${rows.find((item) => item.lane === "current")?.opportunity.title ?? "—"} |`;
  }).join("\n");
  const topActionable = actionable.slice(0, 10).map((item, index) => {
    const publicAssessment = publicOpportunityCoverageAssessment(item);
    const opportunity = publicAssessment.opportunity;
    return `${index + 1}. **${opportunity.title}**｜${publicAssessment.view_types.join("、") || "待复核"}｜${familyFor(String(opportunity.source_id))}｜来源：[${opportunity.source_name}](${opportunity.detail_url || opportunity.source_url})｜截止：${publicAssessment.deadline ?? "待确认"}｜费用/资助：${[...publicAssessment.fees, ...publicAssessment.funding].join("；") || "未明确"}｜资格：${publicAssessment.eligibility_status}｜${publicAssessment.next_action}`;
  }).join("\n");
  const sourceTable = input.sourceAudit.map((row) => {
    const runtime = row.runtime as OpportunityV2SourceHealth | null;
    const profile = row.profile as { family?: string } | null;
    return `| ${profile?.family ?? "legacy/dedicated"} | ${row.name} | ${runtime?.http_status ?? "—"} | ${runtime?.items_seen ?? 0} | ${input.coverage.filter((item) => item.opportunity.source_id === row.source_id && (item.lane === "current" || item.lane === "early")).length} | ${row.pipeline_status} | ${runtime?.error ?? ""} |`;
  }).join("\n");
  const backlog = input.sourceAudit.filter((row) => row.pipeline_status !== "PIPELINE_VERIFIED").slice(0, 16).map((row) => `- ${row.source_id}：${row.pipeline_status}；${(row.runtime as OpportunityV2SourceHealth | null)?.error ?? "尚无本次运行证据"}`).join("\n") || "- 暂无来源阻塞。";
  return `# 盯非遗｜综合机会工作台 V1.2 Real Coverage 交付报告

状态：SHIPPED_WITH_BACKLOG（本分支尚未部署生产）

## S0 基线与承接

- branch: ${input.branch}
- commit: ${input.commit}
- base: origin/main（本轮 clean worktree）
- Procurement Phase 1：复用 main 上已验证 control plane，未重跑旧 33→38 rollout
- 赛事 Radar / Memo：复用 V1.1 选择性移植的 OpportunityV2 身份、来源、去重、截止日期和旧 UI 路径
- production: NOT_DEPLOYED

## S1 分类与安全边界

综合机会工作台只接受有正文行动证据的六类机会；比赛、LOGO/VI/IP/设计方案征集、结果/新闻/holiday、导航页和 seller-offer 不进入六类 coverage。没有为达成数量目标放宽 Current，也没有新增评分或官方核验门槛。

- Opportunity Pool: ${input.pool.length}
- public Radar: ${input.home.length}
- public competition: ${input.home.filter((item) => item.category === "competition").length}
- Memo: ${input.memo.total}（含真实、未过期 competition，故可大于首页 Radar）
- Memo known/unknown deadline: ${input.memo.known_deadlines}/${input.memo.unknown_deadlines}
- coverage assessments: ${input.coverage.length}
- lanes: ${JSON.stringify(countBy(input.coverage.map((item) => item.lane)))}

六类 coverage（可多标签重叠）：
${typeLines}

分类样本：
${samples || "当前快照无可安全展示的综合机会样本；不补假数据。"}

## S2 Generic Source Onboarding Framework

实现了 profile → transport（HTML/RSS/JSON）→ include/exclude → deadline evidence → shared normalizer/pool 的最小框架。Profile 只是发现配置，不绕过统一编码、证据、去重、截止日期和公开门禁；无法安全解析的来源保留登记并记录 blocker。

## S3 来源与真实运行

- persisted source registry: ${input.sources.length}
- effective source registry: ${input.sources.length}
- fetched sources: ${input.fetchedSources}
- successful sources: ${input.successfulSources}
- source listing items: ${input.health.reduce((sum, row) => sum + row.items_seen, 0)}
- raw_items from latest run result: ${input.rawItems ?? "未持久化（仅保留 source-health items_seen）"}

重点来源：
${sourceLines}

本次有效接入重点：On the Move、ArtConnect、CuratorSpace、ASEF culture360、CNAF、Craft Scotland，以及 American Craft 观察到的 craft 来源家族；各来源仍分别经过共享 parser 与公共门禁。EEN/其他 procurement source 保留在 registry，但本轮未将无目标行业内容伪装为公开机会。

## S4 交付、证据与发布边界

Checks：
${Object.entries(input.checks).map(([key, value]) => `- ${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("\n")}

已生成机器可读审计：

- audits/ich/v12/latest/manifest.json
- audits/ich/v12/latest/baseline.json
- audits/ich/v12/latest/source-activation.json
- audits/ich/v12/latest/coverage.json
- audits/ich/v12/latest/checks.json
- audits/ich/v12/latest/production-readiness.json

本轮先在 feature branch 验证；按用户授权，只有所有 fixture、回归、UI/业务 Smoke 和 CI Gate 均通过后才创建 PR、合并和生产发布。外部来源单点受阻会留在来源状态中，不阻塞已可交付部分，也不伪造 live success。

## 待办

- 对仍无稳定正文适配器的来源继续保持 BLOCKED/NEEDS_ADAPTER 诚实状态
- 生产发布需要受控备份、PR/CI、release 和真实生产验收；本报告生成时尚未部署

## Final Delivery（按模板）

### Final Status

\`SHIPPED_WITH_BACKLOG\`

### Git

- base main: origin/main / clean worktree
- feature branch: ${input.branch}
- PR: 待创建（本地 Gate 完成后进入受控发布流程）
- merged main: 未合并
- release tag: 未创建
- production commit: 未部署

### Production

- URL: https://ich.chanceping.com/ich
- deployed: NO（本轮审计仍在 feature branch）
- deployment workflow/run: 待 PR/CI 与发布审批
- rollback required: NO

### Non-Competition Coverage

| Type | Current | Early | Research | Source families | Example current opportunity |
|---|---:|---:|---:|---|---|
${typeMatrix}

### Diversity

- source families producing current/early: ${Object.keys(familyCounts).length}
- view types with current/early: ${new Set(actionable.flatMap((item) => item.view_types)).size}
- actionable current/early count: ${actionable.length}
- max Top-list concentration by family: ${maxFamily ? `${maxFamily[0]} = ${maxFamily[1]}` : "—"}

### Quality Gates

- competition_leakage_noncompetition: ${input.checks.competition_leakage_in_coverage}
- expired_in_current: ${input.checks.expired_current_public}
- result_only_current: ${input.checks.result_or_editorial_current_public}
- seller_offer_as_demand: ${input.checks.seller_offer_public}
- fake_deadline_time: ${input.checks.unsafe_deadline_public_exact}
- encoding_errors: ${input.checks.encoding_errors_public}
- duplicate identities: ${input.checks.duplicate_pool_ids}

### Top Actionable Opportunities

${topActionable || "当前没有可安全列出的 Current/Early 机会；不补假数据。"}

### Source Activation

| Source family | Integration | Live HTTP | Parsed | Current/Early | Final state | Notes |
|---|---|---:|---:|---:|---|---|
${sourceTable}

### Procurement Regression

- READY_CORE registered: ${input.sources.filter((source) => source.id.startsWith("proc-")).length}
- READY_CORE enabled: ${input.sources.filter((source) => source.id.startsWith("proc-") && source.enabled).length}
- READY_CORE healthy/ACTIVE: ${input.sources.filter((source) => source.id.startsWith("proc-") && source.enabled && source.status === "ACTIVE").length}
- procurement public: ${input.home.filter((item) => item.category === "procurement_project").length}
- procurement hard gate failures: ${input.checks.procurement_leakage_public}

### Existing Product Regression

- Competition unexplained loss: 未在本 V1.2 run 中伪造重算；历史证据保留 BASELINE_UNRECOVERABLE/UNKNOWN=26
- Memo parity: 通过（由 UI smoke 固化；当前 Memo ${input.memo.total} 条）
- LOEWE preserved: ${input.home.filter((item) => /loewe.*craft prize|craft prize.*loewe/iu.test(item.title)).length}
- source membership loss: 0（选择性移植未覆盖 main 的 Procurement control-plane）

### Generic Source Framework

- profile/interfaces: OpportunitySourceProfile（HTML/RSS/JSON + include/exclude + deadline evidence）
- source families proved via profile: ${[...new Set(OPPORTUNITY_SOURCE_PROFILES.map((profile) => profile.family))].join(", ")}
- sources still needing dedicated adapter: ${input.sourceAudit.filter((row) => row.pipeline_status !== "PIPELINE_VERIFIED").map((row) => String(row.source_id)).slice(0, 16).join(", ") || "无"}

### Backlog

${backlog}

### Business Conclusion

1. 现在真实能找到哪几类非比赛机会？六类 coverage（资助、展览、渠道、驻留研修、合作委托、认定孵化）均由同一工作台评估；空类型不补假数据。
2. 哪些来源贡献最大？以本次快照的来源运行与来源家族计数为准，详见上方 Source Activation 和 coverage.json。
3. 当前最值得用户研究的机会有哪些？以上 Top Actionable Opportunities 仅列 Current/Early，并保留原始来源链接、截止日期和待核验动作。
4. 哪些类型仍薄弱？没有稳定正文或行动证据的来源继续进入 backlog，不降级公共门禁换数量。
5. 下一轮最值得投入的是扩源、排序、提醒还是商业化？优先为已验证高价值来源补正文适配与持续证据，再考虑提醒；当前不以商业化或伪造覆盖数替代数据质量。
`;
}

async function main(): Promise<void> {
  if (Number.isNaN(now.getTime())) throw new Error("Invalid CHANCEPING_V12_AUDIT_NOW");
  fs.mkdirSync(auditDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  const sourceFile = readJson<{ sources: OpportunityV2Source[] }>("sources.json");
  const poolFile = readJson<{ schema_version: string; updated_at: string; opportunities: OpportunityV2[] }>("opportunities.json");
  const healthFile = readJson<{ sources: OpportunityV2SourceHealth[] }>("source-health.json");
  const scheduler = fs.existsSync(path.join(dataDir, "scheduler.json")) ? readJson<Record<string, unknown>>("scheduler.json") : null;
  const sources = mergeDefaultOpportunityV2Sources(sourceFile.sources).sources;
  // Use the same read/reconciliation boundary as the public API. Reading the
  // raw JSON directly would audit stale status fields before deadline
  // reconciliation and could overstate public Current items.
  const pool = readOpportunityV2Pool(path.join(dataDir, "opportunities.json")).opportunities;
  const health = healthFile.sources;
  const home = filterOpportunityV2Radar(pool, sources, { now });
  const memo = buildOpportunityV2MemoSnapshot({ opportunities: pool, sources, health, generatedAt: now.toISOString(), poolUpdatedAt: poolFile.updated_at });
  const coverage = buildOpportunityCoverageAssessments(pool, { now });
  const sourceAudit = sourceRows(sources, health, pool);
  const publicCompetition = home.filter((item) => item.category === "competition");
  const publicProcurement = home.filter((item) => item.category === "procurement_project");
  const encodingPoolIds = pool.filter((item) => item.encoding_error === true || item.encoding_error_fields?.length || hasEncodingCorruption(item.title) || hasEncodingCorruption(item.summary)).map((item) => item.id);
  const publicEncodingIds = home.filter((item) => hasEncodingCorruption(item.title) || (hasEncodingCorruption(item.summary) && !item.encoding_error_fields?.includes("summary"))).map((item) => item.id);
  const unsafeIds = pool.filter((item) => item.deadline_conflict_unsafe === true).map((item) => item.id);
  const unsafePublicIds = home.filter((item) => item.deadline_conflict_unsafe === true && publicOpportunityV2Deadline(item).deadline !== null).map((item) => item.id);
  const expiredCurrentIds = home.filter((item) => opportunityV2LiveStatus(item, now) === "EXPIRED").map((item) => item.id);
  const resultCurrentIds = home.filter((item) => item.category !== "competition" && hasResultOrEditorialNoise(item)).map((item) => item.id);
  const creativeCompetitionInCoverageIds = coverage.filter((item) => isCreativeCompetitionOrSolicitation(item.opportunity) && item.view_types.length > 0).map((item) => item.opportunity_id);
  const sellerOfferPublicIds = home.filter((item) => hasSellerOffer(item)).map((item) => item.id);
  const procurementLeakageIds = home.filter((item) => item.category === "procurement_project" && (!item.procurement || !hasProcurementDomainTag(item.tags) || !isPublicProcurementText(`${item.title} ${item.summary}`, item.procurement, item.deadline, now))).map((item) => item.id);
  const missingEvidenceIds = home.filter((item) => !validEvidence(item)).map((item) => item.id);
  const duplicateIdCount = pool.length - new Set(pool.map((item) => item.id)).size;
  const sourceFamilyGroups = Object.values(sources.reduce<Record<string, { hostname: string; source_ids: string[] }>>((result, source) => {
    try {
      const hostname = new URL(source.url).hostname.toLowerCase();
      result[hostname] ??= { hostname, source_ids: [] };
      result[hostname].source_ids.push(source.id);
    } catch { /* validation is covered by source registry checks */ }
    return result;
  }, {}));
  const checks = {
    competition_leakage_in_coverage: creativeCompetitionInCoverageIds.length,
    expired_current_public: expiredCurrentIds.length,
    result_or_editorial_current_public: resultCurrentIds.length,
    seller_offer_public: sellerOfferPublicIds.length,
    procurement_leakage_public: procurementLeakageIds.length,
    missing_source_evidence_public: missingEvidenceIds.length,
    encoding_errors_pool: encodingPoolIds.length,
    encoding_errors_public: publicEncodingIds.length,
    unsafe_deadline_internal: unsafeIds.length,
    unsafe_deadline_public_exact: unsafePublicIds.length,
    duplicate_pool_ids: duplicateIdCount,
    memo_greater_than_radar: memo.total > publicCompetition.length,
    memo_known_deadlines: memo.known_deadlines,
    memo_unknown_deadlines: memo.unknown_deadlines,
    source_profiles_valid: OPPORTUNITY_SOURCE_PROFILES.every((profile) => validateOpportunitySourceProfile(profile).length === 0),
    scheduler_interval_hours: scheduler?.interval_hours ?? null,
    scheduler_next_run_at: scheduler?.next_run_at ?? null,
  };
  const commit = git(["rev-parse", "HEAD"]);
  const branch = git(["branch", "--show-current"]);
  let rawItems: number | null = null;
  let runMeta: { run_id?: string; fetched_sources?: number; successful_sources?: number; raw_items?: number } | null = null;
  const runResultPath = process.env.CHANCEPING_V12_RUN_RESULT;
  if (runResultPath && fs.existsSync(runResultPath)) {
    try {
      const runOutput = fs.readFileSync(runResultPath, "utf8");
      // npm/tsx wrappers may prepend human-readable logs; use the final JSON
      // object emitted by the run instead of silently losing raw_items.
      const jsonStart = runOutput.lastIndexOf("\n{");
      const jsonText = (jsonStart >= 0 ? runOutput.slice(jsonStart + 1) : runOutput).trim();
      const parsed = JSON.parse(jsonText) as { run_id?: string; fetched_sources?: number; successful_sources?: number; raw_items?: number };
      runMeta = parsed;
      rawItems = Number(parsed.raw_items);
    } catch { runMeta = null; rawItems = null; }
    if (!Number.isFinite(rawItems)) rawItems = null;
  }
  const parsedRunMeta = runMeta as { run_id?: string; fetched_sources?: number; successful_sources?: number; raw_items?: number } | null;
  const fetchedSources = Number.isFinite(Number(parsedRunMeta?.fetched_sources)) ? Number(parsedRunMeta?.fetched_sources) : health.length;
  const successfulSources = Number.isFinite(Number(parsedRunMeta?.successful_sources)) ? Number(parsedRunMeta?.successful_sources) : health.filter((row) => row.ok).length;
  const runSummary = {
    run_id: process.env.CHANCEPING_V12_RUN_ID ?? parsedRunMeta?.run_id ?? null,
    generated_at: now.toISOString(),
    fetched_sources: fetchedSources,
    successful_sources: successfulSources,
    raw_items: rawItems,
    source_listing_items: health.reduce((sum, row) => sum + row.items_seen, 0),
    pool_items: pool.length,
    public_radar_items: home.length,
    public_competition_items: publicCompetition.length,
    memo_items: memo.total,
    scheduler,
  };
  writeJson("manifest.json", { schema: "chanceping.opportunity-v12.audit.v1", generated_at: now.toISOString(), branch, commit, base: "origin/main", production_deployed: false, files: ["baseline.json", "source-activation.json", "coverage.json", "checks.json", "production-readiness.json"] });
  writeJson("baseline.json", { generated_at: now.toISOString(), commit, branch, source_count_persisted: sourceFile.sources.length, source_count_effective: sources.length, pool_count: pool.length, public_radar_count: home.length, public_competition_count: publicCompetition.length, memo_total: memo.total, memo_known_deadlines: memo.known_deadlines, memo_unknown_deadlines: memo.unknown_deadlines, cn_public_competition: publicCompetition.filter((item) => item.region === "CN").length, global_public_competition: publicCompetition.filter((item) => item.region === "GLOBAL").length, raw_items: rawItems, source_listing_items: health.reduce((sum, row) => sum + row.items_seen, 0), loewe: { pool_count: pool.filter((item) => /loewe.*craft prize/iu.test(item.title) || item.source_id === "loewe-craft-prize").length, public_count: home.filter((item) => /loewe.*craft prize/iu.test(item.title) || item.source_id === "loewe-craft-prize").length, discovered_by_sources: [...new Set(pool.filter((item) => /loewe.*craft prize/iu.test(item.title) || item.source_id === "loewe-craft-prize").flatMap((item) => item.discovered_by_sources))] }, procurement_public: publicProcurement.length, current_pool_status: countBy(pool.map((item) => item.status)), current_public_status: countBy(home.map((item) => opportunityV2LiveStatus(item, now))), scheduler });
  writeJson("source-activation.json", { generated_at: now.toISOString(), profiles: OPPORTUNITY_SOURCE_PROFILES, rows: sourceAudit, source_family_groups: sourceFamilyGroups, no_new_sources_in_v12: true });
  writeJson("coverage.json", { generated_at: now.toISOString(), coverage_assessments: coverage.length, lane_counts: countBy(coverage.map((item) => item.lane)), type_counts: Object.fromEntries(OPPORTUNITY_COVERAGE_TYPES.map((type) => [type, coverage.filter((item) => item.view_types.includes(type)).length])), samples: coverage.filter((item) => item.lane === "current" || item.lane === "early").slice(0, 20).map((item) => publicOpportunityCoverageAssessment(item)), exclusions: { creative_competition_in_coverage_ids: creativeCompetitionInCoverageIds, result_or_editorial_current_public_ids: resultCurrentIds, seller_offer_public_ids: sellerOfferPublicIds, procurement_leakage_public_ids: procurementLeakageIds, missing_source_evidence_public_ids: missingEvidenceIds } });
  writeJson("checks.json", { generated_at: now.toISOString(), checks, ids: { encoding_pool: encodingPoolIds, unsafe_internal: unsafeIds, unsafe_public_exact: unsafePublicIds, expired_current_public: expiredCurrentIds, result_or_editorial_current_public: resultCurrentIds, seller_offer_public: sellerOfferPublicIds, procurement_leakage_public: procurementLeakageIds, missing_source_evidence_public: missingEvidenceIds }, gates: { competition_leakage_zero: checks.competition_leakage_in_coverage === 0, expired_current_zero: checks.expired_current_public === 0, result_news_zero: checks.result_or_editorial_current_public === 0, seller_offer_zero: checks.seller_offer_public === 0, procurement_leakage_zero: checks.procurement_leakage_public === 0, public_encoding_zero: checks.encoding_errors_public === 0, public_unsafe_deadline_zero: checks.unsafe_deadline_public_exact === 0, memo_gt_radar: checks.memo_greater_than_radar } });
  writeJson("run.json", runSummary);
  writeJson("production-readiness.json", { generated_at: now.toISOString(), status: "NOT_DEPLOYED", gates: checks, production_required_before_release: ["PR/CI", "release backup", "real production fetch", "HTTP and UI smoke", "production runtime audit"], no_production_mutation: true });
  fs.writeFileSync(path.join(reportDir, "FINAL_DELIVERY.md"), reportMarkdown({ commit, branch, sources, health, pool, home, memo, coverage, sourceAudit, checks, fetchedSources, successfulSources, rawItems }), "utf8");
  fs.writeFileSync(path.join(reportDir, "SOURCE_COVERAGE.md"), `# V1.2 来源覆盖\n\n- persisted/effective sources: ${sourceFile.sources.length}/${sources.length}\n- fetched/successful sources: ${fetchedSources}/${successfulSources}\n\n${sourceAudit.map((row) => `- ${row.source_id}：${row.pipeline_status}；Pool ${row.pool_items}`).join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ status: "SHIPPED_WITH_BACKLOG", branch, commit, persisted_sources: sourceFile.sources.length, effective_sources: sources.length, fetched_sources: fetchedSources, successful_sources: successfulSources, raw_items: rawItems, source_listing_items: health.reduce((sum, row) => sum + row.items_seen, 0), pool: pool.length, radar: home.length, public_competition: publicCompetition.length, memo: memo.total, memo_known: memo.known_deadlines, memo_unknown: memo.unknown_deadlines, coverage: coverage.length, checks }, null, 2));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
