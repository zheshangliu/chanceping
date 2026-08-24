import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { IchOpportunityStore } from "../src/ich/store";

type QueueName = "urgent_deadline" | "current_recheck" | "field_confirmation" | "history_cleanup";
type Disposition = "source_unavailable" | "duplicate_review" | "archive_review" | "manual_field_review" | "ready_for_manual_confirmation" | "missing_store_entry";

interface QueueItem {
  id: string;
  slug: string;
  title: string;
  status: string;
  primary_level: string | null;
  deadline_at: string | null;
  days_to_deadline: number | null;
  queue: QueueName;
  priority: number;
  primary_url: string | null;
}

interface QueueFile { input_total: number; stale_recheck_count: number; items: QueueItem[] }
interface StoreEntry {
  id: string;
  slug: string;
  title: string;
  dates: { deadline_at: string | null; deadline_text: string; date_status: string };
  location: { location_status: string };
  eligibility: { eligibility_status: string };
  application: { application_status: string };
  sources: Array<{ url: string; is_primary: boolean; level: string }>;
  verification: { needs_recheck: boolean; recheck_after: string | null };
}

interface UrlCheck { status: number | null; final_url: string | null; accessible: boolean; content_type: string | null; response_bytes: number; snapshot_hash: string | null; title_fragment: string | null; title_match: boolean | null; error: string | null }
interface Result {
  id: string;
  slug: string;
  title: string;
  queue: QueueName;
  priority: number;
  primary_level: string | null;
  queue_primary_url: string | null;
  store_primary_url: string | null;
  url_mismatch: boolean;
  url_check: UrlCheck;
  missing_fields: string[];
  duplicate_slugs: string[];
  deadline_state: "expired" | "closing_soon" | "current" | "unknown";
  disposition: Disposition;
  reason_codes: string[];
  formal_publish_blocked: true;
}

const queuePath = path.resolve("docs/ich/DS8-待复核优先级队列_V1.0.json");
const storePath = path.resolve("data/ich-opportunities.json");
const outputPath = path.resolve("docs/ich/DS8-全量复核动作账本_V1.0.json");
const reportPath = path.resolve("docs/ich/DS8-全量复核动作账本报告_V1.0.md");
const queue = JSON.parse(fs.readFileSync(queuePath, "utf8")) as QueueFile;
const storeRawBefore = fs.readFileSync(storePath);
const storeEntries = new IchOpportunityStore(storePath).list() as unknown as StoreEntry[];
const now = new Date(process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : new Date().toISOString());
if (Number.isNaN(now.getTime())) throw new Error("invalid --now");

