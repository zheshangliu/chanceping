import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type StoreEntry = {
  id: string;
  title: string;
  is_published: boolean;
  classification_status: string;
  workflow?: { state?: string };
  verification?: { verification_status?: string };
};

type QueueResult = {
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
};

const queuePath = path.resolve("docs/ich/DS8-全量复核动作账本_V1.0.json");
const storePath = path.resolve("data/ich-opportunities.json");
const outputPath = path.resolve("docs/ich/DS11-A-DS8首批人工处置确认_V1.0.json");
const reportPath = path.resolve("docs/ich/DS11-A-DS8首批人工处置确认报告_V1.0.md");
const queue = JSON.parse(fs.readFileSync(queuePath, "utf8")) as { results: QueueResult[]; formal_store_before_sha256: string; formal_store_after_sha256: string };
const store = JSON.parse(fs.readFileSync(storePath, "utf8")) as { entries: StoreEntry[] };

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

function stripHtml(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/giu, " ").replace(/<style[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}

async function recheck(item: QueueResult) {
  if (!item.store_primary_url) return { status: null, final_url: null, accessible: false, title_match: false, response_bytes: 0, snapshot_hash: null, error: "missing primary URL" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(item.store_primary_url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-ICH-DS11A-readonly/1.0" } });
    const body = await response.text();
    const text = normalize(stripHtml(body));
    const title = normalize(item.title);
    return {
      status: response.status,
      final_url: response.url,
      accessible: response.status >= 200 && response.status < 400,
      title_match: title.length >= 6 ? text.includes(title.slice(0, Math.min(24, title.length))) : false,
      response_bytes: Buffer.byteLength(body),
      snapshot_hash: crypto.createHash("sha256").update(body).digest("hex"),
      error: null,
    };
  } catch (error) {
    return { status: null, final_url: null, accessible: false, title_match: false, response_bytes: 0, snapshot_hash: null, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const selected = queue.results.filter((item) => item.disposition === "ready_for_manual_confirmation").sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, 10);
  const before = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
  const resolutions = [];
  for (const item of selected) {
    const entry = store.entries.find((candidate) => candidate.id === item.id);
    const source = await recheck(item);
    const eligible = Boolean(entry && entry.is_published && entry.classification_status === "confirmed" && entry.workflow?.state === "published" && entry.verification?.verification_status === "verified" && source.accessible && source.title_match && item.missing_fields.length === 0);
    resolutions.push({
      id: item.id,
      slug: item.slug,
      title: item.title,
      queue: item.queue,
      source_recheck: source,
      store_state: entry ? { is_published: entry.is_published, classification_status: entry.classification_status, workflow_state: entry.workflow?.state ?? null, verification_status: entry.verification?.verification_status ?? null } : null,
      inherited_missing_fields: item.missing_fields,
      inherited_reason_codes: item.reason_codes,
      resolution: eligible ? "confirmed_existing_record_no_change" : "hold_for_followup",
      formal_publish_blocked: !eligible,
      formal_store_write_required: false,
    });
  }
  const after = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
  const confirmed = resolutions.filter((item) => item.resolution === "confirmed_existing_record_no_change");
  const audit = {
    schema_version: "ich-ds11a-manual-disposition.v1",
    stage: "DS11-A",
    batch_id: `ds11a-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-001`,
    audited_at: new Date().toISOString(),
    readonly: true,
    batch_limit: 10,
    selected_count: selected.length,
    confirmed_count: confirmed.length,
    selection_rule: "DS8 disposition=ready_for_manual_confirmation, priority descending, max 10",
    formal_store_path: "data/ich-opportunities.json",
    formal_store_write: false,
    formal_store_before_sha256: before,
    formal_store_after_sha256: after,
    formal_store_unchanged: before === after && before === queue.formal_store_before_sha256 && after === queue.formal_store_after_sha256,
    publish_count: 0,
    gate: selected.length > 0 && confirmed.length === selected.length && before === after ? "pass_with_followups" : "blocked",
    resolutions,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  const lines = resolutions.map((item, index) => `${index + 1}. **${item.title}**（${item.id}）— ${item.resolution === "confirmed_existing_record_no_change" ? "已确认，保持现有正式记录" : "继续挂起"}；来源 ${item.source_recheck.status ?? "不可访问"}，标题${item.source_recheck.title_match ? "匹配" : "未匹配"}`);
  fs.writeFileSync(reportPath, `# DS11-A DS8 首批人工处置确认报告 V1.0\n\n- 批次：\`${audit.batch_id}\`\n- 选入：${selected.length} 条（上限 10）\n- 已确认：${confirmed.length} 条\n- 正式库写入：**false**\n- 重复发布：**0 条**\n- 门禁：**${audit.gate}**\n\n## 处置结果\n\n${lines.join("\n")}\n\n## 结论\n\n这批记录原本已存在于正式机会库；本批完成的是实时来源复核和人工确认闭环，不重复写入、不重复发布。其余 DS8 队列继续按字段复核、来源不可用、重复审查和归档审查分别处理。\n\n机器记录：[DS11-A-DS8首批人工处置确认_V1.0.json](./DS11-A-DS8首批人工处置确认_V1.0.json)。\n`, "utf8");
  console.log(JSON.stringify({ stage: audit.stage, batch_id: audit.batch_id, selected_count: audit.selected_count, confirmed_count: audit.confirmed_count, formal_store_write: false, publish_count: 0, gate: audit.gate }, null, 2));
  if (audit.gate === "blocked") process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
