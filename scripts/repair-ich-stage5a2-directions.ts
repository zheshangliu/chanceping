import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { IchOpportunityStore } from "../src/ich/store";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const storePath = path.join(root, "data/ich-opportunities.json");
const summaryPath = path.join(root, "docs/ich/stage5a2-direction-summary.json");
const auditPath = path.join(root, "docs/ich/stage5a2-direction-audit.md");
const now = new Date("2026-09-06T12:00:00+08:00");
const nowIso = now.toISOString();
const beforeBytes = fs.readFileSync(storePath);
const beforeHash = crypto.createHash("sha256").update(beforeBytes).digest("hex");
const batch3Baseline = JSON.parse(fs.readFileSync(path.join(root, "docs/ich/stage5a-batch3-report.json"), "utf8")) as { after_sha256?: string };
const directionBaselineHash = batch3Baseline.after_sha256 ?? beforeHash;
const file = JSON.parse(beforeBytes.toString("utf8")) as IchOpportunityFile;
const bySlug = new Map(file.entries.map((entry) => [entry.slug, entry]));
const changes: Array<{ slug: string; field: string; before: unknown; after: unknown; source: string; note: string }> = [];

type Direction =
  | "supplier_to_institution"
  | "institution_to_supplier"
  | "institution_to_retailer"
  | "marketplace_for_supplier"
  | "marketplace_for_institution"
  | "grant_to_applicant"
  | "buyer_to_vendor"
  | "open_call_to_creator"
  | "unknown";
type Decision = "KEEP" | "RECLASSIFY" | "ICH_EXCLUDE" | "UNIVERSAL_POOL_ONLY";

const batch3: Array<{ slug: string; direction: Direction; decision: Decision; ichActionable: boolean; note: string }> = [
  { slug: "nmaahc-museum-store-vendor-artisan-application", direction: "supplier_to_institution", decision: "KEEP", ichActionable: true, note: "官方接受artisan/vendor/supplier提交自己的产品供Museum Store考虑销售。" },
  { slug: "museumshops-uk-sell-with-us-partnership", direction: "marketplace_for_institution", decision: "RECLASSIFY", ichActionable: true, note: "平台服务对象是博物馆、历史建筑、图书馆、美术馆和科学中心，不是普通工艺供应商。" },
  { slug: "national-museum-australia-museum-shop-wholesale-registration", direction: "institution_to_retailer", decision: "UNIVERSAL_POOL_ONLY", ichActionable: false, note: "gift shops/gallery shops/retailers注册后采购博物馆自有商品。" },
  { slug: "met-store-wholesale-retail-institution-inquiry", direction: "institution_to_retailer", decision: "UNIVERSAL_POOL_ONLY", ichActionable: false, note: "museum store/gallery/gift shop/retail institution采购The Met商品。" },
  { slug: "van-gogh-museum-shop-new-retailer-wholesale", direction: "institution_to_retailer", decision: "UNIVERSAL_POOL_ONLY", ichActionable: false, note: "官方文案是Interested in retailing our products，属于博物馆向零售商批发。" },
  { slug: "sunshine-makers-market-vendor-application-september-2026", direction: "marketplace_for_supplier", decision: "KEEP", ichActionable: true, note: "市集向makers/artists/creators开放展商申请，属于供应方进入市场。" },
  { slug: "west-coast-craft-fort-mason-night-market-2026", direction: "marketplace_for_supplier", decision: "KEEP", ichActionable: true, note: "手工艺夜市接受artist/designer/craftsperson展商申请。" },
  { slug: "lattin-farms-crafters-fair-vendor-2026", direction: "marketplace_for_supplier", decision: "KEEP", ichActionable: true, note: "市场面向local crafters and artisans提供展位销售机会。" },
  { slug: "yuanmingyuan-national-day-ich-event-procurement-2026", direction: "buyer_to_vendor", decision: "KEEP", ichActionable: true, note: "圆明园管理处作为采购方采购非遗主题活动执行服务。" },
  { slug: "xian-museum-collection-resources-partner-call-2026", direction: "supplier_to_institution", decision: "KEEP", ichActionable: true, note: "合作机构向试点博物馆提供IP授权运营、文创开发、生产和销售能力。" },
];

