import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { IchOpportunityStore } from "../src/ich/store";
import type { IchOpportunity } from "../src/ich/types";

const storePath = path.resolve("data/ich-opportunities.json");
const outputPath = path.resolve("docs/ich/DS13-质量修复审计_V1.0.json");
const write = process.argv.includes("--write");
const now = new Date("2026-08-24T12:00:00.000Z");
const targets = [
  { id: "ich_e22d46a41a3f48c7a0300a73b9aea86e", url: "https://whly.gd.gov.cn/open_newggl/content/post_4944921.html", markers: ["发放平台要求", "广东省", "营业执照", "提交方式与截止时间", "wl_gdwltcyfzc@gd.gov.cn"], patch: "gd_subsidy_scope_and_eligibility" },
  { id: "ich_stage5_006", url: "https://rs.tongchuan.gov.cn/157/index.jhtml", markers: ["作品征集", "参赛对象", "ZGYZY0919@163.com", "8月31日18:00"], patch: "yaozhou_application_email_and_scope" },
] as const;
const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const beforeRaw = fs.readFileSync(storePath, "utf8");
const store = new IchOpportunityStore(storePath);
const entries = store.list();
const fetched: Array<Record<string, unknown>> = [];

async function verifySource(target: (typeof targets)[number]): Promise<boolean> {
  const response = await fetch(target.url, { redirect: "follow", headers: { "user-agent": "ChancePing-DS13-quality-fix/1.0" } });
  const html = await response.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
  const markerResults = target.markers.map((marker) => ({ marker, found: text.includes(marker) }));
  const ok = response.status >= 200 && response.status < 300 && target.url === response.url && markerResults.every((item) => item.found);
  fetched.push({ id: target.id, requested_url: target.url, final_url: response.url, status: response.status, response_bytes: Buffer.byteLength(html), snapshot_hash: sha(html), markers: markerResults, ok });
  return ok;
}

function patchEntry(entry: IchOpportunity, patchName: string): IchOpportunity {
  const next = JSON.parse(JSON.stringify(entry)) as IchOpportunity;
  const at = now.toISOString();
  if (patchName === "gd_subsidy_scope_and_eligibility") {
    next.location.participation_scope = "province_only";
    next.location.eligible_regions = ["guangdong"];
    next.location.location_status = "confirmed";
    next.eligibility.eligibility_status = "confirmed";
  } else if (patchName === "yaozhou_application_email_and_scope") {
    next.location.participation_scope = "nationwide";
    next.location.eligible_regions = ["nationwide"];
    next.location.location_status = "confirmed";
    next.application.application_email = "ZGYZY0919@163.com";
  }
  next.metadata = { ...next.metadata, updated_at: at, last_checked_at: at, updated_by: "ich-ds13-quality-fix" };
  next.sources = next.sources.map((source) => source.url === targets.find((target) => target.patch === patchName)?.url ? { ...source, last_checked_at: at, notes: `${source.notes ?? ""} DS13 实时详情页字段修复复核。`.trim() } : source);
  const revision = next.workflow.revision + 1;
  next.workflow = { ...next.workflow, revision, history: [...next.workflow.history, { action: "updated", from: next.workflow.state, to: next.workflow.state, actor: "ich-ds13-quality-fix", at, reason: `DS13 已根据第一方详情页修复 ${patchName} 字段。`, revision }] };
  next.verification = { ...next.verification, verification_status: "verified", verified_by: "ai_assisted", verified_at: at, needs_recheck: true, recheck_after: new Date(now.getTime() + 3 * 86_400_000).toISOString() };
  return next;
}

async function main(): Promise<void> {
  const sourceChecks = await Promise.all(targets.map(verifySource));
  const targetEntries = targets.map((target) => entries.find((entry) => entry.id === target.id));
  const missing = targets.filter((_target, index) => !targetEntries[index]);
  const sourceGate = sourceChecks.every(Boolean);
  const gate = sourceGate && missing.length === 0;
  const patches = gate ? targets.map((target) => ({ id: target.id, patch: target.patch, before: targetEntries[targets.indexOf(target)] })) : [];
  let afterRaw = beforeRaw;
  if (write && gate) {
    const nextEntries = entries.map((entry) => {
      const target = targets.find((candidate) => candidate.id === entry.id);
      return target ? patchEntry(entry, target.patch) : entry;
    });
    store.replaceAll(nextEntries, now.toISOString());
    afterRaw = fs.readFileSync(storePath, "utf8");
  }
  const audit = { schema_version: "ich-ds13-quality-fix.v1", stage: "DS13", mode: write ? "write" : "dry_run", audited_at: now.toISOString(), target_ids: targets.map((target) => target.id), source_checks: fetched, source_gate: sourceGate, missing_target_ids: missing.map((target) => target.id), formal_store_path: "data/ich-opportunities.json", formal_store_write: write && gate, before_sha256: sha(beforeRaw), after_sha256: sha(afterRaw), formal_store_changed: sha(beforeRaw) !== sha(afterRaw), backup_path: write && gate ? "data/ich-opportunities.json.bak" : null, patches: patches.map((item) => ({ id: item.id, patch: item.patch, field_scope: item.patch === "gd_subsidy_scope_and_eligibility" ? ["location.participation_scope", "location.eligible_regions", "location.location_status", "eligibility.eligibility_status"] : ["location.participation_scope", "location.eligible_regions", "location.location_status", "application.application_email"] })), gate: gate ? "pass_with_followups" : "blocked" };
  fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify({ stage: audit.stage, mode: audit.mode, target_ids: audit.target_ids, source_gate: audit.source_gate, formal_store_write: audit.formal_store_write, formal_store_changed: audit.formal_store_changed, gate: audit.gate }, null, 2));
  if (!gate) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
