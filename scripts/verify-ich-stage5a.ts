import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const now = new Date("2026-09-06T12:00:00+08:00");
const storePath = path.join(root, "data/ich-opportunities.json");
const reportPath = path.join(root, "docs/ich/stage5a-batch1-report.json");
const semanticSummaryPath = path.join(root, "docs/ich/stage5a1-semantic-summary.json");
const bytes = fs.readFileSync(storePath);
const file = JSON.parse(bytes.toString("utf8")) as IchOpportunityFile;
const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
  before_count: number; after_count: number; imported: number; active_after: number;
  before_sha256: string; after_sha256: string; titles: string[]; gate: string;
  semantic_repaired_sha256?: string;
};
const semantic = JSON.parse(fs.readFileSync(semanticSummaryPath, "utf8")) as {
  records_reviewed: number; fields_repaired: number; fields_set_unknown: number; semantic_conflicts_after: number;
  active_before: number; active_after: number; before_count: number; after_count: number; before_sha256: string; after_sha256: string; gate: string;
};
const errors: string[] = [];
const hash = crypto.createHash("sha256").update(bytes).digest("hex");
const primaryUrls = new Map<string, string>();
const ids = new Set<string>();
const slugs = new Set<string>();
const importedTitles = new Set(report.titles);
const importedIds = new Set(file.entries.filter((entry) => importedTitles.has(entry.title)).map((entry) => entry.id));
for (const entry of file.entries) {
  if (ids.has(entry.id)) errors.push(`duplicate id: ${entry.id}`);
  if (slugs.has(entry.slug)) errors.push(`duplicate slug: ${entry.slug}`);
  ids.add(entry.id); slugs.add(entry.slug);
  for (const source of entry.sources.filter((item) => item.is_primary)) {
    const prior = primaryUrls.get(source.url);
    // Existing pre-Stage5A records contain known historical duplicate URLs. The
    // batch gate only rejects duplicates introduced by this batch or a new entry
    // colliding with an existing primary URL.
    if (prior && prior !== entry.id && (importedIds.has(prior) || importedIds.has(entry.id))) errors.push(`duplicate primary source: ${source.url}`);
    primaryUrls.set(source.url, entry.id);
  }
}
if (report.gate !== "pass") errors.push("batch gate is not pass");
if (report.before_count !== 127) errors.push(`unexpected before count: ${report.before_count}`);
if (report.after_count !== 137) errors.push(`unexpected Stage5-A.1 baseline after count: ${report.after_count}`);
if (file.entries.length < report.after_count) errors.push(`store count ${file.entries.length} is below Stage5-A.1 baseline ${report.after_count}`);
if (report.imported !== 10) errors.push(`unexpected imported count: ${report.imported}`);
const expectedHash = report.semantic_repaired_sha256 ?? report.after_sha256;
// Later controlled batches legitimately change the store after the Stage5-A.1
// baseline. The exact hash is required only while the baseline is still the
// current store; Batch2 has its own hash gate.
if (file.entries.length === report.after_count && hash !== expectedHash) errors.push(`store hash ${hash} != expected repaired hash ${expectedHash}`);
if (semantic.gate !== "pass") errors.push("semantic summary gate is not pass");
if (semantic.records_reviewed !== 10) errors.push(`semantic records reviewed: ${semantic.records_reviewed}`);
if (semantic.after_count > file.entries.length) errors.push(`semantic baseline count ${semantic.after_count} exceeds store count ${file.entries.length}`);
if (file.entries.length === semantic.after_count && semantic.after_sha256 !== hash) errors.push(`semantic summary hash ${semantic.after_sha256} != store hash ${hash}`);
const imported = file.entries.filter((entry) => report.titles.includes(entry.title));
if (imported.length !== 10) errors.push(`imported title count: ${imported.length}`);
for (const entry of imported) {
  if (!entry.is_published || entry.workflow.state !== "published") errors.push(`not published: ${entry.title}`);
  if (entry.verification.verification_status !== "verified") errors.push(`not verified: ${entry.title}`);
  if (!entry.sources.some((source) => source.is_primary && source.level === "L1" && source.is_accessible)) errors.push(`no accessible L1 primary source: ${entry.title}`);
  if (!entry.application.application_url) errors.push(`no application URL: ${entry.title}`);
  if (!entry.dates.deadline_at) errors.push(`no deadline: ${entry.title}`);
  if (!(entry as IchOpportunity & { radar_tags?: string[] }).radar_tags?.length) errors.push(`no radar_tags: ${entry.title}`);
  const provenance = (entry as IchOpportunity & { field_provenance?: Record<string, unknown> }).field_provenance;
  if (!provenance || Object.keys(provenance).length < 3) errors.push(`insufficient field provenance: ${entry.title}`);
}
const active = file.entries.filter((entry) => entry.is_published && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
if (file.entries.length === semantic.after_count && active !== semantic.active_after) errors.push(`computed active ${active} != semantic active_after ${semantic.active_after}`);

const bySlug = new Map(imported.map((entry) => [entry.slug, entry]));
const expect = (slug: string, condition: boolean, reason: string) => { if (!condition) errors.push(`${slug}: ${reason}`); };
const beijing = bySlug.get("beijing-traditional-craft-fund-2026-round2");
if (beijing) {
  expect(beijing.slug, beijing.location.participation_scope === "local_only", "北京专项不得标记 nationwide/global");
  expect(beijing.slug, beijing.location.eligible_regions.includes("北京市") && beijing.eligibility.local_registration_required === true, "北京地域/注册要求不一致");
  expect(beijing.slug, beijing.costs.application_fee_amount === null && beijing.costs.cost_status !== "confirmed", "未披露费用不得标记免费");
}
const nnhm = bySlug.get("nnhm-creative-figurine-cooperation-2026");
if (nnhm) {
  expect(nnhm.slug, nnhm.eligibility.business_license_required === true, "博物馆合作缺少营业执照要求");
  expect(nnhm.slug, nnhm.participation_mode.requires_on_site_presence === true, "博物馆合作驻场义务未表达");
  expect(nnhm.slug, nnhm.costs.application_fee_amount === null && nnhm.costs.cost_status !== "confirmed", "未披露费用不得标记免费");
}
const guangzhou = bySlug.get("guangzhou-excellent-traditional-culture-heritage-2026");
if (guangzhou) {
  expect(guangzhou.slug, guangzhou.location.participation_scope === "local_only" && guangzhou.location.eligible_regions.includes("广州市"), "广州专项地域不一致");
  expect(guangzhou.slug, guangzhou.eligibility.ich_status_required === true && guangzhou.eligibility.recommendation_required === true, "广州非遗身份/推荐要求缺失");
}
const galicia = bySlug.get("artesania-galicia-awards-2026");
if (galicia) {
  expect(galicia.slug, galicia.location.participation_scope === "regional" && galicia.location.eligible_regions.some((region) => region.includes("Galicia")), "Galicia工艺奖不得标记全球");
  expect(galicia.slug, !(galicia as IchOpportunity & { radar_tags?: string[] }).radar_tags?.includes("ICH"), "一般区域工艺奖不得虚构为ICH专项");
}
const takarazuka = bySlug.get("takarazuka-handicraft-open-exhibition-2026");
if (takarazuka) expect(takarazuka.slug, takarazuka.participation_mode.requires_on_site_presence === true && takarazuka.requirements.sample_required === true, "宝塚实物搬入/展示义务缺失");
const hunt = bySlug.get("hunt-museum-open-submission-2026");
if (hunt) expect(hunt.slug, hunt.participation_mode.requires_on_site_presence === true && hunt.costs.shipping_self_funded === true, "Hunt递送义务缺失");
const analog = bySlug.get("new-bedford-art-museum-analog-2026");
if (analog) expect(analog.slug, analog.costs.application_fee_amount === 40 && analog.costs.application_fee_currency === "USD", "Analog投稿费未按官方页面记录");
const peanut = bySlug.get("national-peanut-festival-craft-exhibits-2026");
if (peanut) expect(peanut.slug, peanut.participation_mode.requires_on_site_presence === true && !(peanut as IchOpportunity & { radar_tags?: string[] }).radar_tags?.includes("ICH"), "通用手工艺展的现场义务/ICH标签错误");
const alberta = bySlug.get("alberta-indigenous-reconciliation-cultural-stream-2026");
if (alberta) expect(alberta.slug, alberta.location.participation_scope === "province_only" && alberta.eligibility.local_registration_required === true, "Alberta专项不得标记全球");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(JSON.stringify({ pass: true, total: file.entries.length, imported: imported.length, active, active_before: semantic.active_before, fields_repaired: semantic.fields_repaired, fields_set_unknown: semantic.fields_set_unknown, primary_urls: primaryUrls.size, hash }, null, 2));