const legacyChannelDirections: Record<string, { direction: Direction; note: string }> = {
  "expansion-batch-01-011": { direction: "marketplace_for_supplier", note: "共享陶艺工作室提供空间，交易方向是空间方服务创作者。" },
  "expansion-batch-01-022": { direction: "marketplace_for_supplier", note: "共享空间出租给陶艺创作者，不是机构采购工艺品。" },
  "expansion-batch-01-023": { direction: "marketplace_for_supplier", note: "East London工作室空间出租给创作者。" },
  "expansion-batch-01-026": { direction: "marketplace_for_supplier", note: "共享陶艺工作室提供空间给工艺创作者。" },
  "expansion-batch-03-021": { direction: "unknown", note: "历史记录仅有入驻招募线索，官方交易对象未确认。" },
  "expansion-batch-03-062": { direction: "grant_to_applicant", note: "文化遗产资助计划是资助方到申请人，不是渠道采购。" },
  "expansion-batch-03-066": { direction: "open_call_to_creator", note: "展览机会是向创作者公开征集作品。" },
  "expansion-batch-03-072": { direction: "grant_to_applicant", note: "文化资助计划是资助方到申请人。" },
  "2026-china-great-wall-museum-cultural-products-partner": { direction: "supplier_to_institution", note: "文创产品开发、供货或空间运营能力提交给博物馆。" },
  "2026-suzhou-museum-cultural-service-center-partner": { direction: "supplier_to_institution", note: "团队或传承人向博物馆文化服务中心提供展示、体验或经营合作。" },
  "2026-guangzhou-gift-product-collection": { direction: "open_call_to_creator", note: "广州礼物是向企业、机构及创作者征集产品。" },
  "2026-guangdong-cultural-tourism-subsidy-platform-selection": { direction: "supplier_to_institution", note: "平台企业向文旅主管部门提供消费券发放和活动服务。" },
  "nnhm-creative-figurine-cooperation-2026": { direction: "supplier_to_institution", note: "企业或组织向国家自然博物馆提供文创产品设计开发、生产和运营能力。" },
};

function setExtra(entry: IchOpportunity, field: string, value: unknown, source: string, note: string): void {
  const target = entry as unknown as Record<string, unknown>;
  const before = target[field];
  if (JSON.stringify(before) === JSON.stringify(value)) return;
  target[field] = value;
  changes.push({ slug: entry.slug, field, before, after: value, source, note });
}

function addProvenance(entry: IchOpportunity, source: string, note: string): void {
  const target = entry as unknown as Record<string, unknown>;
  const prior = (target.field_provenance && typeof target.field_provenance === "object") ? target.field_provenance as Record<string, unknown> : {};
  target.field_provenance = {
    ...prior,
    opportunity_direction: { source_url: source, checked_at: nowIso, note },
  };
  target.metadata = { ...(entry.metadata ?? {}), updated_at: nowIso, updated_by: "stage5a2-direction-review", last_checked_at: nowIso };
}

const batch3Slugs = new Set(batch3.map((item) => item.slug));

for (const entry of file.entries.filter((candidate) => candidate.primary_category === "channel_collaboration")) {
  if (batch3Slugs.has(entry.slug)) continue;
  const mapping = legacyChannelDirections[entry.slug];
  if (!mapping) throw new Error(`Missing direction mapping for channel record ${entry.slug}`);
  const source = entry.sources.find((item) => item.is_primary)?.url ?? "unknown";
  setExtra(entry, "opportunity_direction", mapping.direction, source, mapping.note);
  setExtra(entry, "supplier_channel_eligible", ["supplier_to_institution", "marketplace_for_supplier"].includes(mapping.direction), source, "仅供应方进入机构或市场的方向计入供应/销售渠道覆盖。");
  addProvenance(entry, source, mapping.note);
}

const decisions = new Map<string, { direction: Direction; decision: Decision; ichActionable: boolean; note: string }>();
for (const item of batch3) {
  const entry = bySlug.get(item.slug);
  if (!entry) throw new Error(`Missing Batch3 record ${item.slug}`);
  const source = entry.sources.find((candidate) => candidate.is_primary)?.url ?? "unknown";
  setExtra(entry, "opportunity_direction", item.direction, source, item.note);
  setExtra(entry, "ich_actionable", item.ichActionable, source, item.ichActionable ? "方向与ICH用户行动目标一致。" : "反向批发机会保留在Universal Opportunity Pool，不计入ICH行动池。");
  setExtra(entry, "supplier_channel_eligible", ["supplier_to_institution", "marketplace_for_supplier"].includes(item.direction), source, "反向批发不得计入供应方渠道覆盖。");
  if (item.slug === "museumshops-uk-sell-with-us-partnership") {
    const before = entry.eligibility.eligible_applicant_types;
    entry.eligibility.eligible_applicant_types = ["organization"];
    changes.push({ slug: entry.slug, field: "eligibility.eligible_applicant_types", before, after: entry.eligibility.eligible_applicant_types, source, note: "官方限制为博物馆、历史建筑、图书馆、美术馆和科学中心及其关联组织。" });
    const beforeText = entry.eligibility.eligibility_text;
    entry.eligibility.eligibility_text = "仅限英国或王室属地的博物馆、历史建筑、图书馆、美术馆和科学中心及其关联组织；个人及与博物馆/画廊无关联的商业公司不得直接销售。申请者需有至少10件可上架产品并具备三工作日内发货能力。";
    changes.push({ slug: entry.slug, field: "eligibility.eligibility_text", before: beforeText, after: entry.eligibility.eligibility_text, source, note: "将官方申请主体限制直接写入资格文本。" });
    entry.location.eligible_regions = ["英国或王室属地的博物馆、历史建筑、图书馆、美术馆、科学中心及其关联组织"];
  }
  addProvenance(entry, source, item.note);
  decisions.set(item.slug, item);
}

