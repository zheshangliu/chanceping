import { htmlToText, parseDateText, type ParsedAggregationItem, type ProcurementDirection, type ProcurementMetadata, type ProcurementMilestone, type ProcurementNoticeType, type ProcurementStage } from "../ich/aggregation/adapters/common";

const asText = (value: unknown): string => typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();

function date(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;
  const iso = raw.match(/^(20\d{2}-\d{2}-\d{2})(?:T[^\s]+)?/u)?.[1];
  return iso ? parseDateText(iso) : parseDateText(raw);
}

export function classifyProcurementDirection(text: string): ProcurementDirection {
  if (/(?:request for information|market engagement|market sounding|意向征集|市场调研|采购意向)/iu.test(text)) return "market_engagement";
  if (/(?:supplier application|submit your product|product submissions|orders are not guaranteed|供应商征集|供应商申请|供货申请)/iu.test(text)) return "supplier_application";
  if (/(?:supplier|vendor|provider|registration of interest)/iu.test(text) && !/(?:feedback before|market sounding)/iu.test(text)) return "supplier_application";
  if (/(?:wholesale|buy wholesale|卖方|批发|招商|加盟)/iu.test(text)) return "seller_offer";
  if (/(?:tender|contract|procurement|purchase|commission|call for bids|招标|采购|订购|委托)/iu.test(text)) return "buyer_demand";
  return "unknown";
}

function stageOf(text: string, rawStatus?: unknown): ProcurementStage {
  const value = `${asText(rawStatus)} ${text}`;
  if (/(?:cancel|取消|撤销)/iu.test(value)) return "cancelled";
  if (/(?:award|awarded|contracted|中标|成交|结果公告|已授标)/iu.test(value)) return "awarded";
  if (/(?:closed|close date passed|已结束|已关闭)/iu.test(value)) return "closed";
  if (/(?:pre[- ]?qualification|资格预审)/iu.test(value)) return "prequalification";
  if (/(?:planned|prior information|预告|计划)/iu.test(value)) return "planned";
  if (/(?:open|active|current|开放|进行中)/iu.test(value)) return "open";
  return "unknown";
}

function noticeTypeOf(raw: unknown, text: string): ProcurementNoticeType {
  const value = `${asText(raw)} ${text}`;
  if (/(?:request for information|market engagement|采购意向)/iu.test(value)) return "request_for_information";
  if (/(?:prior information|预告)/iu.test(value)) return "prior_information";
  if (/(?:award|中标|成交)/iu.test(value)) return "award";
  if (/(?:tender|contract|procurement|招标|采购)/iu.test(value)) return "tender";
  return "other";
}

function milestonesOf(raw: Record<string, unknown>, deadline: string | null): ProcurementMilestone[] {
  const milestones: ProcurementMilestone[] = [];
  for (const [key, kind] of [["publishedDate", "publication"], ["publicationDate", "publication"], ["tenderClosingDate", "submission"], ["closingDate", "submission"], ["contractStartDate", "contract_start"], ["contractEndDate", "contract_end"]] as const) {
    const value = date(raw[key]);
    if (value) milestones.push({ kind, date: value, text: key });
  }
  if (deadline && !milestones.some((milestone) => milestone.kind === "submission" && milestone.date === deadline)) milestones.push({ kind: "submission", date: deadline, text: "tender deadline" });
  return milestones;
}

