import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const PUBLIC_WELFARE_RADAR_ID = "public_welfare_opportunities";
export const PUBLIC_WELFARE_RADAR_NAME = "企业福利商机雷达";
export const WELFARE_SOURCE_CODE = "OFF-SZ-004";
export const WELFARE_SOURCE_NAME = "光明区政府/群团工作部公告";
export const WELFARE_SOURCE_URL = "https://www.szgm.gov.cn/xxgk/xqgwhxxgkml/gzgg/";
const execFileAsync = promisify(execFile);

export type WelfareLifecycle = "current" | "historical";
export type WelfareOpportunityType = "OPEN_PROCUREMENT" | "PROCUREMENT_INTENT" | "SUPPLIER_RECRUITMENT" | "FRAMEWORK_AGREEMENT" | "CHANNEL_PARTNERSHIP";
export type WelfareVerificationState = "CANDIDATE" | "FIELD_VERIFIED" | "STATUS_VERIFIED" | "FULLY_VERIFIED";
export type WelfareFieldState = "verified" | "not_published" | "parse_failed" | "unknown";

export interface WelfareEvidenceField {
  field: "buyer" | "budget" | "deadline" | "status";
  state: WelfareFieldState;
  excerpt?: string;
}

export interface WelfareOpportunityRecord {
  id: string;
  title: string;
  sourceCode: string;
  sourceName: string;
  officialUrl: string;
  publishedAt: string;
  retrievedAt: string;
  rawSha256: string;
  dataMode: "recorded" | "live";
  opportunityType: WelfareOpportunityType;
  lifecycleStatus: WelfareLifecycle;
  currentStage: "OPEN" | "CORRECTED" | "CLOSED_PENDING_RESULT" | "AWARDED" | "CONTRACTED" | "TERMINATED" | "UNKNOWN";
  verificationState: WelfareVerificationState;
  buyer: string;
  region: string;
  budgetDisplay: string;
  deadline: string;
  deadlineDisplay: string;
  welfareScenes: string[];
  productScopes: string[];
  reason: string;
  nextAction: string;
  riskNote: string;
  evidenceFields: WelfareEvidenceField[];
}

export interface WelfareFeedOptions {
  status?: WelfareLifecycle | "all";
  type?: string;
  scene?: string;
  region?: string;
  deadlineWindow?: string;
  page?: number;
  pageSize?: number;
  now?: string | Date;
}

export interface WelfareFeed {
  items: WelfareOpportunityRecord[];
  stats: {
    totalCount: number;
    currentCount: number;
    historicalCount: number;
    filteredCount: number;
    verifiedCount: number;
    knownDeadlineCount: number;
    knownBudgetCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    lastUpdatedAt: string | null;
    typeFacets: Array<{ id: string; label: string; count: number }>;
    sceneFacets: Array<{ id: string; label: string; count: number }>;
    regionFacets: Array<{ id: string; label: string; count: number }>;
  };
  sources: Array<{ code: string; name: string; url: string; status: "active" }>;
}

const TYPE_LABELS: Record<string, string> = {
  OPEN_PROCUREMENT: "公开采购",
  PROCUREMENT_INTENT: "采购意向",
  SUPPLIER_RECRUITMENT: "供应商征集",
  FRAMEWORK_AGREEMENT: "框架协议",
  CHANNEL_PARTNERSHIP: "渠道合作",
};

