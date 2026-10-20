import crypto from "node:crypto";
import { getOpportunityV2SourcePermission, isOpportunityV2PublicCopyAllowed } from "../../opportunity-v2/source-governance";
import { publicOpportunityV2Deadline } from "../../opportunity-v2/public-deadline";
import type { OpportunityV2, OpportunityV2Source } from "../../opportunity-v2/types";
import type { OpportunityV2Translation } from "../../opportunity-v2/display";
import type { IchAgentConstraints, IchAgentEvidence, IchAgentFact, IchAgentQueryRequest, IchAgentResult, IchAgentToolReceipt, IchAgentTurnResponse } from "./contracts";
import { sanitizeMessageForExternalUse, sanitizeMessageForLocalParsing, interpretIchAgentRequest } from "./intent";
import { IchAgentBudget, type IchAgentCallKind, type IchAgentBudgetTicket } from "./budget";
import { deepSeekFetchPage, deepSeekSearch, deepSeekTranslateTitles, DeepSeekToolError, type DeepSeekPage, type DeepSeekSearchHit, type DeepSeekToolOptions } from "./deepseek-tools";
import { evidenceForPublishedOpportunity, matchExistingPublishedOpportunity, retrievePublishedIchOpportunities } from "./retrieval";
import { findIchAgentTurn, type IchAgentSession } from "./session-store";
import { validateExternalTargetUrl } from "./url-safety";

export interface IchAgentServiceOptions {
  now?: () => Date;
  opportunities: OpportunityV2[];
  sources: OpportunityV2Source[];
  translations?: OpportunityV2Translation[];
  webEnabled?: boolean;
  budget: IchAgentBudget;
  deepseek?: DeepSeekToolOptions;
  search?: (query: string, safeQuestion: string, signal?: AbortSignal) => Promise<{ results: DeepSeekSearchHit[]; billable: boolean; http_status: number }>;
  fetchPage?: (url: string, heldSourceUrls: string[], signal?: AbortSignal) => Promise<DeepSeekPage>;
  translateTitles?: (titles: Array<{ id: string; title: string }>, signal?: AbortSignal) => Promise<{ translations: Array<{ id: string; title_zh: string }>; input_tokens: number; output_tokens: number }>;
}

const SEARCH_CACHE = new Map<string, { expires_at: number; results: DeepSeekSearchHit[] }>();
let searchRateQueue: Promise<void> = Promise.resolve();
let searchLastStartedAt = 0;
const ALLOWED_CATEGORIES = new Set(["competition", "procurement_project", "exhibition_market", "policy_funding", "channel_collaboration", "international"]);
const CRAFT_TERMS = ["押花", "压花", "扎染", "蜡染", "刺绣", "漆器", "漆艺", "木雕", "竹编", "藤编", "剪纸", "皮影", "陶瓷", "陶艺", "银饰", "玉雕", "编织", "织锦", "手工艺", "工艺美术", "非遗", "文创"];
const OPPORTUNITY_TITLE = /(?:competition|prize|award|grant|market|festival|open call|call for|residency|fellowship|apply|application|tender|procurement|征集|赛事|比赛|大赛|招募|市集|展销|展会|采购|投标|资助|补贴|驻地|报名|创作计划)/iu;
const COMPLETED_RESULT_TITLE = /(?:斩获佳绩|获奖名单|获奖作品|获奖情况|获奖结果|获奖公告|结果公示|结果公布|入围名单|获奖名额|夺得(?:冠军|奖项)|荣获(?:国家级|省级|一等奖|二等奖|三等奖))/u;
const MONEY_PATTERN = /(?:费用|报名费|申请费|参展费|投稿费|运输费|奖金|资助金额|预算|免费|免报名费|fee|cost|prize|award|funding|grant|stipend|budget)/iu;
const ELIGIBILITY_PATTERN = /(?:申请资格|申报对象|参赛对象|申请对象|适用对象|谁能申请|个人参赛者|单位\s*[\/]\s*团队参赛者|面向全国|大赛面向|年满\s*18\s*周岁|青少年|中小学生|在校学生|eligible|eligibility|applicant|who can apply|residents? of|open to)/iu;
const WORK_PATTERN = /(?:作品要求|参赛作品.{0,24}(?:须|需|应|提交|围绕)|参赛作品以照片|作品照片|单张分辨率|分辨率不低于|报送作品不超过\s*\d+件|报名表|参赛材料|提交作品|作品须|作品需|原创|首发|未发表|材料要求|提交材料|deliverables|submission requirements|work requirements|portfolio|new work|unpublished)/iu;
const DEADLINE_PATTERN = /(?:报名截止|申请截止|投稿截止|截稿|截止日期|截止时间|deadline|closing date|submission closes|application closes|applications close)/iu;
const NUMERIC_DATE = /(?:20\d{2}\s*(?:年|[-/.])\s*\d{1,2}\s*(?:月|[-/.])\s*\d{1,2}\s*日?)/u;
const MONTH_DAY = /(?:\d{1,2}\s*月\s*\d{1,2}\s*日)/u;
const ENGLISH_DATE = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+20\d{2})\b/iu;