function itemFromRecord(raw: Record<string, unknown>, sourceId: string, sourceUrl: string, region: "CN" | "GLOBAL"): ParsedAggregationItem | null {
  const tender = (raw.tender && typeof raw.tender === "object" ? raw.tender : raw) as Record<string, unknown>;
  const buyer = (raw.buyer && typeof raw.buyer === "object" ? raw.buyer : {}) as Record<string, unknown>;
  const title = asText(tender.title ?? raw.title ?? raw["title-titre-eng"] ?? raw["title-titre-fra"]);
  if (!title) return null;
  const description = htmlToText(asText(tender.description ?? raw.description ?? raw["description-description-eng"] ?? raw["description-description-fra"] ?? raw["tenderDescription-descriptionAppelOffres-eng"] ?? raw["tenderDescription-descriptionAppelOffres-fra"]));
  const text = `${title} ${description}`.replace(/\s+/gu, " ").trim();
  const deadline = date(tender.tenderPeriod && typeof tender.tenderPeriod === "object" ? (tender.tenderPeriod as Record<string, unknown>).endDate : raw.tenderClosingDate ?? raw.closingDate ?? raw["tenderClosingDate-appelOffresDateCloture"]);
  const projectId = asText(raw.ocid ?? raw.id ?? raw["referenceNumber-numeroReference"] ?? raw["solicitationNumber-numeroSollicitation"]) || null;
  const linkValue = raw.links && typeof raw.links === "object" ? ((raw.links as Record<string, unknown>).self ?? "") : "";
  const detail = asText(raw.url ?? raw["noticeURL-URLavis-eng"] ?? raw["noticeURL-URLavis-fra"] ?? linkValue) || sourceUrl;
  const stage = stageOf(text, raw.status ?? tender.status ?? raw["tenderStatus-appelOffresStatut-eng"]);
  const direction = classifyProcurementDirection(text);
  const money = text.match(/(?:budget|commission|value|预算|金额|上限)[^\d£$€¥￥]{0,20}(?:[£$€¥￥]\s*)?([\d,]+(?:\.\d+)?)\s*(GBP|USD|EUR|CAD|CNY|元|人民币)?/iu);
  const moneyAmount = money ? Number(money[1].replace(/,/gu, "")) : null;
  const moneyCurrency = money ? (money[2] ? ({ 元: "CNY", 人民币: "CNY" }[money[2]] ?? money[2].toUpperCase()) : /£/u.test(money[0]) ? "GBP" : /\$/u.test(money[0]) ? "USD" : /€/u.test(money[0]) ? "EUR" : null) : null;
  const metadata: ProcurementMetadata = {
    direction,
    stage,
    notice_type: noticeTypeOf(raw["noticeType"] ?? raw["notice-type"] ?? raw["noticeType-avisType-eng"] ?? raw["noticeType-avisType-fra"], text),
    project_id: projectId,
    buyer_name: asText(buyer.name ?? raw["contractingAuthorityName-nomAutoriteContractante"] ?? raw["contractingEntityName-nomEntitContractante-eng"] ?? raw["contractingEntityName-nomEntitContractante-fra"]) || null,
    procurement_method: asText(tender.procurementMethod ?? raw.procurementMethod ?? raw["procurementMethod-methodeApprovisionnement-eng"] ?? raw["procurementMethod-methodeApprovisionnement-fra"]) || null,
    budget_amount: moneyAmount,
    budget_currency: moneyCurrency,
    milestones: milestonesOf({ ...raw, ...(tender.tenderPeriod && typeof tender.tenderPeriod === "object" ? { tenderClosingDate: (tender.tenderPeriod as Record<string, unknown>).endDate } : {}) }, deadline),
    source_record_id: projectId,
  };
  if (metadata.direction === "seller_offer" || metadata.stage === "awarded" || metadata.stage === "closed" || metadata.stage === "cancelled") return null;
  const sourceItemId = `${sourceId}:${projectId ?? title}`;
  return {
    source_item_id: sourceItemId,
    title,
    source_category: "procurement_project",
    source_status: stage,
    detail_url: detail,
    source_url: sourceUrl,
    published_at: date(raw.datePublished ?? raw.publishedDate ?? raw["publicationDate-datePublication"]),
    deadline_text: deadline ? `tender deadline ${deadline.slice(0, 10)}` : null,
    deadline_at: deadline,
    deadline_source_url: detail,
    deadline_raw_text: deadline ? `tender deadline ${deadline.slice(0, 10)}` : null,
    deadline_resolution: deadline ? "found_listing" : "source_has_no_date",
    deadline_kind: "deadline",
    organizer: metadata.buyer_name ?? null,
    application_url: detail,
    raw_text: text,
    participation_scope: region === "GLOBAL" ? "global" : "nationwide",
    procurement: metadata,
  };
}

function parseJsonPayload(payload: unknown, sourceId: string, sourceUrl: string, region: "CN" | "GLOBAL"): ParsedAggregationItem[] {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const records: Record<string, unknown>[] = [];
  const releases = Array.isArray(root.releases) ? root.releases : Array.isArray(root.records) ? root.records : Array.isArray(root.data) ? root.data : [];
  for (const record of releases) if (record && typeof record === "object") records.push(record as Record<string, unknown>);
  const unique = new Map<string, ParsedAggregationItem>();
  for (const record of records) {
    const item = itemFromRecord(record, sourceId, sourceUrl, region);
    if (item) unique.set(item.source_item_id, item);
  }
  return [...unique.values()];
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < line.length; i += 1) { const ch = line[i]; if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = !quoted; else if (ch === "," && !quoted) { cells.push(cell); cell = ""; } else cell += ch; }
  cells.push(cell); return cells;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && text[i + 1] === '"' && quoted) { cell += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && text[i + 1] === "\n") i += 1; row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function parseCsvPayload(text: string, sourceId: string, sourceUrl: string, region: "CN" | "GLOBAL"): ParsedAggregationItem[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/u, ""));
  if (!rows.length) return [];
  const headers = rows[0];
  const items: ParsedAggregationItem[] = [];
  for (const values of rows.slice(1)) { const raw = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])); const item = itemFromRecord(raw, sourceId, sourceUrl, region); if (item) items.push(item); }
  return items;
}

export function parseProcurementPayload(text: string, sourceId: string, sourceUrl: string, region: "CN" | "GLOBAL"): ParsedAggregationItem[] {
  try { return parseJsonPayload(JSON.parse(text), sourceId, sourceUrl, region); } catch { return parseCsvPayload(text, sourceId, sourceUrl, region); }
}

export function isCurrentProcurement(item: ParsedAggregationItem): boolean {
  const procurement = item.procurement;
  return Boolean(procurement && procurement.direction !== "seller_offer" && !["awarded", "closed", "cancelled"].includes(procurement.stage));
}

/** Narrow ICH domain guard; generic public procurement remains auditable in the pool but is not presented as an ICH opportunity. */
export function isCraftRelevantProcurement(text: string): boolean {
  return /\b(?:craft|heritage|cultural|museum|gallery|gift|souvenir|handmade|textile|ceramic|pottery|jewell?ery|fashion|exhibition|tourism)\b|\b(?:product|packaging|graphic|brand|ip)\s+(?:design|development)\b|文创|非遗|手工|工艺|博物馆|美术馆|礼品|伴手礼|包装|艺术|展览|文旅|市集|工艺品|纪念品/iu.test(text);
}
