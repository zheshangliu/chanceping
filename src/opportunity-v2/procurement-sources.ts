import { extractAnchors, extractDeadlineEvidence, htmlToText, identityHash, parseDateText, type ParsedAggregationItem, type ProcurementMetadata } from "../ich/aggregation/adapters/common";
import { parseProcurementPayload, isCurrentProcurement, isCraftRelevantProcurement } from "./procurement";
import type { OpportunityV2FetchOptions } from "./types";

/**
 * Small, source-aware procurement parsing boundary.
 *
 * The existing generic OCDS/CSV parser remains the fallback for the two
 * already-seeded procurement feeds.  These adapters only add the first-phase
 * sources whose public shapes are materially different; they do not change
 * the OpportunityV2 pipeline or public UI contract.
 */

export type ProcurementAdapterFormat = "DEDICATED_HTML" | "OCDS_JSON" | "OCDS_JSONL" | "TED_JSON" | "PUBLIC_HTML";

const SOURCE_LISTING_URLS: Record<string, string> = {
  "proc-cn-ccgp": "https://www.ccgp.gov.cn/cggg/dfgg/index.htm",
  "proc-cn-cib": "https://cg.cib.com.cn/cms/default/webfile/index.html",
  "proc-cn-ggzy": "https://data.ggzy.gov.cn/",
  "proc-global-ocp": "https://data.open-contracting.org/en/search/",
  "proc-eu-ted": "https://api.ted.europa.eu/v3/notices/search",
  "proc-us-sam": "https://api.sam.gov/opportunities/v2/search",
  "proc-kr-koneps": "https://www.data.go.kr/data/15129394/openapi.do",
  "proc-un-ungm": "https://www.ungm.org/Public/Notice",
  "proc-wb": "https://datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00979&resourceId=RS00909&type=json",
};

export const TED_PROCUREMENT_QUERY = "PD>=today(-7) AND PD<=today(0) AND FT~cultural";

/**
 * The acquisition boundary uses this small source-specific plan while the
 * parser remains shared. Detail enrichment deliberately calls the same
 * fetcher without a plan, so detail URLs stay ordinary bounded GETs.
 */
export function procurementFetchOptions(sourceId: string): OpportunityV2FetchOptions {
  if (sourceId === "proc-eu-ted") {
    return {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        query: TED_PROCUREMENT_QUERY,
        fields: ["ND", "TI", "PD", "DT", "FT", "DS", "CY"],
        limit: 10,
        paginationMode: "PAGE_NUMBER",
        page: 1,
      }),
    };
  }
  if (sourceId === "proc-global-ocp") return { method: "GET", headers: { accept: "application/gzip" }, decompress: "gzip" };
  return { method: "GET" };
}

export function worldBankRequestUrls(sourceUrl: string): { probe: string; latest: (count: number) => string } {
  const base = new URL(sourceUrl);
  base.searchParams.delete("top");
  base.searchParams.delete("skip");
  const probe = new URL(base);
  probe.searchParams.set("top", "1");
  return { probe: probe.toString(), latest: (count: number) => {
    const latest = new URL(base);
    latest.searchParams.set("top", "1000");
    latest.searchParams.set("skip", String(Math.max(0, count - 1000)));
    return latest.toString();
  } };
}

export function parseWorldBankCount(payload: string): number {
  const root = JSON.parse(payload) as { count?: unknown };
  const count = Number(root.count);
  if (!Number.isInteger(count) || count < 0) throw new Error("World Bank response did not provide a bounded count");
  return count;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/gu, " ").trim();
  if (value == null) return "";
  return String(value).replace(/\s+/gu, " ").trim();
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
}

function metaContent(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = html.match(new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "iu"))
    ?? html.match(new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "iu"));
  return match ? htmlToText(match[1]) : "";
}

