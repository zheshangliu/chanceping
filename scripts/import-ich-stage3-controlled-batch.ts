import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { evaluateControlledBatch } from "../src/ich/controlled-batch-publisher-v1";
import { IchPublicationService } from "../src/ich/publication-service";
import { IchOpportunityStore } from "../src/ich/store";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { validateIchOpportunityFile } from "../src/ich/validation";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

const write = process.argv.includes("--write");
const now = new Date(process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1]! : "2026-09-05T12:00:00+08:00");
const inputPath = path.resolve(process.argv.includes("--input") ? process.argv[process.argv.indexOf("--input") + 1]! : "docs/ich/stage3-verified-candidates.json");
const storePath = path.resolve(process.env.CHANCEPING_ICH_STORE_PATH ?? "data/ich-opportunities.json");
const auditPath = path.resolve("docs/ich/opportunity-import-report.md");
const auditJsonPath = path.resolve("docs/ich/stage3-ds14-import.json");
const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8")) as IchOpportunityFile;
const validation = validateIchOpportunityFile(parsed);
if (!validation.valid || !validation.value) throw new Error(`invalid candidate file: ${validation.errors.join("; ")}`);
if (parsed.entries.length > 10) throw new Error("DS14 batch limit exceeded: maximum 10 candidates");
const beforeBytes = fs.readFileSync(storePath);
const beforeHash = crypto.createHash("sha256").update(beforeBytes).digest("hex");
const store = new IchOpportunityStore(storePath);
const existing = store.list();
const decisions = evaluateControlledBatch(parsed.entries, existing, now, 10);
const eligible = parsed.entries.filter((candidate) => decisions.find((decision) => decision.id === candidate.id)?.decision === "eligible");
const service = new IchPublicationService(store);
const imported: Array<{ source_id: string; id: string; slug: string; workflow: string; is_published: boolean }> = [];
const errors: string[] = [];
if (write && decisions.some((decision) => decision.decision !== "eligible")) throw new Error(`blocked candidates cannot be imported: ${decisions.filter((decision) => decision.decision !== "eligible").map((decision) => decision.slug).join(", ")}`);
if (write) {
  for (const candidate of eligible) {
    try {
      const created = service.create({ ...candidate, is_published: false, workflow: { ...candidate.workflow, state: "draft", revision: 1, history: [{ action: "created", from: null, to: "draft", actor: "stage3-import", at: now.toISOString(), reason: "DS14 单批受控导入", revision: 1 }] } }, { actor: "stage3-import", now });
      const submitted = service.transition(created.id, "pending_review", "submitted", { actor: "stage3-import", now, expectedRevision: created.workflow.revision, reason: "官方详情页、字段证据、去重和时效门禁通过。" });
      const approved = service.transition(created.id, "approved", "approved", { actor: "stage3-reviewer", now, expectedRevision: submitted.workflow.revision, reason: "Stage 3 人工审核通过。" });
      const published = service.transition(created.id, "published", "published", { actor: "stage3-reviewer", now, expectedRevision: approved.workflow.revision });
      imported.push({ source_id: candidate.id, id: published.id, slug: published.slug, workflow: published.workflow.state, is_published: published.is_published });
    } catch (error) {
      errors.push(`${candidate.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
const afterBytes = write && errors.length === 0 ? fs.readFileSync(storePath) : beforeBytes;
const afterHash = crypto.createHash("sha256").update(afterBytes).digest("hex");
const afterEntries = store.list();
const current = afterEntries.filter((entry) => entry.is_published && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(entry, now))).length;
const report = [
  "# Stage 3 机会导入报告",
  "",
  `- 执行时间：${now.toISOString()}`,
  `- 输入候选：${parsed.entries.length}`,
  `- DS14 批次上限：10`,
  `- 通过 DS14：${eligible.length}`,
  `- 导入模式：**${write ? "write" : "dry-run"}**`,
  `- 正式库写入：**${write && errors.length === 0}**`,
  `- 正式库哈希：${beforeHash} → ${afterHash}`,
  `- 当前有效机会：**${current}**`,
  "",
  "## 决策",
  "",
  "| slug | DS14 决策 | 原因 |",
  "| --- | --- | --- |",
  ...decisions.map((decision) => `| ${decision.slug} | ${decision.decision} | ${decision.reasons.join("；") || "官方证据、时效和去重门禁通过"} |`),
  "",
  "## 导入结果",
  "",
  imported.length ? imported.map((entry) => `- ${entry.slug} → ${entry.workflow}（${entry.id}）`) : ["- 未执行写入或没有通过候选。"],
  errors.length ? ["", "## 错误", "", ...errors.map((error) => `- ${error}`)] : [],
  "",
  "本报告不把候选数量当作正式机会；所有未通过记录保留在候选/观察链路，不自动发布。",
].flat();
fs.writeFileSync(auditPath, `${report.join("\n")}\n`);
fs.writeFileSync(auditJsonPath, `${JSON.stringify({ schema_version: "ich-ds14-stage3-import.v1", run_at: now.toISOString(), mode: write ? "write" : "dry-run", batch_limit: 10, input_count: parsed.entries.length, eligible_count: eligible.length, imported, errors, formal_store_before_sha256: beforeHash, formal_store_after_sha256: afterHash, formal_store_unchanged: beforeHash === afterHash, current_count: current, gate: errors.length === 0 && decisions.every((decision) => decision.decision === "eligible") ? "pass" : "blocked" }, null, 2)}\n`);
console.log(JSON.stringify({ mode: write ? "write" : "dry-run", input_count: parsed.entries.length, eligible_count: eligible.length, imported_count: imported.length, current_count: current, formal_store_write: write && errors.length === 0, formal_store_unchanged: beforeHash === afterHash, gate: errors.length === 0 && decisions.every((decision) => decision.decision === "eligible") ? "pass" : "blocked" }, null, 2));
if (errors.length > 0 || decisions.some((decision) => decision.decision !== "eligible")) process.exitCode = 1;