function cleanText(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function stableId(url: string): string {
  return `welfare_${crypto.createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

function fieldState(fields: WelfareEvidenceField[], field: WelfareEvidenceField["field"]): WelfareFieldState {
  return fields.find((item) => item.field === field)?.state ?? "unknown";
}

function deadlineWindow(deadline: string, now: Date): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(deadline)) return "unknown";
  const days = Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86_400_000);
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  return "later";
}

function buildFacets(records: WelfareOpportunityRecord[], values: (record: WelfareOpportunityRecord) => string[], labels?: Record<string, string>) {
  const counts = new Map<string, number>();
  for (const record of records) for (const value of values(record)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries()).map(([id, count]) => ({ id, label: labels?.[id] ?? id, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function buildWelfareFeed(records: WelfareOpportunityRecord[], options: WelfareFeedOptions = {}): WelfareFeed {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const status = options.status ?? "current";
  const allRecords = records.map((record) => {
    if (record.lifecycleStatus === "current" && /^\d{4}-\d{2}-\d{2}/.test(record.deadline) && new Date(record.deadline).getTime() < now.getTime()) {
      return { ...record, lifecycleStatus: "historical" as const };
    }
    return record;
  });
  const currentCount = allRecords.filter((item) => item.lifecycleStatus === "current").length;
  const historicalCount = allRecords.length - currentCount;
  let filtered = allRecords.filter((item) => status === "all" || item.lifecycleStatus === status);
  if (options.type && options.type !== "all") filtered = filtered.filter((item) => item.opportunityType === options.type);
  if (options.scene && options.scene !== "all") filtered = filtered.filter((item) => item.welfareScenes.includes(options.scene!));
  if (options.region && options.region !== "all") filtered = filtered.filter((item) => item.region === options.region);
  if (options.deadlineWindow && options.deadlineWindow !== "all") filtered = filtered.filter((item) => deadlineWindow(item.deadline, now) === options.deadlineWindow);
  filtered.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999") || b.publishedAt.localeCompare(a.publishedAt));
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 24, 60));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.max(1, Math.min(options.page ?? 1, totalPages));
  const offset = (page - 1) * pageSize;
  return {
    items: filtered.slice(offset, offset + pageSize),
    stats: {
      totalCount: allRecords.length,
      currentCount,
      historicalCount,
      filteredCount: filtered.length,
      verifiedCount: allRecords.filter((item) => ["STATUS_VERIFIED", "FULLY_VERIFIED"].includes(item.verificationState)).length,
      knownDeadlineCount: allRecords.filter((item) => fieldState(item.evidenceFields, "deadline") === "verified").length,
      knownBudgetCount: allRecords.filter((item) => fieldState(item.evidenceFields, "budget") === "verified").length,
      page,
      pageSize,
      totalPages,
      lastUpdatedAt: allRecords.length > 0 ? allRecords.map((item) => item.retrievedAt).sort()[allRecords.length - 1] : null,
      typeFacets: buildFacets(allRecords, (item) => [item.opportunityType], TYPE_LABELS),
      sceneFacets: buildFacets(allRecords, (item) => item.welfareScenes),
      regionFacets: buildFacets(allRecords, (item) => [item.region]),
    },
    sources: [{ code: WELFARE_SOURCE_CODE, name: WELFARE_SOURCE_NAME, url: WELFARE_SOURCE_URL, status: "active" }],
  };
}

export function loadRecordedWelfareOpportunities(): WelfareOpportunityRecord[] {
  const file = path.resolve(process.cwd(), "src/demo/welfare-opportunities.recorded.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as WelfareOpportunityRecord[];
}

export function loadPersistedWelfareOpportunities(filePath = process.env.CHANCEPING_WELFARE_STORE_PATH ?? "data/welfare-opportunities.json"): WelfareOpportunityRecord[] {
  const absolute = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolute)) return [];
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8")) as { records?: WelfareOpportunityRecord[] } | WelfareOpportunityRecord[];
  return Array.isArray(parsed) ? parsed : parsed.records ?? [];
}

export function savePersistedWelfareOpportunities(records: WelfareOpportunityRecord[], filePath = process.env.CHANCEPING_WELFARE_STORE_PATH ?? "data/welfare-opportunities.json"): void {
  const absolute = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ version: "1.0", updatedAt: new Date().toISOString(), records }, null, 2));
  fs.renameSync(temporary, absolute);
}

export function mergeWelfareRecords(existing: WelfareOpportunityRecord[], incoming: WelfareOpportunityRecord[]): WelfareOpportunityRecord[] {
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const record of incoming) byId.set(record.id, { ...byId.get(record.id), ...record });
  return Array.from(byId.values());
}

export function extractWelfareIndexLinks(html: string): Array<{ title: string; url: string; publishedAt: string }> {
  const matches: Array<{ title: string; url: string; publishedAt: string }> = [];
  const pattern = /<li>[\s\S]*?<span>(\d{4}-\d{2}-\d{2})<\/span>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const title = cleanText(match[3]);
    const url = normalizeUrl(match[2], WELFARE_SOURCE_URL);
    const hasWelfareContext = /(总工会|工会|职工|慰问|员工福利|消费帮扶|送清凉)/.test(title);
    const hasOpportunityAction = /(采购|遴选|供应商|征集|项目)/.test(title);
    if (!url || !hasWelfareContext || !hasOpportunityAction) continue;
    if (/(结果|中标|成交|终止|废标)/.test(title)) continue;
    matches.push({ title, url, publishedAt: match[1] });
  }
  return matches;
}

function extractMeta(html: string, name: string): string {
  const match = html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, "i"));
  return cleanText(match?.[1] ?? "");
}

function excerpt(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match?.[0]?.slice(0, 180);
}

export function parseWelfareDetail(input: { html: string; url: string; publishedAtHint?: string; retrievedAt?: string }): WelfareOpportunityRecord | null {
  const title = extractMeta(input.html, "ArticleTitle") || cleanText(input.html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  if (!title || !/(总工会|工会|职工|慰问|员工福利|消费帮扶|送清凉)/.test(title) || !/(采购|遴选|供应商|征集|项目)/.test(title)) return null;
  const text = cleanText(input.html);
  const buyerExcerpt = excerpt(text, /采购人名称[：:]?\s*[^。；]*?(?=\s*(?:联系地址|联系人|联系电话|地址)[：:]|[。；]|$)/);
  const deadlineExcerpt = excerpt(text, /(?:投标|报名|响应|递交)[^。；]{0,24}(?:截至|截止)[^。；]{0,40}/);
  const budgetExcerpt = excerpt(text, /(?:预算金额|采购预算|最高限价)[：:]?\s*(?:人民币)?\s*[\d,.]+\s*(?:万元|元)/);
  const deadlineMatch = deadlineExcerpt?.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})时(?:(\d{1,2})分)?)?/);
  const publishedAt = input.publishedAtHint || extractMeta(input.html, "PubDate") || "";
  const year = Number(deadlineMatch?.[1] || publishedAt.slice(0, 4) || new Date().getFullYear());
  const deadline = deadlineMatch ? `${year}-${String(deadlineMatch[2]).padStart(2, "0")}-${String(deadlineMatch[3]).padStart(2, "0")}T${String(deadlineMatch[4] ?? "23").padStart(2, "0")}:${String(deadlineMatch[5] ?? "59").padStart(2, "0")}:00+08:00` : "";
  const isClosed = /(结果公告|中标公告|成交公告|终止公告|废标公告)/.test(title);
  const isCorrection = /(变更公告|更正公告)/.test(title);
  const evidenceFields: WelfareEvidenceField[] = [
    { field: "buyer", state: buyerExcerpt ? "verified" : "unknown", excerpt: buyerExcerpt },
    { field: "budget", state: budgetExcerpt ? "verified" : "not_published", excerpt: budgetExcerpt },
    { field: "deadline", state: deadlineExcerpt && deadline ? "verified" : "unknown", excerpt: deadlineExcerpt },
    { field: "status", state: "verified", excerpt: isClosed ? "标题显示项目已结束" : isCorrection ? "标题显示采购更正/变更" : "标题显示公开采购或征集" },
  ];
  const rawSha256 = crypto.createHash("sha256").update(input.html).digest("hex");
  return {
    id: stableId(input.url),
    title,
    sourceCode: WELFARE_SOURCE_CODE,
    sourceName: WELFARE_SOURCE_NAME,
    officialUrl: input.url,
    publishedAt: publishedAt ? `${publishedAt.slice(0, 10)}T00:00:00+08:00` : input.retrievedAt ?? new Date().toISOString(),
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    rawSha256,
    dataMode: "live",
    opportunityType: "OPEN_PROCUREMENT",
    lifecycleStatus: isClosed ? "historical" : "current",
    currentStage: isClosed ? "CLOSED_PENDING_RESULT" : isCorrection ? "CORRECTED" : "OPEN",
    verificationState: buyerExcerpt && deadlineExcerpt ? "STATUS_VERIFIED" : "FIELD_VERIFIED",
    buyer: buyerExcerpt?.replace(/^采购人名称[：:]?\s*/, "") ?? "待核验",
    region: "深圳光明",
    budgetDisplay: budgetExcerpt?.replace(/^(?:预算金额|采购预算|最高限价)[：:]?\s*/, "") ?? "未公开",
    deadline,
    deadlineDisplay: deadlineExcerpt ?? "待核验",
    welfareScenes: [/(消费帮扶)/.test(title) ? "消费帮扶" : /(慰问)/.test(title) ? "职工慰问" : "企业福利采购"],
    productScopes: [/(农副产品|食品|慰问物资)/.test(text) ? "食品生鲜/慰问物资" : "综合福利"],
    reason: "来自光明区政府官方公告栏目，涉及企业福利、职工慰问或消费帮扶采购。",
    nextAction: "打开官方原文，核对采购文件、资格要求、附件和递交方式。",
    riskNote: "公开页面仅整理官方公告；预算、截止和资格要求以官方原文及后续更正为准。",
    evidenceFields,
  };
}

export async function collectOffSz004(options: { fetchHtml?: (url: string) => Promise<string>; evidenceDir?: string; maxDetails?: number; now?: Date } = {}) {
  const fetchHtml = options.fetchHtml ?? defaultWelfareFetchHtml;
  const now = options.now ?? new Date();
  const retrievedAt = now.toISOString();
  const evidenceDir = path.resolve(process.cwd(), options.evidenceDir ?? "data/welfare-evidence/OFF-SZ-004");
  const indexHtml = await fetchHtml(WELFARE_SOURCE_URL);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, `index-${crypto.createHash("sha256").update(indexHtml).digest("hex").slice(0, 16)}.html`), indexHtml);
  const links = extractWelfareIndexLinks(indexHtml).slice(0, Math.max(1, Math.min(options.maxDetails ?? 12, 30)));
  const records: WelfareOpportunityRecord[] = [];
  const errors: Array<{ url: string; error: string }> = [];
  for (const link of links) {
    try {
      const html = await fetchHtml(link.url);
      const sha = crypto.createHash("sha256").update(html).digest("hex");
      fs.writeFileSync(path.join(evidenceDir, `${sha}.html`), html);
      const record = parseWelfareDetail({ html, url: link.url, publishedAtHint: link.publishedAt, retrievedAt });
      if (record) records.push(record);
    } catch (error) {
      errors.push({ url: link.url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const existing = loadPersistedWelfareOpportunities().filter((record) =>
    /(总工会|工会|职工|慰问|员工福利|消费帮扶|送清凉)/.test(record.title)
    && /(采购|遴选|供应商|征集|项目)/.test(record.title),
  );
  const merged = mergeWelfareRecords(existing, records);
  savePersistedWelfareOpportunities(merged);
  return { sourceCode: WELFARE_SOURCE_CODE, retrievedAt, discoveredCount: links.length, publishedCount: records.length, totalCount: merged.length, errors };
}

async function defaultWelfareFetchHtml(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.szgm.gov.cn") throw new Error("WELFARE_SOURCE_NOT_ALLOWED");
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": "ChancePing-WelfareRadar/0.1 (+https://fuli.chanceping.com)", accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } catch (fetchError) {
    try {
      const { stdout } = await execFileAsync("curl", ["-L", "--fail", "--silent", "--show-error", "--max-time", "20", "-A", "ChancePing-WelfareRadar/0.1 (+https://fuli.chanceping.com)", url], { maxBuffer: 8 * 1024 * 1024 });
      return stdout;
    } catch (curlError) {
      const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      const curlMessage = curlError instanceof Error ? curlError.message : String(curlError);
      throw new Error(`OFF-SZ-004 fetch failed: node=${fetchMessage}; curl=${curlMessage}`);
    }
  }
}

export function renderWelfareMarkdown(records: WelfareOpportunityRecord[], generatedAt = new Date().toISOString()): string {
  const current = records.filter((item) => item.lifecycleStatus === "current");
  const lines = ["# 企业福利商机雷达日报", "", `生成时间：${generatedAt}`, "", `当前有效商机：${current.length} 条`, ""];
  for (const item of current) {
    lines.push(`## ${item.title}`, "", `- 采购/发布单位：${item.buyer}`, `- 地区：${item.region}`, `- 预算：${item.budgetDisplay}`, `- 截止：${item.deadlineDisplay}`, `- 官方原文：${item.officialUrl}`, `- 下一步：${item.nextAction}`, "");
  }
  return lines.join("\n");
}
