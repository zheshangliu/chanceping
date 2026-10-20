import { DEFAULT_ICH_AGENT_CONSTRAINTS, type IchAgentConstraints, type IchAgentMode, type IchAgentQueryRequest } from "./contracts";

const CRAFT_TERMS = ["押花", "压花", "扎染", "蜡染", "刺绣", "漆器", "漆艺", "木雕", "竹编", "藤编", "剪纸", "皮影", "陶瓷", "陶艺", "银饰", "玉雕", "编织", "织锦", "手工艺", "工艺美术", "非遗", "文创"];
const TYPE_MATCHERS: Array<[string, RegExp]> = [
  ["competition", /比赛|赛事|大赛|竞赛|征集|征稿|参赛|报名/u],
  ["procurement_project", /采购|订单|招标|投标|供应商征集/u],
  ["exhibition_market", /市集|展销|展会|摆摊|参展/u],
  ["policy_funding", /资助|补贴|基金|扶持|奖学金/u],
  ["channel_collaboration", /合作|联名|渠道|入驻|选品/u],
  ["international", /驻地|研修|培训|交流|国际/u],
];
const LOCATIONS = ["广州", "广东", "深圳", "杭州", "北京", "上海", "云南", "四川", "福建", "浙江", "江苏", "中国", "国内", "海外", "全球", "香港", "澳门", "台湾"];
const STOP = new Set(["我", "想", "找", "看看", "帮我", "请问", "最近", "当前", "现在", "可以", "适合", "有没有", "需要", "想要", "机会", "项目", "最好", "优先", "谢谢", "帮我找", "一条", "一些", "还能", "报名", "这个", "那个", "要求", "资料"]);

function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function explicitTimeWindow(message: string): number | null {
  const found = message.match(/(?:未来|近|接下来|最近)(\d{1,3})\s*(?:天|日)/u);
  if (found) return Math.min(365, Math.max(1, Number(found[1])));
  return null;
}

export function sanitizeMessageForLocalParsing(value: string): string {
  return value.normalize("NFKC")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[邮箱已省略]")
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/gu, "[手机号已省略]")
    .replace(/\b\d{17}[\dXx]\b/gu, "[证件号已省略]")
    .replace(/(?:微信|WeChat|WhatsApp|电话|手机|联系我)\s*[:：]?\s*\S+/giu, "[联系信息已省略]")
    .slice(0, 2000);
}

export function sanitizeMessageForExternalUse(value: string): string {
  return sanitizeMessageForLocalParsing(value)
    // Remove common self-identification spans before optional external calls.
    .replace(/我(?:叫|是)\s*[^，,。；;\n]{1,30}/gu, "[个人身份已省略]")
    .slice(0, 2000);
}

export interface InterpretedIchRequest { constraints: IchAgentConstraints; mode: IchAgentMode; search_query: string; needs_model_interpretation: boolean; }