function pageTitle(html: string): string {
  return firstString(
    metaContent(html, "ArticleTitle"),
    html.match(/<h1\b[^>]*class=["'][^"']*c-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/iu)?.[1],
    html.match(/<[^>]+class=["'][^"']*c-title[^"']*["'][^>]*>[\s\S]*?<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1],
    html.match(/<h2\b[^>]*class=["'][^"']*tc[^"']*["'][^>]*>([\s\S]*?)<\/h2>/iu)?.[1],
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1],
  ).replace(/\s*(?:采购公告|供应商征集公告)\s*$/u, "").trim();
}

function pageText(html: string): string {
  return htmlToText(html).replace(/\s+/gu, " ").trim();
}

const CCGP_LABELS = [
  "采购项目名称", "品目", "采购单位", "采购人", "行政区域", "公告时间", "获取采购文件时间",
  "响应文件递交地点", "响应文件开启时间", "响应文件开启地点", "预算金额", "联系人及联系方式",
  "项目编号", "项目名称", "采购方式", "采购需求", "活动时间", "活动日期", "响应文件提交", "响应文件接收截止时间", "截止时间",
];

function labeledText(text: string, labels: string[], boundaryLabels = CCGP_LABELS): string {
  const label = labels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|");
  const boundary = boundaryLabels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:${label})\\s*[:：]?\\s*([\\s\\S]{1,180}?)(?=\\s*(?:${boundary})\\s*[:：]?|$)`, "iu"));
  return match?.[1]?.replace(/[：:]$/u, "").trim() ?? "";
}

function parseMoney(text: string): { amount: number | null; currency: string | null } {
  const match = text.match(/(?:预算金额|预算|estimated value|value)[^\d£$€¥￥]{0,40}(?:[£$€¥￥]\s*)?([\d,.]+)\s*(万元|万|元|人民币|GBP|USD|EUR|CNY|CAD)?/iu);
  if (!match) return { amount: null, currency: null };
  const base = Number(match[1].replace(/,/gu, ""));
  if (!Number.isFinite(base)) return { amount: null, currency: null };
  const unit = match[2]?.toUpperCase() ?? "";
  return { amount: /万元|万/u.test(unit) ? base * 10000 : base, currency: /元|人民币/u.test(unit) ? "CNY" : unit || null };
}

function dateOnly(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthNumber(value: string): number | null {
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.slice(0, 3).toLowerCase());
  return month < 0 ? null : month + 1;
}

/** Procurement dates keep date-only values date-only; clock values are normalized to UTC. */
function parseProcurementDateText(value: string | null, now = new Date(), context = ""): string | null {
  if (!value?.trim()) return null;
  const raw = value.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/gu, "-").replace(/年/g, "-").replace(/月/g, "-").replace(/日/g, "").replace(/[./]/g, "-").replace(/\s+/gu, " ").trim();
  const clock = raw.match(/(?:T|\s+)(\d{1,2})[:：](\d{2})(?::\d{2})?/u) ?? raw.match(/\s(\d{1,2})\s*时(?:\s*(\d{1,2})\s*分?)?/u);
  const timezone = raw.match(/(?:Z|[+-]\d{2}:?\d{2})$/u)?.[0] ?? null;
  const iso = raw.match(/(?<!\d)(20\d{2})-(\d{1,2})-(\d{1,2})/u);
  let year: number | null = iso ? Number(iso[1]) : null;
  let month: number | null = iso ? Number(iso[2]) : null;
  let day: number | null = iso ? Number(iso[3]) : null;
  const worldBank = raw.match(/(?<!\d)(\d{1,2})-([A-Za-z]{3,9})-(20\d{2})(?!\d)/u);
  if (!iso && worldBank) {
    day = Number(worldBank[1]);
    month = monthNumber(worldBank[2]);
    year = Number(worldBank[3]);
  }
  const chinese = raw.match(/(?<!\d)(20\d{2})-(\d{1,2})-(\d{1,2})(?!\d)/u);
  if (!year) {
    const monthDay = raw.match(/(?<!\d)(\d{1,2})-(\d{1,2})(?!\d)/u);
    year = Number(value.match(/20\d{2}/u)?.[0] ?? context.match(/20\d{2}/u)?.[0] ?? now.getFullYear());
    month = chinese ? Number(chinese[2]) : monthDay ? Number(monthDay[1]) : null;
    day = chinese ? Number(chinese[3]) : monthDay ? Number(monthDay[2]) : null;
  }
  if (!year || !month || !day) {
    const fallback = parseDateText(value, now, context);
    return fallback ? (clock || /T\d{1,2}:/u.test(value) ? fallback : fallback.slice(0, 10)) : null;
  }
  const calendarDay = dateOnly(year, month, day);
  if (!calendarDay) return null;
  if (!clock) return calendarDay;
  const hour = Number(clock[1]);
  const minute = Number(clock[2] ?? "0");
  if (hour > 23 || minute > 59) return null;
  if (timezone) {
    const parsed = new Date(`${calendarDay}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${timezone === "Z" ? "Z" : timezone}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - 8 * 60 * 60 * 1000).toISOString();
}

function dateFromEvidence(text: string, context: string, now = new Date()): { deadline: string | null; raw: string | null; kind: ParsedAggregationItem["deadline_kind"] } {
  const evidence = extractDeadlineEvidence(text, now, context);
  const primary = evidence
    .filter((candidate) => candidate.deadline_at || candidate.text)
    .sort((left, right) => Number(/(?:\d{1,2}[:：]\d{2}|\d{1,2}\s*时)/u.test(right.text)) - Number(/(?:\d{1,2}[:：]\d{2}|\d{1,2}\s*时)/u.test(left.text)) || left.priority - right.priority || left.marker_index - right.marker_index)[0] ?? evidence[0];
  if (!primary) return { deadline: null, raw: null, kind: null };
  const markerTail = text.slice(primary.marker_index);
  const exact = markerTail.match(/(?<!\d)((?:20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?|\d{1,2}[月./-]\d{1,2}日?|\d{1,2}-[A-Za-z]{3,9}-20\d{2})(?:\s+\d{1,2}(?::|：)\d{2}(?::\d{2})?|\s+\d{1,2}\s*时(?:\s*\d{1,2}\s*分?)?)?)/u)?.[1] ?? null;
  const selectedText = exact && /(?:\d{1,2}[:：]\d{2}|\d{1,2}\s*时)/u.test(exact) ? exact : primary.text;
  const raw = exact && selectedText === exact ? `${text.slice(primary.marker_index, primary.marker_index + text.slice(primary.marker_index).indexOf(exact) + exact.length)}`.trim() : primary.raw_text ?? primary.text;
  return { deadline: parseProcurementDateText(selectedText ?? null, now, `${context} ${text}`), raw, kind: primary.kind ?? null };
}

function cibDeadlineFromEvidence(text: string, context: string, now = new Date()): { deadline: string | null; raw: string | null; kind: ParsedAggregationItem["deadline_kind"] } {
  const preferred = text.match(/(?:征集|寻源)(?:截止时间|截止日期)\s*[:：]?\s*((?:20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?|\d{1,2}[月./-]\d{1,2}日?)(?:\s*\d{1,2}[:：]\d{2})?)/u);
  if (preferred) {
    const deadline = parseProcurementDateText(preferred[1], now, text);
    if (deadline) return { deadline, raw: preferred[0], kind: "deadline" };
  }
  return dateFromEvidence(text, context, now);
}

function procurementStage(text: string, deadline: string | null, now = new Date()): ProcurementMetadata["stage"] {
  if (/(?:项目|采购|征集|招标|合同|公告)[^。；;]{0,30}(?:取消|终止|撤销)|(?:取消|终止|撤销)[^。；;]{0,20}(?:项目|采购|征集|招标|合同|公告)|\b(?:cancel(?:led|ed)?|terminate(?:d)?|withdrawn)\b/iu.test(text)) return "cancelled";
  const hasAwardSignal = /(?:中标|成交|结果公告|award(?:ed)?|contract(?:ed|\s+(?:signed|completed|award)))/iu.test(text) && !/contract\s+notice/iu.test(text);
  const hypotheticalAward = /(?:若|如|如果|if)\s*(?:中标|成交|award)/iu.test(text);
  if (hasAwardSignal && !hypotheticalAward) return "awarded";
  if (deadline && procurementDateIsPast(deadline, now)) return "closed";
  if (/(?:预资格|资格预审|pre[- ]?qualification)/iu.test(text)) return "prequalification";
  if (/(?:采购意向|market research|市场调研|prior information|计划)/iu.test(text)) return "planned";
  return "open";
}

export function procurementDateIsPast(value: string, now: Date): boolean {
  const day = value.match(/^(20\d{2}-\d{2}-\d{2})$/u)?.[1];
  if (day) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const today = `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
    return day < today;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp < now.getTime();
}

function procurementItem(args: {
  sourceId: string;
  sourceUrl: string;
  detailUrl: string;
  title: string;
  text: string;
  publishedAt?: string | null;
  deadline?: string | null;
  deadlineRaw?: string | null;
  deadlineKind?: ParsedAggregationItem["deadline_kind"];
  direction: ProcurementMetadata["direction"];
  stage: ProcurementMetadata["stage"];
  noticeType?: ProcurementMetadata["notice_type"];
  projectId?: string | null;
  buyer?: string | null;
  method?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  budget?: { amount: number | null; currency: string | null };
  region: "CN" | "GLOBAL";
}): ParsedAggregationItem {
  const projectId = args.projectId || identityHash(args.sourceId, args.detailUrl, args.title);
  const deadline = args.deadline ?? null;
  const metadata: ProcurementMetadata = {
    direction: args.direction,
    stage: args.stage,
    notice_type: args.noticeType ?? "tender",
    project_id: projectId,
    buyer_name: args.buyer || null,
    procurement_method: args.method || null,
    country_code: args.countryCode || null,
    country_name: args.countryName || null,
    budget_amount: args.budget?.amount ?? null,
    budget_currency: args.budget?.currency ?? null,
    milestones: [
      ...(args.publishedAt ? [{ kind: "publication" as const, date: args.publishedAt }] : []),
      ...(deadline ? [{ kind: "submission" as const, date: deadline, text: args.deadlineRaw ?? "submission deadline" }] : []),
    ],
    source_record_id: projectId,
  };
  return {
    source_item_id: `${args.sourceId}:${projectId}`,
    title: args.title,
    source_category: "procurement_project",
    source_status: args.stage,
    detail_url: args.detailUrl,
    source_url: args.sourceUrl,
    published_at: args.publishedAt ?? null,
    deadline_text: deadline ? args.deadlineRaw ?? deadline.slice(0, 10) : null,
    deadline_at: deadline,
    deadline_source_url: deadline ? args.detailUrl : null,
    deadline_raw_text: args.deadlineRaw ?? null,
    deadline_checked_at: deadline ? new Date().toISOString() : null,
    deadline_resolution: deadline ? "found_detail" : "source_has_no_date",
    deadline_kind: args.deadlineKind ?? "deadline",
    organizer: args.buyer ?? null,
    application_url: args.detailUrl,
    raw_text: args.text.slice(0, 12000),
    participation_scope: args.region === "GLOBAL" ? "global" : "nationwide",
    procurement: metadata,
  };
}

function parseCcgPDetail(html: string, sourceUrl: string, detailUrl = sourceUrl, now = new Date()): ParsedAggregationItem | null {
  const text = pageText(html);
  const title = pageTitle(html);
  if (!title) return null;
  const deadlineEvidence = dateFromEvidence(text, title, now);
  const published = firstString(metaContent(html, "PubDate"), text.match(/公告时间\s*[:：]?\s*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}(?:日)?(?:\s+\d{1,2}[:：]\d{2})?)/u)?.[1]);
  const publishedAt = parseProcurementDateText(published, now, text);
  const buyer = labeledText(text, ["采购单位", "采购人"]);
  const projectId = labeledText(text, ["项目编号"]);
  const method = labeledText(text, ["采购方式"]);
  const budget = parseMoney(text);
  return procurementItem({ sourceId: "proc-cn-ccgp", sourceUrl, detailUrl, title, text, publishedAt, deadline: deadlineEvidence.deadline, deadlineRaw: deadlineEvidence.raw, deadlineKind: deadlineEvidence.kind, direction: "buyer_demand", stage: procurementStage(text, deadlineEvidence.deadline, now), noticeType: /磋商/u.test(text) ? "tender" : "tender", projectId: projectId || null, buyer: buyer || null, method: method || null, countryCode: "CN", countryName: "China", budget: { amount: budget.amount, currency: budget.currency ?? "CNY" }, region: "CN" });
}

function parseCibDetail(html: string, sourceUrl: string, detailUrl = sourceUrl, now = new Date()): ParsedAggregationItem | null {
  const text = pageText(html);
  const title = pageTitle(html);
  if (!title) return null;
  return parseCibContent(title, text, sourceUrl, detailUrl, now);
}

function parseCibContent(title: string, text: string, sourceUrl: string, detailUrl: string, now = new Date()): ParsedAggregationItem | null {
  if (!title || !detailUrl) return null;
  const deadlineEvidence = cibDeadlineFromEvidence(text, title, now);
  const published = firstString(text.match(/发布日期\s*[:：]?\s*(20\d{2}[-./]\d{1,2}[-./]\d{1,2})/u)?.[1]);
  const publishedAt = parseProcurementDateText(published, now, text);
  const projectId = detailUrl.match(/\/([^/]+)\.html(?:$|\?)/iu)?.[1] ?? null;
  const sourcingOpen = /(?:供应商征集|供应商报名|寻源|征集报名)/iu.test(text)
    && (!deadlineEvidence.deadline || new Date(deadlineEvidence.deadline).getTime() >= now.getTime());
  const stage = sourcingOpen ? "open" : procurementStage(text, deadlineEvidence.deadline, now);
  return procurementItem({ sourceId: "proc-cn-cib", sourceUrl, detailUrl, title, text, publishedAt, deadline: deadlineEvidence.deadline, deadlineRaw: deadlineEvidence.raw, deadlineKind: deadlineEvidence.kind, direction: "supplier_application", stage, noticeType: "tender", projectId, buyer: labeledText(text, ["采购单位", "采购人"]) || null, method: "supplier sourcing", countryCode: "CN", countryName: "China", budget: parseMoney(text), region: "CN" });
}

function parseCibApiPayload(payload: string, sourceUrl: string, now = new Date()): ParsedAggregationItem[] {
  try {
    const root = JSON.parse(payload) as { res?: { rows?: Array<Record<string, unknown>> } };
    const rows = Array.isArray(root.res?.rows) ? root.res.rows : [];
    return rows.flatMap((row) => {
      const title = asText(row.title);
      const rawBody = asText(row.text);
      const detailValue = firstString(row.url, row.detailUrl, row.link);
      if (!title || !detailValue) return [];
      const detailUrl = new URL(detailValue, sourceUrl).toString();
      const item = parseCibContent(title, pageText(rawBody), sourceUrl, detailUrl, now);
      return item ? [item] : [];
    });
  } catch {
    return [];
  }
}

function parseHtmlListing(sourceId: string, html: string, sourceUrl: string): ParsedAggregationItem[] {
  const anchors = extractAnchors(html, sourceUrl);
  const allowed = sourceId === "proc-cn-ccgp" ? /\/cggg\//iu : sourceId === "proc-cn-cib" ? /\/gyszj\/\d{8}\/[^/]+\.html(?:$|\?)/iu : /(?:采购|招标|tender|notice|公告)/iu;
  const seen = new Set<string>();
  return anchors.flatMap((anchor) => {
    if (!allowed.test(anchor.href) || seen.has(anchor.href)) return [];
    seen.add(anchor.href);
    const text = `${anchor.text} ${anchor.href}`;
    const stage = procurementStage(text, null);
    const direction: ProcurementMetadata["direction"] = sourceId === "proc-cn-cib" ? "supplier_application" : "buyer_demand";
    return [procurementItem({ sourceId, sourceUrl, detailUrl: anchor.href, title: anchor.text, text, direction, stage, region: sourceId === "proc-cn-cib" || sourceId === "proc-cn-ccgp" ? "CN" : "GLOBAL" })];
  });
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringValue).find(Boolean) ?? "";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstString(record.eng, record.en, record.english, record.zh, record.zho, record.fra, ...Object.values(record));
  }
  return "";
}

const COUNTRY_NAMES: Record<string, string> = {
  austria: "AT", france: "FR", "united kingdom": "GB", uk: "GB", wales: "GB", england: "GB", scotland: "GB",
  germany: "DE", italy: "IT", spain: "ES", canada: "CA", "united states": "US", korea: "KR", "south korea": "KR",
  china: "CN", ghana: "GH", vietnam: "VN", philippines: "PH",
  aut: "AT", fra: "FR", gbr: "GB", deu: "DE", ita: "IT", esp: "ES", can: "CA", usa: "US", kor: "KR", chn: "CN", gha: "GH",
};

function normalizeCountryCode(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const code = text.match(/\b([A-Z]{2})\b/u)?.[1];
  if (code) return code;
  return COUNTRY_NAMES[text.toLowerCase()] ?? null;
}

function countryFromOcds(raw: Record<string, unknown>, sourceId: string, sourceUrl: string): { code: string | null; name: string | null } {
  const buyer = raw.buyer && typeof raw.buyer === "object" ? raw.buyer as Record<string, unknown> : {};
  const address = buyer.address && typeof buyer.address === "object" ? buyer.address as Record<string, unknown> : {};
  const name = firstString(raw.country_name, raw.countryName, raw.country, raw.country_code, raw.countryCode, address.country, address.countryName);
  const code = normalizeCountryCode(firstString(raw.country_code, raw.countryCode, address.countryCode, address.country, raw.country_name, raw.countryName, raw.country));
  if (code) return { code, name: name || code };
  if (sourceId === "proc-global-ocp" && /publication\/119|sell2wales|wales/iu.test(`${sourceUrl} ${JSON.stringify(raw)}`)) return { code: "GB", name: "United Kingdom" };
  return { code: null, name: name || null };
}

function parseOcdsRecord(raw: Record<string, unknown>, sourceId: string, sourceUrl: string, region: "CN" | "GLOBAL", now = new Date()): ParsedAggregationItem | null {
  const tender = raw.tender && typeof raw.tender === "object" ? raw.tender as Record<string, unknown> : raw;
  const buyer = raw.buyer && typeof raw.buyer === "object" ? raw.buyer as Record<string, unknown> : {};
  const title = firstString(tender.title, raw.title, raw.bidNtceNm, raw.title_eng, raw["title-titre-eng"], raw.description);
  if (!title) return null;
  const description = firstString(tender.description, raw.description, raw.summary);
  const text = `${title} ${description}`.replace(/\s+/gu, " ").trim();
  const tenderPeriod = tender.tenderPeriod && typeof tender.tenderPeriod === "object" ? tender.tenderPeriod as Record<string, unknown> : {};
  const deadline = parseProcurementDateText(firstString(tenderPeriod.endDate, raw.tenderClosingDate, raw.deadline, raw.responseDeadLine, raw.bidClseDt), now, text);
  const projectId = firstString(raw.ocid, raw.id, raw.project_id, raw.noticeId, raw.solicitationNumber, raw.bidNtceNo) || null;
  const documents = Array.isArray(tender.documents) ? tender.documents : Array.isArray(raw.documents) ? raw.documents : [];
  const official = documents.map((value) => value && typeof value === "object" ? stringValue((value as Record<string, unknown>).url) : "").find((value) => /^https?:/iu.test(value)) ?? "";
  const embeddedOfficial = (text.match(/https?:\/\/(?:www\.)?sell2wales\.gov\.wales\/[^\s)]+/iu)?.[0] ?? "").replace(/[.,;:]+$/u, "");
  const canonicalLink = Array.isArray(raw.links)
    ? raw.links.map((value) => value && typeof value === "object" ? firstString((value as Record<string, unknown>).href, (value as Record<string, unknown>).url) : "").find((value) => /^https?:/iu.test(value)) ?? ""
    : "";
  const detailUrl = official || embeddedOfficial || canonicalLink || firstString(raw.url, raw.publication_url, raw.uiLink, raw.bidNtceUrl, sourceId === "proc-us-sam" && projectId ? `https://sam.gov/opp/${projectId}/view` : "", sourceUrl);
  const status = firstString(tender.status, raw.status);
  const hasAwardOrContract = (Array.isArray(raw.awards) && raw.awards.length > 0) || (Array.isArray(raw.contracts) && raw.contracts.length > 0);
  const stage = hasAwardOrContract ? "awarded" : procurementStage(`${status} ${text}`, deadline, now);
  const country = countryFromOcds(raw, sourceId, sourceUrl);
  return procurementItem({ sourceId, sourceUrl, detailUrl, title, text, publishedAt: parseProcurementDateText(firstString(raw.date, raw.datePublished, raw.publishedDate, raw.postedDate, raw.bidNtceDt), now, text), deadline, deadlineRaw: deadline ? `tender deadline ${deadline.slice(0, 10)}` : null, direction: "buyer_demand", stage, noticeType: stage === "awarded" ? "award" : "tender", projectId, buyer: firstString(stringValue(buyer.name), raw.fullParentPathName, raw.department, raw.dminsttNm), method: stringValue(tender.procurementMethod ?? raw.type), countryCode: country.code, countryName: country.name, budget: parseMoney(text), region });
}

function parseOcdsText(text: string, sourceId: string, sourceUrl: string, region: "CN" | "GLOBAL", now = new Date()): ParsedAggregationItem[] {
  const records: Record<string, unknown>[] = [];
  try {
    const root = JSON.parse(text) as Record<string, unknown>;
    if (Array.isArray(root.releases)) records.push(...root.releases.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object")));
    else if (Array.isArray(root.records)) records.push(...root.records.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object")));
    else if (Array.isArray(root.notices)) records.push(...root.notices.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object")));
    else if (Array.isArray(root.opportunitiesData)) records.push(...root.opportunitiesData.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object")));
    else if (Array.isArray(root.data)) records.push(...root.data.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object")));
    else if (root.ocid || root.title || root.bidNtceNm || root.noticeId) records.push(root);
  } catch {
    for (const line of text.split(/\r?\n/gu).map((value) => value.trim()).filter(Boolean)) {
      try { const value = JSON.parse(line); if (value && typeof value === "object") records.push(value as Record<string, unknown>); } catch { /* not JSONL */ }
    }
  }
  const unique = new Map<string, ParsedAggregationItem>();
  for (const record of records) {
    const item = parseOcdsRecord(record, sourceId, sourceUrl, region, now);
    if (item) unique.set(item.source_item_id, item);
  }
  return [...unique.values()];
}

function parseTedNotice(raw: Record<string, unknown>, sourceUrl: string, now = new Date()): ParsedAggregationItem | null {
  const title = stringValue(raw.TI ?? raw.title ?? raw.noticeTitle);
  if (!title) return null;
  const id = firstString(raw.ND, raw.noticeId, raw.id) || identityHash("proc-eu-ted", title);
  const deadlineValue = Array.isArray(raw.DT) ? raw.DT[0] : firstString(raw.DT, raw.deadline, raw.responseDeadline);
  const published = firstString(raw.PD, raw.publicationDate, raw.publishedDate);
  const deadline = parseProcurementDateText(deadlineValue, now, title);
  const publishedAt = parseProcurementDateText(published, now, title);
  const text = `${title} ${stringValue(raw.DS ?? raw.description ?? "")}`;
  const country = stringValue(raw.CY ?? raw.country ?? "");
  const countryCode = normalizeCountryCode(country);
  const detailUrl = firstString(raw.url, raw.officialUrl, `https://ted.europa.eu/en/notice/-/detail/${id}`);
  return procurementItem({ sourceId: "proc-eu-ted", sourceUrl, detailUrl, title, text, publishedAt, deadline, deadlineRaw: deadline ? `deadline ${deadline.slice(0, 10)}` : null, direction: "buyer_demand", stage: procurementStage(`${stringValue(raw.TD)} ${stringValue(raw.FT)} ${text}`, deadline, now), noticeType: "tender", projectId: id, buyer: stringValue(raw.buyer ?? raw.BY ?? ""), method: stringValue(raw.procedure ?? ""), countryCode, countryName: country || countryCode, budget: parseMoney(text), region: "GLOBAL" });
}

function parseTedText(text: string, sourceUrl: string, now = new Date()): ParsedAggregationItem[] {
  try {
    const root = JSON.parse(text) as Record<string, unknown>;
    return (Array.isArray(root.notices) ? root.notices : []).flatMap((value) => value && typeof value === "object" ? [parseTedNotice(value as Record<string, unknown>, sourceUrl, now)].filter((item): item is ParsedAggregationItem => Boolean(item)) : []);
  } catch { return []; }
}

function parseWorldBankRecord(raw: Record<string, unknown>, sourceUrl: string, now = new Date()): ParsedAggregationItem | null {
  const title = firstString(raw.bid_description, raw.project_title, raw.title, raw.description);
  if (!title) return null;
  const noticeType = firstString(raw.notice_type, raw.noticeType);
  // Sector facets are broad classification metadata (for example, a World
  // Bank record can carry `Tourism` while being an unrelated goods purchase).
  // Keep the public relevance decision grounded in the notice itself and its
  // procurement fields, not a broad project-sector facet.
  const text = [title, raw.project_title, raw.procurement_category, raw.procurement_method, noticeType].map(asText).filter(Boolean).join(" | ");
  const deadlineValue = firstString(raw.deadline_date, raw.deadlineDate);
  const deadline = parseProcurementDateText(deadlineValue, now, text);
  const publishedAt = parseProcurementDateText(firstString(raw.publication_date, raw.publicationDate), now, text);
  const stage = procurementStage(`${noticeType} ${text}`, deadline, now);
  const detailUrl = firstString(raw.url, raw.notice_url, raw.noticeUrl) || `https://projects.worldbank.org/en/projects-operations/procurement-detail/OP${String(raw.id ?? "").padStart(8, "0")}`;
  const countryName = firstString(raw.country_name, raw.countryName);
  const countryCode = normalizeCountryCode(firstString(raw.country_code, raw.countryCode, countryName));
  return procurementItem({
    sourceId: "proc-wb",
    sourceUrl,
    detailUrl,
    title,
    text,
    publishedAt,
    deadline,
    deadlineRaw: deadline ? `deadline ${deadlineValue}` : null,
    direction: "buyer_demand",
    stage,
    noticeType: /award|contract\s+award/iu.test(noticeType) ? "award" : "tender",
    projectId: firstString(raw.id, raw.project_id, raw.projectId) || null,
    buyer: firstString(raw.implementing_agency, raw.implementingAgency, raw.buyer, raw.agency) || null,
    countryCode,
    countryName: countryName || countryCode,
    region: "GLOBAL",
  });
}

function parseWorldBankJson(text: string, sourceUrl: string, now = new Date()): ParsedAggregationItem[] {
  try {
    const root = JSON.parse(text) as Record<string, unknown>;
    const rows = Array.isArray(root.data) ? root.data : Array.isArray(root.records) ? root.records : [];
    return rows.flatMap((row) => row && typeof row === "object" ? [parseWorldBankRecord(row as Record<string, unknown>, sourceUrl, now)].filter((item): item is ParsedAggregationItem => Boolean(item)) : []);
  } catch {
    return [];
  }
}

function parseWorldBankHtml(html: string, sourceUrl: string, now = new Date()): ParsedAggregationItem[] {
  const items: ParsedAggregationItem[] = [];
  for (const row of html.matchAll(/<tr\b[\s\S]*?<\/tr>/giu)) {
    const cells = [...row[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/giu)].map((match) => htmlToText(match[1]));
    if (cells.length < 3 || /description|country|project title/iu.test(cells.join(" "))) continue;
    const detail = row[0].match(/href=["']([^"']+)["']/iu)?.[1] ?? sourceUrl;
    const title = cells[0];
    const text = cells.join(" | ");
    const stage = procurementStage(`${cells[3] ?? ""} ${text}`, null, now);
    const countryCode = normalizeCountryCode(cells[1]);
    items.push(procurementItem({ sourceId: "proc-wb", sourceUrl, detailUrl: new URL(detail, sourceUrl).toString(), title, text, publishedAt: parseProcurementDateText(cells[4] ?? "", now, text), direction: "buyer_demand", stage, noticeType: "tender", projectId: identityHash("proc-wb", title, detail), buyer: cells[1] || null, countryCode, countryName: cells[1] || null, region: "GLOBAL" }));
  }
  return items;
}

function parseGgzyHtml(html: string, sourceUrl: string): ParsedAggregationItem[] {
  return parseHtmlListing("proc-cn-ggzy", html, sourceUrl).filter((item) => isCraftRelevantProcurement(`${item.title} ${item.raw_text}`));
}

function parseUngmHtml(html: string, sourceUrl: string, now = new Date()): ParsedAggregationItem[] {
  const items: ParsedAggregationItem[] = [];
  for (const anchor of extractAnchors(html, sourceUrl)) {
    if (!/\/Public\/Notice\//iu.test(anchor.href) || !anchor.text || anchor.text.length < 8) continue;
    items.push(procurementItem({ sourceId: "proc-un-ungm", sourceUrl, detailUrl: anchor.href, title: anchor.text, text: anchor.text, direction: "buyer_demand", stage: "open", noticeType: "tender", projectId: identityHash("proc-un-ungm", anchor.href), region: "GLOBAL" }));
  }
  return items;
}

export function parseProcurementSource(sourceId: string, payload: string, sourceUrl = SOURCE_LISTING_URLS[sourceId] ?? "", now = new Date()): ParsedAggregationItem[] {
  if (sourceId === "proc-cn-ccgp") {
    const detail = /<meta\b[^>]*(?:name|property)=["']ArticleTitle["']/iu.test(payload) ? parseCcgPDetail(payload, sourceUrl, sourceUrl, now) : null;
    return detail ? [detail] : parseHtmlListing(sourceId, payload, sourceUrl);
  }
  if (sourceId === "proc-cn-cib") {
    if (/^\s*\{/u.test(payload)) {
      const apiItems = parseCibApiPayload(payload, sourceUrl, now).filter(isCurrentProcurement);
      if (apiItems.length) return apiItems;
    }
    const detail = /(?:class=["'][^"']*c-title|发布日期|征集截止时间|寻源截止时间)/iu.test(payload) ? parseCibDetail(payload, sourceUrl, sourceUrl, now) : null;
    return detail ? [detail] : parseHtmlListing(sourceId, payload, sourceUrl);
  }
  if (sourceId === "proc-cn-ggzy") return parseGgzyHtml(payload, sourceUrl);
  if (sourceId === "proc-global-ocp") return parseOcdsText(payload, sourceId, sourceUrl, "GLOBAL", now);
  if (sourceId === "proc-eu-ted") return parseTedText(payload, sourceUrl, now);
  if (sourceId === "proc-us-sam") return parseOcdsText(payload, sourceId, sourceUrl, "GLOBAL", now);
  if (sourceId === "proc-kr-koneps") return parseOcdsText(payload, sourceId, sourceUrl, "GLOBAL", now);
  if (sourceId === "proc-wb") return /^\s*(?:\{|\[)/u.test(payload) ? parseWorldBankJson(payload, sourceUrl, now) : parseWorldBankHtml(payload, sourceUrl, now);
  if (sourceId === "proc-un-ungm") return parseUngmHtml(payload, sourceUrl, now);
  return parseProcurementPayload(payload, sourceId, sourceUrl, sourceId.startsWith("proc-cn-") ? "CN" : "GLOBAL");
}

/** Detail parser used by the existing bounded enrichment pass. */
export function parseProcurementDetail(sourceId: string, payload: string, detailUrl: string, now = new Date()): ParsedAggregationItem | null {
  if (sourceId === "proc-cn-ccgp") return parseCcgPDetail(payload, SOURCE_LISTING_URLS[sourceId], detailUrl, now);
  if (sourceId === "proc-cn-cib") return parseCibDetail(payload, SOURCE_LISTING_URLS[sourceId], detailUrl, now);
  return parseProcurementSource(sourceId, payload, detailUrl, now)[0] ?? null;
}

/** Public gate for procurement cards; internal Pool records are not deleted. */
export function isPublicProcurementOpportunity(item: ParsedAggregationItem, now = new Date()): boolean {
  if (!isCurrentProcurement(item)) return false;
  // The OCP registry is a discovery dataset. A record without a publisher
  // notice URL may remain in the internal pool, but it is never a public card.
  if (item.source_url.includes("data.open-contracting.org") && (!item.detail_url || item.detail_url.includes("data.open-contracting.org"))) return false;
  return isPublicProcurementText(`${item.title} ${item.raw_text}`, item.procurement, item.deadline_at, now);
}

export function isPublicProcurementText(text: string, procurement?: { direction?: string; stage?: string }, deadline?: string | null, now = new Date()): boolean {
  if (procurement && !["buyer_demand", "supplier_application", "market_engagement"].includes(procurement.direction ?? "")) return false;
  if (procurement && ["awarded", "closed", "cancelled"].includes(procurement.stage ?? "")) return false;
  if (/(?:建筑工程|工程施工|施工总承包|装修(?:工程|项目)?|土建工程|道路工程|桥梁工程|水利工程|机电安装|改造工程|construction(?:[- ]only)?|renovation(?:[- ]only)?|civil works|general construction|building works|building maintenance|adaptation works|construction manager|highway|건설|토목|리모델링 공사|인테리어 공사)/iu.test(text)) return false;
  if (/(?:服务器|交换机|防火墙|软件系统|网络设备|信息化平台|数据库|机房|金融终端|generic IT|software development|software licence|backup solution|digital weight management|technology and associated services|소프트웨어 개발|네트워크 장비)/iu.test(text)) return false;
  if (/(?:保洁|清洁服务|食堂|餐饮服务|物业服务|cleaning|catering|portable toilets|security service|医疗|medical|dental|oral surgery|palliative care|mental health|care services|childcare|prison|health board|청소|구내식당)/iu.test(text)) return false;
  if (/(?:车辆(?:采购|租赁|服务|购买)|车队(?:采购|租赁)|汽车(?:采购|租赁)|\b(?:vehicles?|fleet)\b|farming|fishery|council tax|telephone system|licen[cs]es?|finance support|insurance|legal support|staffing|estate management|refrigeration|endoscopes|engineering services|data centre|energy|housing|highways?|fire training|social care|consultancy|audio equipment|lighting equipment|AV design and installation|miscellaneous furnishing|office furniture|furniture)/iu.test(text)) return false;
  if (deadline && procurementDateIsPast(deadline, now)) return false;
  const craftRelevant = isCraftRelevantProcurement(text);
  const culturalEvent = /(?:文化|展演|博览会|节庆|艺术|旅游|cultural|heritage|museum|gallery|theatre|pavilion|castle)/iu.test(text)
    && /(?:展演|博览会|节庆|艺术|旅游|cultural trust|exhibition|event production|event|festival|theatre|pantomime|signage|wayfinding|design|craft|heritage|museum|gallery|pavilion)/iu.test(text);
  return craftRelevant && !/(?:^|\s)cultural\s+(?:contributions?|study|research|services?)(?:\s|$)/iu.test(text) || culturalEvent;
}

export function procurementSourceListingUrl(sourceId: string): string {
  return SOURCE_LISTING_URLS[sourceId] ?? "";
}

export function procurementSourceIds(): string[] {
  return Object.keys(SOURCE_LISTING_URLS);
}

export { isCurrentProcurement };