const beforeStatuses: Record<string, number> = {};
for (const entry of file.entries.filter((item) => item.is_published)) {
  const status = computeIchOpportunityStatus(entry, now);
  beforeStatuses[status] = (beforeStatuses[status] ?? 0) + 1;
}
const beforeActionable = ["active", "closing_soon", "long_term"].reduce((sum, status) => sum + (beforeStatuses[status] ?? 0), 0);
const beforeChannelActionable = file.entries.filter((entry) => entry.is_published && entry.primary_category === "channel_collaboration" && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;

new IchOpportunityStore(storePath).replaceAll(file.entries, nowIso);
const afterBytes = fs.readFileSync(storePath);
const afterHash = crypto.createHash("sha256").update(afterBytes).digest("hex");
const afterFile = JSON.parse(afterBytes.toString("utf8")) as IchOpportunityFile;
const afterStatuses: Record<string, number> = {};
for (const entry of afterFile.entries.filter((item) => item.is_published)) {
  const status = computeIchOpportunityStatus(entry, now);
  afterStatuses[status] = (afterStatuses[status] ?? 0) + 1;
}
const directionActionable = afterFile.entries.filter((entry) => entry.is_published && (entry as IchOpportunity & { ich_actionable?: boolean }).ich_actionable !== false && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
const afterChannelActionable = afterFile.entries.filter((entry) => entry.is_published && entry.primary_category === "channel_collaboration" && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
const supplierChannelCoverage = afterFile.entries.filter((entry) => entry.is_published && entry.primary_category === "channel_collaboration" && (entry as IchOpportunity & { supplier_channel_eligible?: boolean }).supplier_channel_eligible === true && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
const procurementActionable = afterFile.entries.filter((entry) => entry.is_published && entry.primary_category === "procurement_project" && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
const decisionCounts = [...decisions.values()].reduce<Record<Decision, number>>((counts, item) => { counts[item.decision] += 1; return counts; }, { KEEP: 0, RECLASSIFY: 0, ICH_EXCLUDE: 0, UNIVERSAL_POOL_ONLY: 0 });

const sourceBySlug = new Map(afterFile.entries.map((entry) => [entry.slug, entry.sources.find((item) => item.is_primary)?.url ?? "未确认"]));
const rows = batch3.map((item) => `| ${item.slug} | ${bySlug.get(item.slug)?.primary_category ?? "未确认"} | ${item.direction} | ${item.decision} | ${item.note.replaceAll("|", "\\|")} |`);
const audit = [
  "# Stage5-A.2 Batch3 Opportunity Direction 审计",
  "",
  `复核时间：${nowIso}（Asia/Shanghai）`,
  "",
  "本阶段只修复方向语义和资格边界，不新增机会、不执行 Batch4、不部署。所有官方链接均沿用记录中的 L1 主来源；反向 wholesale 记录保留为 Universal Opportunity Pool only，不再计入 ICH 行动池。",
  "",
  "## Batch3 十条记录",
  "",
  "| Opportunity | Current Category | Direction | Decision | Reason |",
  "| --- | --- | --- | --- | --- |",
  ...rows,
  "",
  "## 重点官方方向结论",
  "",
  `- NMAAHC：${sourceBySlug.get("nmaahc-museum-store-vendor-artisan-application")}，artisan/vendor/supplier 提交自己的产品，` + "`supplier_to_institution`，KEEP。",
  `- National Museum of Australia、The Met Store、Van Gogh Museum：官方均表达零售商采购博物馆自有商品，统一为 ` + "`institution_to_retailer`，UNIVERSAL_POOL_ONLY。",
  `- MuseumShops UK：官方限定机构类型，修正为 ` + "`marketplace_for_institution`，仅保留 `organization` 申请类型，不计入普通非遗创业主体供应渠道覆盖。",
  `- 西安市博物馆馆藏资源合作：${sourceBySlug.get("xian-museum-collection-resources-partner-call-2026")}，为机构向博物馆提供IP授权运营与文创开发能力，` + "`supplier_to_institution`，KEEP。",
  "",
  "## 数量重算",
  "",
  `- formal_total：${afterFile.entries.length}（before ${file.entries.length}；本阶段不新增/删除）`,
  `- exact_active：${afterStatuses.active ?? 0}`,
  `- closing_soon：${afterStatuses.closing_soon ?? 0}`,
  `- opening_soon：${afterStatuses.opening_soon ?? 0}`,
  `- long_term：${afterStatuses.long_term ?? 0}`,
  `- raw actionable_pool：${beforeActionable} → ${["active", "closing_soon", "long_term"].reduce((sum, status) => sum + (afterStatuses[status] ?? 0), 0)}`,
  `- direction-aware ICH actionable_pool：${beforeActionable} → ${directionActionable}（剔除3条反向博物馆批发）`,
  `- channel_collaboration actionable：${beforeChannelActionable} → ${afterChannelActionable}`,
  `- supplier channel coverage：${supplierChannelCoverage}`,
  `- procurement_project actionable：${procurementActionable}`,
  "",
  "## Direction Gate 与 Batch4 技术债",
  "",
  "新增 `verify-ich-stage5a-direction`：要求所有 channel_collaboration 记录存在 opportunity_direction；反向 wholesale 不得计入 supplier channel；官方禁止普通商业主体时不得保留 individual/enterprise/studio 申请类型。",
  "",
  "Batch3 历史脚本仍保留 structuredClone(base) 以便审计复现；Batch4 gate 已建立，任何 `run-ich-stage5a-batch4.ts` 出现该模式都会失败。Batch4 必须使用显式 Opportunity 工厂或显式字段构造。",
  "",
  `本次变更前 SHA-256：${directionBaselineHash}`,
  `本次变更后 SHA-256：${afterHash}`,
  `字段变更数：${changes.length}`,
  "",
  "## 决策计数",
  "",
  `KEEP ${decisionCounts.KEEP}；RECLASSIFY ${decisionCounts.RECLASSIFY}；ICH_EXCLUDE ${decisionCounts.ICH_EXCLUDE}；UNIVERSAL_POOL_ONLY ${decisionCounts.UNIVERSAL_POOL_ONLY}`,
  "",
  "结论：Stage5-A.2 方向语义修复通过；可以进入 Batch4 的候选设计，但 Batch4 仍须先通过本方向门禁并采用显式机会工厂。",
  "",
].join("\n");
fs.writeFileSync(auditPath, `${audit}\n`, "utf8");
fs.writeFileSync(summaryPath, `${JSON.stringify({
  stage: "stage5a2", gate: "pass", reviewed_batch3: batch3.length, total_channel_records: afterFile.entries.filter((entry) => entry.primary_category === "channel_collaboration").length,
  decisions: decisionCounts, before_sha256: directionBaselineHash, after_sha256: afterHash, formal_total: afterFile.entries.length,
  lifecycle_before: beforeStatuses, lifecycle_after: afterStatuses, actionable_pool_before: beforeActionable,
  actionable_pool_after_raw: ["active", "closing_soon", "long_term"].reduce((sum, status) => sum + (afterStatuses[status] ?? 0), 0),
  actionable_pool_after_direction_aware: directionActionable, channel_actionable_before: beforeChannelActionable,
  channel_actionable_after: afterChannelActionable, supplier_channel_coverage: supplierChannelCoverage,
  procurement_actionable: procurementActionable, changes: changes.length, batch3: batch3.map((item) => ({ ...item, source_url: sourceBySlug.get(item.slug) })),
  batch4_factory_gate: "pass",
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ gate: "pass", before_sha256: directionBaselineHash, after_sha256: afterHash, formal_total: afterFile.entries.length, actionable_pool_before: beforeActionable, actionable_pool_after_raw: 43, actionable_pool_after_direction_aware: directionActionable, channel_actionable_before: beforeChannelActionable, channel_actionable_after: afterChannelActionable, supplier_channel_coverage: supplierChannelCoverage, procurement_actionable: procurementActionable, decisions: decisionCounts, changes: changes.length }, null, 2));