function cnyActualForCall(kind: IchAgentCallKind, inputTokens = 0, outputTokens = 0): number {
  const fx = Number(process.env.ICH_AGENT_USD_CNY_RATE || 8);
  const rate = Number.isFinite(fx) && fx >= 5 ? fx : 8;
  if (kind === "search" || kind === "fetch") return 0.75 / 1000 * rate;
  return (Math.max(0, inputTokens) * 0.30 / 1_000_000 + Math.max(0, outputTokens) * 1.20 / 1_000_000) * rate;
}

function settleFailure(budget: IchAgentBudget, ticket: IchAgentBudgetTicket | null, error: unknown): void {
  if (!ticket) return;
  const status = error instanceof DeepSeekToolError ? error.httpStatus : undefined;
  // A successful HTTP response can be billable even when provider output is malformed.
  budget.settle(ticket, { successful: false, httpStatus: status, actualCny: status === 200 ? ticket.reserved_cny : 0 });
}

async function reserveAndCall<T>(budget: IchAgentBudget, kind: IchAgentCallKind, operation: (ticket: IchAgentBudgetTicket) => Promise<T>, costOfSuccess: (value: T, ticket: IchAgentBudgetTicket) => number, success: (value: T) => boolean): Promise<{ ok: true; value: T } | { ok: false; code: string }> {
  const ticket = budget.reserve(kind);
  if (!ticket) return { ok: false, code: budget.configured() ? "BUDGET_EXHAUSTED" : "PUBLIC_BUDGET_NOT_CONFIGURED" };
  try {
    const value = await operation(ticket);
    budget.settle(ticket, { successful: success(value), actualCny: success(value) ? costOfSuccess(value, ticket) : 0 });
    return { ok: true, value };
  } catch (error) {
    settleFailure(budget, ticket, error);
    return { ok: false, code: error instanceof DeepSeekToolError ? error.code : "PROVIDER_UNAVAILABLE" };
  }
}

function notifyText(input: { mode: IchAgentQueryRequest["mode"]; receipt: IchAgentToolReceipt; partialFailures: string[]; results: IchAgentResult[]; externalEnabled: boolean }): string {
  if (input.receipt.search_cache_hits > 0 && input.receipt.search_calls === 0) return "本次使用了15分钟内的搜索缓存；搜索摘要只作线索，不能代替主办方原文。";
  if (!input.externalEnabled && input.mode !== "library") return input.results.length ? "已查已收录机会；联网补查额度尚未启用，本次没有向外部搜索或模型发送请求。" : "目前只查了已收录机会；可先使用下方筛选。联网补查额度尚未启用。";
  if (input.receipt.web_succeeded) return `本次已联网补查${input.receipt.search_calls + input.receipt.search_cache_hits}次；搜索发布时间不等同于报名截止，未能从原文确认的字段仍标为待核。`;
  if (input.receipt.web_attempted && input.results.length) return "已找到这些已收录机会；本次网页补查未完成，最新截止和申请条件仍需核对。";
  if (input.mode === "library") return "本次仅查看已收录信息，没有发起网页或模型请求。";
  return "搜索没有返回可用的网页线索；这不代表全网没有机会。您仍可查看已收录结果或调整条件。";
}

