import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type QueueItem = { id: string; slug: string; title: string; queue: string; priority: number; store_primary_url: string | null; missing_fields: string[]; reason_codes: string[]; disposition: string };
type StoreEntry = { id: string; is_published: boolean; workflow?: { state?: string }; verification?: { verification_status?: string; source_conflict?: boolean } };

const ledgerPath = path.resolve("docs/ich/DS8-全量复核动作账本_V1.0.json");
const storePath = path.resolve("data/ich-opportunities.json");
const outputPath = path.resolve("docs/ich/DS11-B-DS8字段复核首批_V1.0.json");
const reportPath = path.resolve("docs/ich/DS11-B-DS8字段复核首批报告_V1.0.md");
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as { results: QueueItem[]; formal_store_before_sha256: string; formal_store_after_sha256: string };
const store = JSON.parse(fs.readFileSync(storePath, "utf8")) as { entries: StoreEntry[] };

const manualDecisions: Record<string, { decision: string; reason: string; proposed_patch: Record<string, unknown> | null }> = {
  ich_auto_20260824_006: { decision: "confirmed_existing_record_no_change", reason: "官方详情页明确活动日期、参展企业范围、免费参展和2026-08-28报名截止；现有记录字段已覆盖可确认信息。", proposed_patch: null },
  ich_e22d46a41a3f48c7a0300a73b9aea86e: { decision: "field_patch_ready_hold_write", reason: "官方公告明确面向平台企业、广东省文旅消费券服务范围和资质条件；可补齐服务地域与资格确认状态，但需受控写入。", proposed_patch: { "location.participation_scope": "province_only", "location.eligible_regions": ["guangdong"], "location.location_status": "confirmed", "eligibility.eligibility_status": "confirmed" } },
  ich_expansion_batch_01_003: { decision: "hold_source_conflict", reason: "当前官方页面是启动报道，未提供可核对的报名截止与申请入口；现有记录已标记来源冲突，不放行。", proposed_patch: null },
  ich_expansion_batch_03_013: { decision: "hold_non_specific_source", reason: "当前链接为北京国际设计周首页，未找到2026非遗设计单元具体征集页；不得用首页替代详情页。", proposed_patch: null },
  ich_stage5_006: { decision: "field_patch_ready_hold_write", reason: "官方报名要求页明确全国参赛对象、2026-08-31 18:00截止、报名邮箱和材料要求；可补齐申请邮箱并将地点确认状态提升，但需受控写入。", proposed_patch: { "application.application_email": "ZGYZY0919@163.com", "application.application_status": "confirmed", "location.location_status": "confirmed" } },
};

function normalize(value: string): string { return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, ""); }
function stripHtml(value: string): string { return value.replace(/<script[\s\S]*?<\/script>/giu, " ").replace(/<style[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim(); }

async function read(item: QueueItem) {
  if (!item.store_primary_url) return { status: null, final_url: null, accessible: false, title_match: false, signals: [], snapshot_hash: null, response_bytes: 0, error: "missing primary URL" };
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(item.store_primary_url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-ICH-DS11B-readonly/1.0" } });
    const body = await response.text(); const text = stripHtml(body); const normalized = normalize(text); const title = normalize(item.title);
    const signals = ["截止", "报名", "征集", "申请", "参展", "参赛", "资格", "邮箱", "采购"].filter((term) => normalized.includes(normalize(term)));
    return { status: response.status, final_url: response.url, accessible: response.status >= 200 && response.status < 400, title_match: normalized.includes(title.slice(0, Math.min(24, title.length))), signals, snapshot_hash: crypto.createHash("sha256").update(body).digest("hex"), response_bytes: Buffer.byteLength(body), error: null };
  } catch (error) { return { status: null, final_url: null, accessible: false, title_match: false, signals: [], snapshot_hash: null, response_bytes: 0, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }; }
  finally { clearTimeout(timer); }
}

async function main(): Promise<void> {
  const selected = ledger.results.filter((item) => item.disposition === "manual_field_review" && item.queue === "urgent_deadline").sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, 5);
  const before = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex"); const reviews = [];
  for (const item of selected) {
    const source = await read(item); const storeEntry = store.entries.find((entry) => entry.id === item.id); const manual = manualDecisions[item.id] ?? { decision: "hold_for_followup", reason: "未配置安全处置规则", proposed_patch: null };
    reviews.push({ id: item.id, slug: item.slug, title: item.title, queue: item.queue, source_recheck: source, inherited_missing_fields: item.missing_fields, inherited_reason_codes: item.reason_codes, existing_store_state: storeEntry ? { is_published: storeEntry.is_published, workflow_state: storeEntry.workflow?.state ?? null, verification_status: storeEntry.verification?.verification_status ?? null, source_conflict: storeEntry.verification?.source_conflict ?? null } : null, manual_decision: manual.decision, reason: manual.reason, proposed_patch: manual.proposed_patch, formal_publish_blocked: manual.decision !== "confirmed_existing_record_no_change", formal_store_write_required: false });
  }
  const after = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex"); const confirmed = reviews.filter((item) => item.manual_decision === "confirmed_existing_record_no_change"); const patchReady = reviews.filter((item) => item.manual_decision === "field_patch_ready_hold_write");
  const audit = { schema_version: "ich-ds11b-field-review.v1", stage: "DS11-B", batch_id: `ds11b-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-001`, audited_at: new Date().toISOString(), readonly: true, batch_limit: 10, selected_count: reviews.length, confirmed_no_change_count: confirmed.length, patch_ready_count: patchReady.length, formal_store_path: "data/ich-opportunities.json", formal_store_write: false, formal_store_before_sha256: before, formal_store_after_sha256: after, formal_store_unchanged: before === after && before === ledger.formal_store_before_sha256 && after === ledger.formal_store_after_sha256, publish_count: 0, gate: reviews.length === 5 && before === after ? "pass_with_followups" : "blocked", reviews };
  fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(reportPath, `# DS11-B DS8 字段复核首批报告 V1.0\n\n- 批次：\`${audit.batch_id}\`\n- 选入：${reviews.length} 条（上限 10）\n- 已确认无变更：${confirmed.length} 条\n- 可受控修补但暂不写入：${patchReady.length} 条\n- 正式库写入：**false**\n- 自动发布：**0 条**\n- 门禁：**${audit.gate}**\n\n## 处置\n\n${reviews.map((item, index) => `${index + 1}. **${item.title}**（${item.id}）— **${item.manual_decision}**：${item.reason}`).join("\n")}\n\n## 边界\n\n字段修补仅记录为 proposed_patch，未修改正式机会库；来源冲突、首页替代详情页和未确认申请入口继续阻断。\n\n机器记录：[DS11-B-DS8字段复核首批_V1.0.json](./DS11-B-DS8字段复核首批_V1.0.json)。\n`, "utf8");
  console.log(JSON.stringify({ stage: audit.stage, batch_id: audit.batch_id, selected_count: audit.selected_count, confirmed_no_change_count: audit.confirmed_no_change_count, patch_ready_count: audit.patch_ready_count, formal_store_write: false, publish_count: 0, gate: audit.gate }, null, 2)); if (audit.gate === "blocked") process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
