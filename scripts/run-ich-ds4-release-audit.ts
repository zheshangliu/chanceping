import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { isPublicIchOpportunity } from "../src/ich/query";
import { ICH_PRIMARY_CATEGORIES, type IchOpportunityFile } from "../src/ich/types";
import { validateIchOpportunity, validateIchOpportunityFile } from "../src/ich/validation";
import { findIchSemanticIssues } from "../src/ich/semantic-validation";
import { getIchSourceRegistryV2, validateIchSourceRegistryV2 } from "../src/ich/source-registry-v2";

const nowRaw = process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : "2026-08-24T16:00:00+08:00";
const now = new Date(nowRaw);
if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowRaw}`);
const storePath = path.resolve(process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1] : (process.env.CHANCEPING_ICH_STORE_PATH ?? "data/ich-opportunities.json"));
const outputPath = path.resolve(process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output") + 1] : "docs/ich/DS4-发布候选审计记录_V1.0.json");
const reportPath = path.resolve(process.argv.includes("--report") ? process.argv[process.argv.indexOf("--report") + 1] : "docs/ich/DS4-发布候选审计报告_V1.0.md");

const raw = fs.readFileSync(storePath, "utf8");
const parsed: unknown = JSON.parse(raw);
const fileResult = validateIchOpportunityFile(parsed);
if (!fileResult.valid || !fileResult.value) throw new Error(`invalid formal store: ${fileResult.errors.join("; ")}`);
const file = fileResult.value as IchOpportunityFile;
const entries = file.entries;
const registryErrors = validateIchSourceRegistryV2(getIchSourceRegistryV2());
const categories = Object.fromEntries(ICH_PRIMARY_CATEGORIES.map((category) => [category, 0])) as Record<string, number>;
const sourceLevels: Record<string, number> = { L1: 0, L2: 0, L3: 0 };
const errors: string[] = [...registryErrors];
const semanticIssues: Array<{ slug: string; issues: Array<{ field: string; reason: string }> }> = [];
const duplicateUrls = new Set<string>();
const seenUrls = new Set<string>();
const current = [] as typeof entries;
const history = [] as typeof entries;
for (const entry of entries) {
  const validation = validateIchOpportunity(entry);
  if (!validation.valid) errors.push(`${entry.slug}: ${validation.errors.join("; ")}`);
  const primary = entry.sources.find((source) => source.is_primary);
  if (!primary) errors.push(`${entry.slug}: missing primary source`);
  else {
    sourceLevels[primary.level] = (sourceLevels[primary.level] ?? 0) + 1;
    if (isPublicIchOpportunity(entry)) {
      if (seenUrls.has(primary.url)) duplicateUrls.add(primary.url);
      seenUrls.add(primary.url);
    }
  }
  const issues = findIchSemanticIssues(entry, entries);
  if (issues.length) semanticIssues.push({ slug: entry.slug, issues });
  if (!isPublicIchOpportunity(entry)) continue;
  const status = computeIchOpportunityStatus(entry, now);
  if (["expired", "ended", "cancelled", "source_unavailable"].includes(status)) history.push(entry);
  else {
    current.push(entry);
    categories[entry.primary_category] = (categories[entry.primary_category] ?? 0) + 1;
  }
}
const level12 = sourceLevels.L1 + sourceLevels.L2;
const level12Ratio = entries.length === 0 ? 0 : level12 / entries.length;
if (current.length < 30) errors.push(`current=${current.length} < 30`);
for (const category of ICH_PRIMARY_CATEGORIES) if ((categories[category] ?? 0) < 1) errors.push(`${category}: no current opportunity`);
if (level12Ratio < 0.8) errors.push(`L1/L2 ratio=${level12Ratio.toFixed(3)} < 0.800`);
if (duplicateUrls.size) errors.push(`duplicate primary URLs=${duplicateUrls.size}`);
if (semanticIssues.length) errors.push(`semantic issues=${semanticIssues.length}`);
const audit = {
  schema_version: "1.0",
  stage: "DS4",
  gate: errors.length === 0 ? "pass" : "blocked",
  audited_at: now.toISOString(),
  formal_store: { path: path.relative(process.cwd(), storePath), sha256: crypto.createHash("sha256").update(raw).digest("hex"), schema_version: file.schema_version, updated_at: file.updated_at, total: entries.length },
  counts: { current: current.length, historical: history.length, published: entries.filter(isPublicIchOpportunity).length },
  categories,
  source_levels: { ...sourceLevels, level12_ratio: Number(level12Ratio.toFixed(4)) },
  duplicate_primary_urls: [...duplicateUrls],
  semantic_issue_count: semanticIssues.length,
  semantic_issues: semanticIssues,
  errors,
  write_mode: "audit_only",
  production_store_write: false,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
fs.writeFileSync(reportPath, `# DS4 发布候选审计报告 V1.0\n\n- 门禁：**${audit.gate}**\n- 审计时间：${audit.audited_at}\n- 正式库：${audit.formal_store.total} 条（当前 ${audit.counts.current}，历史 ${audit.counts.historical}）\n- 来源等级：L1 ${sourceLevels.L1}，L2 ${sourceLevels.L2}，L3 ${sourceLevels.L3}；L1/L2 比例 ${audit.source_levels.level12_ratio}\n- 语义问题：${audit.semantic_issue_count}\n- 主来源重复：${audit.duplicate_primary_urls.length}\n- 正式库写入：**false**（本脚本只读审计）\n\n## 分类计数\n\n${Object.entries(categories).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n## 错误\n\n${errors.length ? errors.map((error) => `- ${error}`).join("\n") : "- 无"}\n\n机器记录：[DS4-发布候选审计记录_V1.0.json](./DS4-发布候选审计记录_V1.0.json)。\n`, "utf8");
console.log(JSON.stringify({ gate: audit.gate, current: current.length, historical: history.length, total: entries.length, categories, level12_ratio: audit.source_levels.level12_ratio, semantic_issue_count: semanticIssues.length, output: path.relative(process.cwd(), outputPath) }, null, 2));
if (errors.length) process.exitCode = 1;
