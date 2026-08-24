import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type LedgerResult = {
  id: string;
  slug: string;
  title: string;
  queue: string;
  priority: number;
  primary_level: string | null;
  store_primary_url: string | null;
  deadline_state: string;
  missing_fields: string[];
  reason_codes: string[];
  disposition: string;
  formal_publish_blocked: true;
};

type Ledger = {
  results: LedgerResult[];
  formal_store_path: string;
  formal_store_before_sha256: string;
  formal_store_after_sha256: string;
};

const ledgerPath = path.resolve("docs/ich/DS8-全量复核动作账本_V1.0.json");
const outputPath = path.resolve("docs/ich/DS10-A-首批人工确认批次_V1.0.json");
const reportPath = path.resolve("docs/ich/DS10-A-首批人工确认批次报告_V1.0.md");
const storePath = path.resolve("data/ich-opportunities.json");
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as Ledger;
const batchSizeArg = process.argv.find((arg) => arg.startsWith("--batch-size="));
const batchSize = batchSizeArg ? Number(batchSizeArg.split("=", 2)[1]) : 10;
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10) throw new Error("DS10-A batch size must be an integer from 1 to 10");

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

function stripHtml(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/giu, " ").replace(/<style[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}

function titleFragment(title: string): string {
  return normalizeText(title).slice(0, Math.min(24, normalizeText(title).length));
}

async function readSource(item: LedgerResult) {
  if (!item.store_primary_url) return { status: null, final_url: null, accessible: false, title_match: false, snapshot_hash: null, response_bytes: 0, signals: [], error: "missing primary URL" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(item.store_primary_url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-ICH-DS10A-readonly/1.0" } });
    const body = await response.text();
    const text = stripHtml(body);
    const normalized = normalizeText(body);
    const fragment = titleFragment(item.title);
    const signals = ["报名", "征集", "采购", "比选", "截止", "申报", "作品", "申请"].filter((signal) => text.includes(signal));
    return {
      status: response.status,
      final_url: response.url,
      accessible: response.status >= 200 && response.status < 400,
      title_match: fragment.length >= 6 ? normalized.includes(fragment) : null,
      snapshot_hash: crypto.createHash("sha256").update(body).digest("hex"),
      response_bytes: Buffer.byteLength(body),
      signals,
      error: null,
    };
  } catch (error) {
    return { status: null, final_url: null, accessible: false, title_match: false, snapshot_hash: null, response_bytes: 0, signals: [], error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const candidates = ledger.results
    .filter((item) => item.disposition === "ready_for_manual_confirmation")
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, batchSize);
  const records = [];
  for (const item of candidates) {
    const source = await readSource(item);
    records.push({
      id: item.id,
      slug: item.slug,
      title: item.title,
      queue: item.queue,
      priority: item.priority,
      primary_level: item.primary_level,
      primary_url: item.store_primary_url,
      deadline_state: item.deadline_state,
      source_recheck: source,
      inherited_missing_fields: item.missing_fields,
      inherited_reason_codes: item.reason_codes,
      approval_state: "pending_manual_approval",
      formal_publish_blocked: true,
      publish_decision: "hold",
      manual_review_required: ["申请主体/资格", "截止时间", "行动方式", "最终是否仍有效"],
    });
  }
  const before = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
  const after = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
  const audit = {
    schema_version: "ich-ds10a-manual-confirmation-batch.v1",
    stage: "DS10-A",
    batch_id: "ds10a-20260824-001",
    audited_at: new Date().toISOString(),
    readonly: true,
    batch_limit: 10,
    selected_count: records.length,
    selection_rule: "DS8 disposition=ready_for_manual_confirmation, priority descending, max 10",
    manual_approval_required: true,
    formal_store_path: ledger.formal_store_path,
    formal_store_write: false,
    formal_store_before_sha256: before,
    formal_store_after_sha256: after,
    formal_store_matches_ds8: before === ledger.formal_store_before_sha256 && after === ledger.formal_store_after_sha256,
    all_sources_accessible: records.every((record) => record.source_recheck.accessible),
    all_titles_match: records.every((record) => record.source_recheck.title_match === true),
    publishable_count: 0,
    gate: records.length > 0 && records.every((record) => record.formal_publish_blocked && record.approval_state === "pending_manual_approval") && before === after ? "pass_with_followups" : "blocked",
    records,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  const lines = records.map((record, index) => `${index + 1}. **${record.title}**（${record.id}）— ${record.source_recheck.status ?? "unavailable"}，${record.source_recheck.title_match ? "标题匹配" : "标题待核验"}，状态：待人工确认`);
  fs.writeFileSync(reportPath, `# DS10-A 首批人工确认批次报告 V1.0\n\n- 批次：\`${audit.batch_id}\`\n- 选入：${records.length} 条（上限 10）\n- 选择规则：${audit.selection_rule}\n- 官方来源可访问：**${audit.all_sources_accessible}**\n- 标题匹配：**${audit.all_titles_match}**\n- 正式库写入：**false**\n- 自动发布：**0 条**\n- 门禁：**${audit.gate}**\n\n## 待人工确认记录\n\n${lines.join("\n")}\n\n## 放行条件\n\n每条记录仍需人工确认申请主体、截止时间、行动方式和当前有效性；完成前保持 \`formal_publish_blocked=true\`，不得写入正式机会库。\n\n机器记录：[DS10-A-首批人工确认批次_V1.0.json](./DS10-A-首批人工确认批次_V1.0.json)。\n`, "utf8");
  console.log(JSON.stringify({ stage: audit.stage, batch_id: audit.batch_id, selected_count: audit.selected_count, all_sources_accessible: audit.all_sources_accessible, all_titles_match: audit.all_titles_match, publishable_count: 0, formal_store_write: false, gate: audit.gate }, null, 2));
  if (audit.gate === "blocked") process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