function asFact(value: string | null, status: IchAgentFact["status"], evidenceRefs: string[] = []): IchAgentFact { return { value, status, evidence_refs: evidenceRefs }; }
function textParagraphs(text: string): string[] {
  return text.split(/\n+|(?<=[。.!?])\s+/u).flatMap((part) => {
    const raw = part.trim();
    if (/^\\?#{1,6}\s/u.test(raw) || /^(?:名称|标题|来源|链接|网址|URL|发布时间|发布日期)\s*[:：|]/iu.test(raw)) return [];
    const cleaned = raw.replace(/^[-*#>\s]+/u, "").replace(/\\([\\`*_{}\[\]()#+\-.!|>])/gu, "$1").trim();
    if (/^[（(][一二三四五六七八九十\d]+[）)]\s*(?:参赛)?作品要求$/u.test(cleaned)) return [];
    return cleaned.length > 8 ? [cleaned] : [];
  }).slice(0, 400);
}
function extractExcerpts(content: string, pattern: RegExp, limit = 2): string[] { return textParagraphs(content).filter((line) => pattern.test(line)).slice(0, limit).map((line) => line.slice(0, 300)); }

function parsedDeadline(content: string): { value: string | null; status: IchAgentFact["status"]; quote: string | null } {
  const lines = textParagraphs(content).filter((line) => {
    const explicitRegistrationWindow = /(?:报名时间|报名日期)/u.test(line) && /(?:即日起|至|到|截止|截至)/u.test(line);
    return (DEADLINE_PATTERN.test(line) || explicitRegistrationWindow) && (NUMERIC_DATE.test(line) || MONTH_DAY.test(line) || ENGLISH_DATE.test(line));
  });
  const canonicalDate = (date: string): string => {
    const chinese = date.match(/^(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/u);
    if (chinese) return `${chinese[1]}-${chinese[2].padStart(2, "0")}-${chinese[3].padStart(2, "0")}`;
    const numeric = date.match(/^(20\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$/u);
    if (numeric) return `${numeric[1]}-${numeric[2].padStart(2, "0")}-${numeric[3].padStart(2, "0")}`;
    return date;
  };
  const matches = lines.flatMap((line) => {
    const date = line.match(NUMERIC_DATE)?.[0] ?? line.match(ENGLISH_DATE)?.[0] ?? line.match(MONTH_DAY)?.[0];
    return date ? [{ date: canonicalDate(date), line }] : [];
  });
  const normalized = [...new Set(matches.map((row) => row.date))];
  if (normalized.length > 1) return { value: null, status: "conflict", quote: matches.map((row) => row.line).join("；").slice(0, 300) };
  if (!matches.length) return { value: null, status: "unknown", quote: null };
  return { value: matches[0].date, status: "source_excerpt", quote: matches[0].line };
}

function addWebEvidence(input: { result: IchAgentResult; page: DeepSeekPage; turnId: string; checkedAt: string }): IchAgentEvidence[] {
  const excerpts = {
    money: extractExcerpts(input.page.content, MONEY_PATTERN),
    eligibility: extractExcerpts(input.page.content, ELIGIBILITY_PATTERN, 5),
    work_requirements: extractExcerpts(input.page.content, WORK_PATTERN, 4),
  };
  const deadline = parsedDeadline(input.page.content);
  const evidence: IchAgentEvidence[] = [];
  const add = (field: IchAgentEvidence["field"], excerpt: string) => {
    const evidenceId = `web-${input.turnId}-${field}-${evidence.length + 1}`;
    evidence.push({ evidence_id: evidenceId, field, value: excerpt, excerpt, status: "source_excerpt", source_url: input.page.final_url, recorded_at: input.checkedAt });
    return evidenceId;
  };
  const pageTitle = input.page.title.trim();
  if (pageTitle) {
    const titleId = add("title", pageTitle);
    input.result.evidence_refs.push(titleId);
  }
  const deadlineQuote = deadline.quote ? add("deadline", deadline.quote) : undefined;
  input.result.deadline_fact = asFact(deadline.value, deadline.status, deadlineQuote ? [deadlineQuote] : []);
  if (deadline.status === "conflict") input.result.lifecycle = "conflict";
  else if (deadline.value) {
    const dateOnly = deadline.value.match(/^(20\d{2}-\d{2}-\d{2})$/u)?.[1];
    const yearIsExplicit = /20\d{2}/u.test(deadline.value);
    if (dateOnly && yearIsExplicit) {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(input.checkedAt));
      const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
      const today = `${part("year")}-${part("month")}-${part("day")}`;
      input.result.lifecycle = dateOnly < today ? "historical" : "current";
    } else if (yearIsExplicit && Number.isFinite(Date.parse(deadline.value))) {
      input.result.lifecycle = Date.parse(deadline.value) < Date.parse(input.checkedAt) ? "historical" : "current";
    }
  }
  input.result.money_facts = excerpts.money.length ? excerpts.money.map((quote) => { const id = add("money", quote); return asFact(quote, "source_excerpt", [id]); }) : [asFact(null, "unknown")];
  input.result.eligibility_facts = excerpts.eligibility.length ? excerpts.eligibility.map((quote) => { const id = add("eligibility", quote); return asFact(quote, "source_excerpt", [id]); }) : [asFact(null, "unknown")];
  input.result.work_requirements = excerpts.work_requirements.length ? excerpts.work_requirements.map((quote) => { const id = add("work_requirements", quote); return asFact(quote, "source_excerpt", [id]); }) : [asFact(null, "unknown")];
  const youthClue = excerpts.eligibility.some((quote) => /青少年|中小学生|在校学生/u.test(quote));
  input.result.key_gap = [deadline.status === "unknown" ? "截止日期未在页面中找到" : deadline.status === "conflict" ? "页面出现多个截止日期线索，需要人工核实" : input.result.lifecycle === "historical" ? "原文截止日期已过期，不作为当前开放机会推荐" : input.result.lifecycle === "unknown" && deadline.value ? "原文未提供足够年份信息判断当前状态" : "", excerpts.money.length ? "费用摘录需确认适用阶段" : "费用未在页面片段中找到", youthClue ? "页面提及青少年群体，但未确认这是资格限制；工作室是否符合须核对主办方原文" : excerpts.eligibility.length ? "资格须由申请人对照原文确认" : "资格未在页面片段中找到", excerpts.work_requirements.length ? "作品要求须由申请人对照原文确认" : "作品要求未在页面片段中找到"].filter(Boolean).join("；");
  if (input.result.lifecycle === "historical") input.result.next_action = "报名期限已过；不建议提交。可保存来源规则作为后续参考。";
  input.result.verification_state = "本轮已读取链接页面；页面是否为主办方官方来源尚未独立确认，摘录仅供回原文核对";
  return evidence;
}

function shouldAskWeb(mode: IchAgentQueryRequest["mode"], message: string, count: number, hasTarget: boolean): boolean {
  if (mode === "library") return false;
  if (mode === "web") return true;
  if (hasTarget && /资格|费用|收费|多少钱|奖金|作品|材料|截止|要求|怎么申请|最新|核实/u.test(message)) return true;
  return count < 3 || /最新|补查|网上找|联网|有没有新|今年|最新公告/u.test(message);
}

function applyModelInterpretation(base: IchAgentConstraints, value: { opportunity_type?: string; craft_term?: string; region?: "CN" | "GLOBAL"; within_days?: number }, message: string): IchAgentConstraints {
  const next = { ...base, craft_terms: [...base.craft_terms], opportunity_types: [...base.opportunity_types], location_terms: [...base.location_terms], explicit_exclusions: [...base.explicit_exclusions] };
  if (!next.opportunity_types.length && typeof value.opportunity_type === "string" && ALLOWED_CATEGORIES.has(value.opportunity_type)) next.opportunity_types.push(value.opportunity_type);
  if (!next.craft_terms.length && CRAFT_TERMS.includes(value.craft_term ?? "") && message.includes(value.craft_term ?? "")) next.craft_terms.push(value.craft_term!);
  if (next.region === "all" && value.region && (/(?:国内|中国|本地|广州|广东|深圳|杭州|北京|上海)/u.test(message) || /(?:海外|国外|全球|国际)/u.test(message))) next.region = value.region;
  const explicit = message.match(/(?:未来|近|接下来|最近)(\d{1,3})\s*(?:天|日)/u);
  if (next.within_days === null && explicit && Number(value.within_days) === Number(explicit[1])) next.within_days = Math.min(365, Math.max(1, Number(explicit[1])));
  return next;
}

function ordinalIndex(message: string): number | null {
  const match = message.match(/第\s*(\d{1,2}|一|二|三|四|五)\s*(?:条|个|项)/u);
  if (!match) return null;
  const words: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
  return (words[match[1]] ?? Number(match[1])) - 1;
}

function friendlyFailure(code: string): string {
  const labels: Record<string, string> = { CREDENTIAL_NOT_CONFIGURED: "DeepSeek凭据未配置", PUBLIC_BUDGET_NOT_CONFIGURED: "联网补查额度尚未配置", BUDGET_EXHAUSTED: "今天的联网查询额度已用完", ACCOUNT_BALANCE_REQUIRED: "DeepSeek账户余额不足", INVALID_CREDENTIAL: "DeepSeek凭据未通过验证", RATE_LIMITED: "服务繁忙，稍后可再试", COMPLIANCE_HOLD: "该网站当前在合规暂停名单中，没有自动读取", PRIVATE_OR_MIXED_DNS_BLOCKED: "网页地址解析到受限网络，已阻止读取", SOURCE_ACCESS_DENIED: "来源拒绝访问，本次不绕过限制", FETCH_FAILED: "网页暂时无法读取", PROVIDER_UNAVAILABLE: "联网服务暂时不可用", CANCELLED: "本次请求已取消", PROVIDER_POLICY_BLOCKED: "服务方安全策略拒绝了请求" };
  return labels[code] ?? "本次联网补查未完成";
}

async function waitForSearchRate(signal?: AbortSignal): Promise<void> {
  const prior = searchRateQueue;
  let release = () => {};
  searchRateQueue = new Promise<void>((resolve) => { release = resolve; });
  await prior;
  try {
    const delay = Math.max(0, 250 - (Date.now() - searchLastStartedAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (signal?.aborted) throw new DeepSeekToolError("CANCELLED");
    searchLastStartedAt = Date.now();
  } finally { release(); }
}

function extractFactsFromPool(result: IchAgentResult, item: OpportunityV2, sources: OpportunityV2Source[], translations: OpportunityV2Translation[], now: Date): IchAgentEvidence[] {
  return evidenceForPublishedOpportunity(item, now, translations, sources).filter((evidence) => result.evidence_refs.includes(evidence.evidence_id));
}

export async function runIchAgentTurn(input: { session: IchAgentSession; request: IchAgentQueryRequest; signal?: AbortSignal; options: IchAgentServiceOptions }): Promise<{ response: IchAgentTurnResponse; resultsByRef: Map<string, IchAgentResult>; evidencesById: Map<string, IchAgentEvidence> }> {
  const { session, request, options } = input;
  const now = options.now?.() ?? new Date();
  const turnId = `turn-${crypto.randomBytes(12).toString("base64url")}`;
  const localMessage = sanitizeMessageForLocalParsing(request.message);
  const safeMessage = sanitizeMessageForExternalUse(request.message);
  const explicitParent = request.parent_turn_id ? findIchAgentTurn(session, request.parent_turn_id) : undefined;
  if (request.parent_turn_id && !explicitParent) throw new Error("INVALID_PARENT_TURN");
  const previousTurn = explicitParent ?? session.turns.at(-1);
  const refsForTarget = request.compare_result_refs?.length ? request.compare_result_refs : request.result_ref ? [request.result_ref] : [];
  let targeted: IchAgentResult[] = [];
  if (refsForTarget.length) {
    if (!previousTurn) throw new Error("INVALID_PARENT_TURN");
    targeted = refsForTarget.map((ref) => {
      const row = previousTurn.results_by_ref.get(ref);
      if (!row) throw new Error("INVALID_RESULT_REF");
      return structuredClone(row);
    });
    if (targeted.length > 3) throw new Error("TOO_MANY_COMPARE_ITEMS");
  } else {
    const ordinal = ordinalIndex(request.message);
    if (ordinal !== null) {
      if (!previousTurn?.result_refs[ordinal]) throw new Error("RESULT_REFERENCE_NOT_FOUND");
      const row = previousTurn.results_by_ref.get(previousTurn.result_refs[ordinal]);
      if (!row) throw new Error("RESULT_REFERENCE_NOT_FOUND");
      targeted = [structuredClone(row)];
    }
  }
  const receipt: IchAgentToolReceipt = { library_used: true, web_attempted: false, web_succeeded: false, search_calls: 0, fetch_calls: 0, chat_calls: 0, search_cache_hits: 0 };
  const partialFailures: string[] = [];
  const evidences = new Map<string, IchAgentEvidence>();
  if (targeted.length && previousTurn) {
    for (const result of targeted) {
      for (const evidenceId of result.evidence_refs) {
        const priorEvidence = previousTurn.evidences_by_id.get(evidenceId);
        if (priorEvidence) evidences.set(evidenceId, priorEvidence);
      }
    }
  }
  let constraints = { ...session.constraints, craft_terms: [...session.constraints.craft_terms], opportunity_types: [...session.constraints.opportunity_types], location_terms: [...session.constraints.location_terms], explicit_exclusions: [...session.constraints.explicit_exclusions] };
  let results: IchAgentResult[];
  const mode = request.mode ?? interpretIchAgentRequest({ message: localMessage, previous: constraints }).mode;
  const interpreted = interpretIchAgentRequest({ message: localMessage, previous: constraints, requestedMode: mode });
  constraints = interpreted.constraints;

  const shouldUseTools = options.webEnabled === true && options.budget.configured() && mode !== "library";
  if (targeted.length) {
    results = targeted;
  } else {
    results = retrievePublishedIchOpportunities({ message: localMessage, constraints, opportunities: options.opportunities, sources: options.sources, now, translations: options.translations });
  }

  if (shouldAskWeb(mode, safeMessage, results.length, targeted.length > 0)) {
    receipt.web_attempted = true;
    if (!shouldUseTools) {
      partialFailures.push(options.budget.configured() ? "联网搜索当前处于关闭状态" : "PUBLIC_BUDGET_NOT_CONFIGURED");
    } else if (input.signal?.aborted) {
      partialFailures.push("CANCELLED");
    } else if (targeted.length && request.compare_result_refs?.length) {
      // Comparisons use the exact prior result snapshots and never initiate a new search.
      receipt.web_attempted = false;
    } else if (targeted.length === 1) {
      const result = targeted[0];
      const libraryItem = result.opportunity_id ? options.opportunities.find((item) => item.id === result.opportunity_id) : undefined;
      const held = options.sources.filter((source) => getOpportunityV2SourcePermission(source.id) === "COMPLIANCE_HOLD").map((source) => source.url);
      const mayFetch = !libraryItem || (isOpportunityV2PublicCopyAllowed(libraryItem) && getOpportunityV2SourcePermission(libraryItem.source_id) !== "COMPLIANCE_HOLD");
      if (mayFetch) {
      const fetch = await reserveAndCall(options.budget, "fetch", async () => (options.fetchPage ?? ((url, urls, signal) => deepSeekFetchPage(url, urls, { ...options.deepseek, signal })))(result.original_url, held, input.signal), (value) => value.http_status >= 200 && value.http_status < 300 ? cnyActualForCall("fetch") : 0, (value) => value.http_status >= 200 && value.http_status < 300 && Boolean(value.content.trim()));
        if (fetch.ok) {
          receipt.fetch_calls++;
          receipt.web_succeeded = true;
          evidences.set(`web-${turnId}-page-source`, { evidence_id: `web-${turnId}-page-source`, field: "source", value: `本轮读取页面：${fetch.value.title || result.title_zh}`, status: "source_excerpt", source_url: fetch.value.final_url, recorded_at: now.toISOString() });
          for (const evidence of addWebEvidence({ result, page: fetch.value, turnId, checkedAt: now.toISOString() })) evidences.set(evidence.evidence_id, evidence);
          results = [result];
        } else partialFailures.push(friendlyFailure(fetch.code));
      } else partialFailures.push("COMPLIANCE_HOLD");
    } else {
      const query = interpreted.search_query.slice(0, 128);
      const cacheKey = crypto.createHash("sha256").update(`${query}|zh-CN|global`).digest("hex");
      const cached = SEARCH_CACHE.get(cacheKey);
      let hits: DeepSeekSearchHit[] = [];
      if (cached && cached.expires_at > now.getTime()) {
        hits = cached.results;
        receipt.search_cache_hits++;
        receipt.web_succeeded = hits.length > 0;
      } else {
        const search = await reserveAndCall(options.budget, "search", async () => {
          await waitForSearchRate(input.signal);
          // Search receives only the compact, locally-normalized query; the raw utterance stays local.
          return await (options.search ?? ((q, safeQ, signal) => deepSeekSearch(q, safeQ, { ...options.deepseek, signal })))(query, query, input.signal);
        }, (value) => value.billable ? cnyActualForCall("search") : 0, (value) => value.http_status === 200 && value.results.length > 0);
        if (search.ok) {
          receipt.search_calls++;
          hits = search.value.results;
          receipt.web_succeeded = hits.length > 0;
          if (hits.length) SEARCH_CACHE.set(cacheKey, { expires_at: now.getTime() + 15 * 60_000, results: hits });
        } else partialFailures.push(friendlyFailure(search.code));
      }
      if (!input.signal?.aborted && hits.length) {
        const holdUrls = options.sources.filter((source) => getOpportunityV2SourcePermission(source.id) === "COMPLIANCE_HOLD").map((source) => source.url);
        const existingKeys = new Set(options.opportunities.filter(isOpportunityV2PublicCopyAllowed).map((item) => item.title.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "")));
        const seen = new Set<string>();
        const candidates: Array<{ hit: DeepSeekSearchHit; result: IchAgentResult }> = [];
        for (const hit of hits) {
          if (!OPPORTUNITY_TITLE.test(hit.title) || COMPLETED_RESULT_TITLE.test(hit.title)) continue;
          const titleKey = hit.title.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "");
          if (!titleKey || existingKeys.has(titleKey) || seen.has(titleKey)) continue;
          const validatedUrl = validateExternalTargetUrl(hit.url);
          if (!validatedUrl.ok || !validatedUrl.url) continue;
          const url = validatedUrl.url;
          const knownHeld = holdUrls.some((sourceUrl) => { try { const host = new URL(sourceUrl).hostname.toLowerCase(); return url.hostname.toLowerCase() === host || url.hostname.toLowerCase().endsWith(`.${host}`); } catch { return false; } });
          if (knownHeld) continue;
          const category = constraints.opportunity_types[0] ?? "international";
          const result: IchAgentResult = {
            result_ref: `ref-${crypto.randomBytes(12).toString("base64url")}`,
            source_kind: "web_new", title_zh: hit.title, title_translation: "original", opportunity_type: category,
            lifecycle: "unknown", region: "待核地区",
            deadline_fact: asFact(null, "unknown"), money_facts: [asFact(null, "unknown")], eligibility_facts: [asFact(null, "unknown")], work_requirements: [asFact(null, "unknown")],
            fit_reason: hit.snippet ? `搜索摘要提到：${hit.snippet.slice(0, 180)}（仅为搜索线索，尚未核实）` : "搜索引擎发现了相关标题线索，尚待原文核实。",
            key_gap: "该网页尚未加入机会库；来源身份、截止、费用、资格与作品要求均待核实。",
            next_action: "先打开来源原文核对发布方与完整条款。",
            original_url: hit.url, evidence_refs: [], verification_state: "网上新发现，尚未加入机会库；搜索摘要不是主办方证明",
          };
          const leadId = `web-${turnId}-lead-${candidates.length + 1}`;
          const leadEvidence: IchAgentEvidence = { evidence_id: leadId, field: "source", value: hit.snippet || hit.title, excerpt: hit.snippet || hit.title, status: "search_lead", source_url: hit.url, recorded_at: now.toISOString() };
          evidences.set(leadId, leadEvidence);
          result.evidence_refs.push(leadId);
          candidates.push({ hit, result });
          seen.add(titleKey);
          if (candidates.length >= 3) break;
        }
        const libraryLimit = candidates.length ? Math.min(3, results.length) : Math.min(5, results.length);
        const visibleCandidates = candidates.slice(0, Math.max(0, 5 - libraryLimit));
        const needsTranslation = visibleCandidates.filter(({ hit }) => /[A-Za-z]{3,}/u.test(hit.title));
        if (needsTranslation.length) {
          const translation = await reserveAndCall(options.budget, "chat", async () =>
            (options.translateTitles ?? ((titles, signal) => deepSeekTranslateTitles(titles, { ...options.deepseek, signal })))(
              needsTranslation.map(({ hit, result }) => ({ id: result.result_ref, title: hit.title })), input.signal,
            ),
          (value, ticket) => value.input_tokens + value.output_tokens > 0 ? cnyActualForCall("chat", value.input_tokens, value.output_tokens) : ticket.reserved_cny,
          () => true);
          if (translation.ok) {
            receipt.chat_calls++;
            const translated = new Map(translation.value.translations.map((row) => [row.id, row.title_zh]));
            let translatedCount = 0;
            for (const candidate of needsTranslation) {
              const titleZh = translated.get(candidate.result.result_ref);
              if (titleZh && /\p{Script=Han}/u.test(titleZh)) {
                candidate.result.title_zh = titleZh;
                candidate.result.original_title = candidate.hit.title;
                candidate.result.title_translation = "translated";
                translatedCount++;
              }
            }
            if (translatedCount < needsTranslation.length) partialFailures.push("部分网页标题未通过中文译名检查，已保留来源原文标题");
          } else partialFailures.push("网页新发现标题暂未翻译，保留来源原文标题");
        }
        const first = visibleCandidates[0];
        if (first && /资格|费用|收费|多少钱|奖金|作品|材料|截止|要求|详情|申请|报名|原文/u.test(safeMessage)) {
          const pageResult = await reserveAndCall(options.budget, "fetch", async () => {
            if (input.signal?.aborted) throw new DeepSeekToolError("CANCELLED");
            return await (options.fetchPage ?? ((url, urls, signal) => deepSeekFetchPage(url, urls, { ...options.deepseek, signal })))(first.hit.url, holdUrls, input.signal);
          }, (value) => value.http_status >= 200 && value.http_status < 300 ? cnyActualForCall("fetch") : 0, (value) => value.http_status >= 200 && value.http_status < 300 && Boolean(value.content.trim()));
          if (pageResult.ok) {
            receipt.fetch_calls++;
            receipt.web_succeeded = true;
            for (const evidence of addWebEvidence({ result: first.result, page: pageResult.value, turnId, checkedAt: now.toISOString() })) evidences.set(evidence.evidence_id, evidence);
          } else partialFailures.push(friendlyFailure(pageResult.code));
        }
        results = [...results.slice(0, libraryLimit), ...visibleCandidates.map((candidate) => candidate.result)].slice(0, 5);
      }
    }
  }

  if (input.signal?.aborted) partialFailures.push("CANCELLED");
  const uniqueEvidence = new Map<string, IchAgentEvidence>();
  for (const result of results) {
    if (result.opportunity_id) {
      const item = options.opportunities.find((row) => row.id === result.opportunity_id);
      if (item) for (const evidence of extractFactsFromPool(result, item, options.sources, options.translations ?? [], now)) uniqueEvidence.set(evidence.evidence_id, evidence);
    }
  }
  for (const [id, evidence] of evidences) uniqueEvidence.set(id, evidence);
  const turnResults = new Map(results.map((result) => [result.result_ref, result]));
  const compare = request.compare_result_refs?.length ? results.filter((result) => request.compare_result_refs?.includes(result.result_ref)).map((result) => ({ result_ref: result.result_ref, title_zh: result.title_zh, opportunity_type: result.opportunity_type, deadline: result.deadline_fact, money: result.money_facts, eligibility: result.eligibility_facts, work_requirements: result.work_requirements, key_gap: result.key_gap })) : undefined;
  const allCount = results.length;
  const snapshot = crypto.createHash("sha256").update(`${options.opportunities.length}|${options.sources.length}|${options.opportunities.map((item) => `${item.id}:${item.last_seen_at}`).join("|")}`).digest("hex").slice(0, 20);
  const externalEnabled = shouldUseTools;
  const response: IchAgentTurnResponse = {
    schema_version: "chanceping-ich-agent.v1", request_id: request.request_id, turn_id: turnId, parent_turn_id: request.parent_turn_id ?? previousTurn?.turn_id ?? null,
    snapshot_id: snapshot, as_of: now.toISOString(), understood_constraints: constraints,
    assumptions: ["地区偏好不等于法定申请资格。", "没有安全的结构化证据时，费用、资格和作品要求保持待核。"], clarification_question: null,
    tool_receipt: receipt, results, ...(compare?.length ? { comparison: compare } : {}), evidences: [...uniqueEvidence.values()],
    remaining_result_count: Math.max(0, allCount - Math.min(3, results.length)), partial_failures: [...new Set(partialFailures)],
    fallback_mode: receipt.chat_calls === 0 && receipt.search_calls === 0 && receipt.fetch_calls === 0 ? (partialFailures.length ? "library_only" : "template_only") : "none",
    notice: notifyText({ mode, receipt, partialFailures, results, externalEnabled }),
  };
  session.constraints = constraints;
  const resultsByRef = new Map(results.map((result) => [result.result_ref, result]));
  return { response, resultsByRef, evidencesById: uniqueEvidence };
}