export function interpretIchAgentRequest(input: { message: string; previous?: IchAgentConstraints; requestedMode?: IchAgentMode }): InterpretedIchRequest {
  const message = sanitizeMessageForLocalParsing(input.message).toLowerCase();
  const previous = input.previous ?? DEFAULT_ICH_AGENT_CONSTRAINTS;
  const craft = CRAFT_TERMS.filter((term) => message.includes(term.toLowerCase()));
  const types = TYPE_MATCHERS.filter(([, matcher]) => matcher.test(message)).map(([type]) => type);
  const foundLocations = LOCATIONS.filter((term) => message.includes(term.toLowerCase()));
  let region = previous.region;
  if (/只看国内|只要国内|国内机会|中国大陆|中国境内/u.test(message)) region = "CN";
  else if (/只看海外|只要海外|海外机会|全球范围/u.test(message)) region = "GLOBAL";
  else if (/不限制地区|不限地区|所有地区|国内外/u.test(message)) region = "all";
  const budgetPreference = /只要免费|只看免费|必须免费|完全免费|不想付费|不能花钱|不要收费/u.test(message) ? "free_only" : /低成本|预算有限|少花钱/u.test(message) ? "low_cost" : previous.budget_preference;
  const onlineOnly = /只要线上|必须线上|线上提交|在线参与/u.test(message) ? true : /线下也可以|线上线下都可以/u.test(message) ? false : previous.online_only;
  const exclusions = unique([...(previous.explicit_exclusions ?? []), ...[...message.matchAll(/(?:不要|排除|不看|不考虑)\s*([\p{L}\p{N}]{2,12})/gu)].map((match) => match[1])]);
  const constraints: IchAgentConstraints = {
    craft_terms: craft.length ? unique(craft) : [...previous.craft_terms],
    opportunity_types: types.length ? unique(types) : [...previous.opportunity_types],
    location_terms: foundLocations.length ? unique(foundLocations) : [...previous.location_terms],
    region,
    within_days: explicitTimeWindow(message) ?? previous.within_days,
    budget_preference: budgetPreference,
    online_only: onlineOnly,
    explicit_exclusions: exclusions.slice(-8),
  };
  const mode: IchAgentMode = input.requestedMode === "library" || input.requestedMode === "web" || input.requestedMode === "auto"
    ? input.requestedMode
    : /只看库里|只查已收录|不要联网/u.test(message) ? "library" : /联网|网上|最新|补查/u.test(message) ? "web" : "auto";
  const typeLabels: Record<string, string> = { competition: "赛事", procurement_project: "采购订单", exhibition_market: "市集展销", policy_funding: "资助补贴", channel_collaboration: "渠道合作", international: "国际研修" };
  const queryParts = unique([
    ...constraints.craft_terms,
    ...constraints.opportunity_types.map((type) => typeLabels[type] ?? type),
    ...constraints.location_terms,
    ...(constraints.region === "CN" ? ["中国"] : constraints.region === "GLOBAL" ? ["海外"] : []),
    ...(constraints.budget_preference === "free_only" ? ["免费"] : []),
    ...(constraints.online_only ? ["线上"] : []),
    "非遗 手工艺 文创",
    "2026",
  ]).filter((part) => !STOP.has(part));
  const searchQuery = sanitizeMessageForExternalUse(queryParts.join(" ")).trim().slice(0, 128);
  const hasClearIntent = constraints.craft_terms.length > 0 || constraints.opportunity_types.length > 0 || constraints.location_terms.length > 0;
  return { constraints, mode, search_query: searchQuery || "非遗 手工艺 文创 机会 2026", needs_model_interpretation: !hasClearIntent };
}

export function validateInterpretedMode(value: unknown): value is IchAgentMode { return value === "auto" || value === "library" || value === "web"; }

export function readAgentRequest(value: unknown): IchAgentQueryRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.message !== "string" || body.message.trim().length === 0 || body.message.length > 2000) return null;
  const requestId = typeof body.request_id === "string" && /^[A-Za-z0-9_-]{8,80}$/u.test(body.request_id) ? body.request_id : "";
  if (!requestId) return null;
  const token = typeof body.conversation_token === "string" && /^[A-Za-z0-9_-]{32,100}$/u.test(body.conversation_token) ? body.conversation_token : undefined;
  const parent = typeof body.parent_turn_id === "string" && /^[A-Za-z0-9_-]{8,100}$/u.test(body.parent_turn_id) ? body.parent_turn_id : undefined;
  const ref = typeof body.result_ref === "string" && /^[A-Za-z0-9_-]{8,120}$/u.test(body.result_ref) ? body.result_ref : undefined;
  const compare = Array.isArray(body.compare_result_refs) ? body.compare_result_refs.filter((row): row is string => typeof row === "string" && /^[A-Za-z0-9_-]{8,120}$/u.test(row)).slice(0, 3) : undefined;
  const mode = validateInterpretedMode(body.mode) ? body.mode : undefined;
  return { request_id: requestId, message: body.message.trim(), ...(token ? { conversation_token: token } : {}), ...(parent ? { parent_turn_id: parent } : {}), ...(ref ? { result_ref: ref } : {}), ...(compare ? { compare_result_refs: compare } : {}), ...(mode ? { mode } : {}) };
}