function normalizeUrl(value: string | null): string | null { return value ? value.replace(/#.*$/, "").replace(/\/$/, "") : null; }
function normalizeText(value: string): string { return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, ""); }
function getPrimary(entry: StoreEntry | undefined): { url: string; level: string } | null {
  const source = entry?.sources.find((item) => item.is_primary);
  return source ? { url: source.url, level: source.level } : null;
}
function missingFields(entry: StoreEntry): string[] {
  return [
    entry.dates.deadline_at ? null : "deadline_at",
    entry.location.location_status === "confirmed" ? null : "location",
    entry.eligibility.eligibility_status === "confirmed" ? null : "eligibility",
    entry.application.application_status === "confirmed" ? null : "application",
  ].filter((field): field is string => Boolean(field));
}
function deadlineState(value: string | null): Result["deadline_state"] {
  if (!value) return "unknown";
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return "unknown";
  if (deadline.getTime() < now.getTime()) return "expired";
  if (deadline.getTime() - now.getTime() <= 14 * 86_400_000) return "closing_soon";
  return "current";
}
function titleFragment(title: string): string { return normalizeText(title).slice(0, Math.min(24, normalizeText(title).length)); }

async function checkUrl(url: string | null, expectedTitle: string): Promise<UrlCheck> {
  if (!url) return { status: null, final_url: null, accessible: false, content_type: null, response_bytes: 0, snapshot_hash: null, title_fragment: null, title_match: null, error: "missing primary URL" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-ICH-DS8-full-recheck/1.0" } });
    const body = await response.text();
    const normalizedBody = normalizeText(body);
    const fragment = titleFragment(expectedTitle);
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim() ?? null;
    return {
      status: response.status,
      final_url: response.url,
      accessible: response.status >= 200 && response.status < 400,
      content_type: response.headers.get("content-type"),
      response_bytes: Buffer.byteLength(body),
      snapshot_hash: crypto.createHash("sha256").update(body).digest("hex"),
      title_fragment: title,
      title_match: fragment.length >= 6 ? normalizedBody.includes(fragment) : null,
      error: null,
    };
  } catch (error) {
    return { status: null, final_url: null, accessible: false, content_type: null, response_bytes: 0, snapshot_hash: null, title_fragment: null, title_match: null, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  } finally { clearTimeout(timer); }
}

async function mapConcurrent<T, U>(items: T[], concurrency: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const output: U[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      output[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return output;
}

async function main(): Promise<void> {
  const entriesById = new Map(storeEntries.map((entry) => [entry.id, entry]));
  const primaryOwners = new Map<string, string[]>();
  for (const entry of storeEntries) {
    const primary = getPrimary(entry);
    const normalized = normalizeUrl(primary?.url ?? null);
    if (normalized) primaryOwners.set(normalized, [...(primaryOwners.get(normalized) ?? []), entry.slug]);
  }
  const results = await mapConcurrent(queue.items, 6, async (item): Promise<Result> => {
    const entry = entriesById.get(item.id);
    if (!entry) {
      return { id: item.id, slug: item.slug, title: item.title, queue: item.queue, priority: item.priority, primary_level: item.primary_level, queue_primary_url: item.primary_url, store_primary_url: null, url_mismatch: false, url_check: await checkUrl(null, item.title), missing_fields: [], duplicate_slugs: [], deadline_state: deadlineState(item.deadline_at), disposition: "missing_store_entry", reason_codes: ["queue_entry_not_in_formal_store"], formal_publish_blocked: true };
    }
    const primary = getPrimary(entry);
    const queueUrl = normalizeUrl(item.primary_url);
    const storeUrl = normalizeUrl(primary?.url ?? null);
    const urlMismatch = Boolean(queueUrl && storeUrl && queueUrl !== storeUrl);
    const urlCheck = await checkUrl(primary?.url ?? item.primary_url, entry.title);
    const missing = missingFields(entry);
    const duplicateSlugs = storeUrl ? (primaryOwners.get(storeUrl) ?? []).filter((slug) => slug !== entry.slug) : [];
    const reasons: string[] = [];
    if (!urlCheck.accessible) reasons.push(urlCheck.error ? "primary_url_unavailable" : "primary_url_non_2xx");
    if (urlMismatch) reasons.push("queue_store_primary_url_mismatch");
    if (duplicateSlugs.length > 0) reasons.push("duplicate_primary_url");
    if (missing.length > 0) reasons.push(`missing_fields:${missing.join(",")}`);
    if (urlCheck.title_match === false) reasons.push("title_not_found_in_snapshot");
    const status = deadlineState(entry.dates.deadline_at ?? item.deadline_at);
    let disposition: Disposition = "ready_for_manual_confirmation";
    if (!urlCheck.accessible) disposition = "source_unavailable";
    else if (duplicateSlugs.length > 0) disposition = "duplicate_review";
    else if (item.queue === "history_cleanup" || status === "expired") disposition = "archive_review";
    else if (missing.length > 0 || urlMismatch || urlCheck.title_match === false) disposition = "manual_field_review";
    return { id: entry.id, slug: entry.slug, title: entry.title, queue: item.queue, priority: item.priority, primary_level: primary?.level ?? item.primary_level, queue_primary_url: item.primary_url, store_primary_url: primary?.url ?? null, url_mismatch: urlMismatch, url_check: urlCheck, missing_fields: missing, duplicate_slugs: duplicateSlugs, deadline_state: status, disposition, reason_codes: reasons, formal_publish_blocked: true };
  });
  const dispositionCounts = Object.fromEntries([...new Set(results.map((item) => item.disposition))].map((key) => [key, results.filter((item) => item.disposition === key).length]));
  const queueCounts = Object.fromEntries([...new Set(results.map((item) => item.queue))].map((key) => [key, results.filter((item) => item.queue === key).length]));
  const audit = {
    schema_version: "ich-ds8-full-recheck-ledger.v1",
    stage: "DS8-R2",
    audited_at: new Date().toISOString(),
    evaluated_at: now.toISOString(),
    readonly: true,
    formal_store_write: false,
    formal_store_path: path.relative(process.cwd(), storePath),
    formal_store_before_sha256: crypto.createHash("sha256").update(storeRawBefore).digest("hex"),
    formal_store_after_sha256: crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex"),
    queue_input_total: queue.items.length,
    original_queue_input_total: queue.input_total,
    processed_count: results.length,
    queue_counts: queueCounts,
    disposition_counts: dispositionCounts,
    accessible_count: results.filter((item) => item.url_check.accessible).length,
    inaccessible_count: results.filter((item) => !item.url_check.accessible).length,
    duplicate_count: results.filter((item) => item.duplicate_slugs.length > 0).length,
    title_mismatch_count: results.filter((item) => item.url_check.title_match === false).length,
    formal_publish_blocked_count: results.filter((item) => item.formal_publish_blocked).length,
    gate: results.length === queue.items.length && results.every((item) => item.formal_publish_blocked) && auditHashEqual(storeRawBefore, storePath) ? "pass_with_followups" : "blocked",
    results,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  const dispositionLines = Object.entries(dispositionCounts).map(([key, count]) => `- ${key}: ${count}`).join("\n");
  const report = `# DS8 全量复核动作账本报告 V1.0\n\n- 阶段：**DS8-R2**\n- 队列输入：${queue.items.length} 条（原始任务书口径至少 107 条）\n- 已逐条处理：${results.length} 条\n- 主来源可访问：${audit.accessible_count} 条；不可访问：${audit.inaccessible_count} 条\n- 正式库写入：**false**\n- 正式库前后哈希一致：**${audit.formal_store_before_sha256 === audit.formal_store_after_sha256}**\n- 门禁：**${audit.gate}**\n\n## 处置分布\n\n${dispositionLines}\n\n## 说明\n\n本账本是只读健康与字段复核，不等同于人工确认，也不自动把任何记录晋级为正式机会。所有记录保持 \`formal_publish_blocked=true\`；下一步按 \`manual_field_review\`、\`archive_review\` 和 \`source_unavailable\` 队列进行人工处置。\n\n机器记录：[DS8-全量复核动作账本_V1.0.json](./DS8-全量复核动作账本_V1.0.json)。\n`;
  fs.writeFileSync(reportPath, report, "utf8");
  console.log(JSON.stringify({ stage: audit.stage, queue_input_total: audit.queue_input_total, processed_count: audit.processed_count, accessible_count: audit.accessible_count, inaccessible_count: audit.inaccessible_count, duplicate_count: audit.duplicate_count, disposition_counts: audit.disposition_counts, formal_store_write: false, formal_store_unchanged: audit.formal_store_before_sha256 === audit.formal_store_after_sha256, gate: audit.gate }, null, 2));
  if (audit.gate === "blocked") process.exitCode = 1;
}

function auditHashEqual(before: Buffer, filePath: string): boolean {
  return crypto.createHash("sha256").update(before).digest("hex") === crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
