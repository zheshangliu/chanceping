import crypto from "node:crypto";
import type { StoreEntry } from "../agents/opportunity-store";
import type { OpportunityCard } from "../schema/opportunity-card";
import {
  AI_EVENT_SOURCE_NETWORK,
  getPublicAiEventSampleRoomData,
  type AiEventCategory,
  type AiEventCategoryFacet,
  type AiEventCategoryId,
  type AiEventMode,
  type AiEventImageStatus,
  type AiEventOrganizerType,
  type AiEventParticipantType,
  type AiEventRewardType,
  type AiEventSourceType,
  type PublicAiEventCandidate,
  type PublicAiEventSampleRoomData,
} from "../demo/ai-events-sample-room";
import {
  extractAiEventPageMetadata,
  isUsableAiEventImageUrl,
  type AiEventPageMetadata,
} from "./ai-event-page-metadata";

const DEFAULT_COVER_IMAGE_URL = "/assets/ai-event-placeholder.svg";
const PUBLIC_AI_EVENTS_UPDATE_CADENCE_DAYS = 3;
const NON_PUBLIC_STATUSES = new Set(["archived", "dismissed"]);
const HISTORICAL_STATUSES = new Set(["expired", "missed"]);
const LOW_VALUE_LEVELS = new Set(["hidden", "D"]);
const LOW_ACTION_PUBLIC_DOMAINS = /(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)facebook\.com$|(^|\.)instagram\.com$|(^|\.)linkedin\.com$|(^|\.)wikipedia\.org$|(^|\.)baike\.baidu\.com$|(^|\.)olympics\.com$/i;
const INTERNAL_OR_MOCK_TEXT = /Mock\s*模式|mock\s+mode|demo\s+source|乒乓球赛事|亚搏推广/i;
const ENGINEERING_TAGS = /^(direct_opportunity|business_lead|channel_partner_lead|customer_lead|source_entry|watch_signal|reference_case|custom|[SABC](?:1|级)?)$/i;
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;

export type PublicAiEventSource = "database" | "sample_room_seed";
export type PublicAiEventLifecycle = "current" | "historical";
export type PublicAiEventRegionGroup =
  | "global_online"
  | "china_gba"
  | "china"
  | "north_america"
  | "europe"
  | "asia_pacific"
  | "other";
export type PublicAiEventDeadlineWindow = "7d" | "30d" | "60d" | "90d" | "later" | "unknown";

export interface PublicAiEventFacet {
  id: string;
  label: string;
  labelEn: string;
  count: number;
}

export const AI_EVENT_CATEGORIES: AiEventCategory[] = [
  { id: "ai_agent", label: "AI Agent / 智能体", labelEn: "AI Agent" },
  { id: "vibe_coding", label: "Vibe Coding / AI 编程", labelEn: "Vibe Coding" },
  { id: "ai_app", label: "AI 应用 / 项目", labelEn: "AI Apps" },
  { id: "aigc_creator", label: "AIGC 内容 / 自媒体", labelEn: "AIGC Creator" },
  { id: "ai_game", label: "AI 游戏 / NPC", labelEn: "AI Game" },
  { id: "data_science", label: "数据科学 / 模型挑战", labelEn: "Data & Models" },
  { id: "robotics_edge", label: "机器人 / 具身 / 边缘 AI", labelEn: "Robotics & Edge" },
  { id: "cloud_startup", label: "云资源 / 创业扶持", labelEn: "Cloud & Startup" },
  { id: "ai_hackathon", label: "AI Hackathon / 黑客松", labelEn: "AI Hackathon" },
];

const AI_EVENT_CATEGORY_BY_ID = new Map(AI_EVENT_CATEGORIES.map((category) => [category.id, category]));
const CATEGORY_PRIORITY: AiEventCategoryId[] = [
  "ai_agent",
  "vibe_coding",
  "ai_app",
  "aigc_creator",
  "ai_game",
  "data_science",
  "robotics_edge",
  "cloud_startup",
  "ai_hackathon",
];

const AI_EVENT_REGION_GROUPS: Array<{ id: PublicAiEventRegionGroup; label: string; labelEn: string }> = [
  { id: "global_online", label: "全球线上", labelEn: "Global / Online" },
  { id: "china_gba", label: "大湾区 / 港澳", labelEn: "GBA / Hong Kong / Macau" },
  { id: "china", label: "中国内地", labelEn: "Mainland China" },
  { id: "north_america", label: "北美", labelEn: "North America" },
  { id: "europe", label: "欧洲", labelEn: "Europe" },
  { id: "asia_pacific", label: "亚太", labelEn: "Asia Pacific" },
  { id: "other", label: "其他地区", labelEn: "Other" },
];

const AI_EVENT_DEADLINE_WINDOWS: Array<{ id: PublicAiEventDeadlineWindow; label: string; labelEn: string }> = [
  { id: "7d", label: "7 天内截止", labelEn: "Due in 7 days" },
  { id: "30d", label: "30 天内截止", labelEn: "Due in 30 days" },
  { id: "60d", label: "60 天内截止", labelEn: "Due in 60 days" },
  { id: "90d", label: "90 天内截止", labelEn: "Due in 90 days" },
  { id: "later", label: "90 天后", labelEn: "Later" },
  { id: "unknown", label: "截止待查", labelEn: "Deadline unknown" },
];

const REGION_GROUP_LABELS = Object.fromEntries(AI_EVENT_REGION_GROUPS.map((item) => [item.id, item.label])) as Record<PublicAiEventRegionGroup, string>;
const DEADLINE_WINDOW_LABELS = Object.fromEntries(AI_EVENT_DEADLINE_WINDOWS.map((item) => [item.id, item.label])) as Record<PublicAiEventDeadlineWindow, string>;

export interface BuildPublicAiEventFeedOptions {
  lifecycle?: PublicAiEventLifecycle | "all";
  category?: AiEventCategoryId | "all" | string;
  region?: PublicAiEventRegionGroup | "all" | string;
  reward?: AiEventRewardType | "all" | string;
  deadlineWindow?: PublicAiEventDeadlineWindow | "all" | string;
  page?: number;
  pageSize?: number;
  now?: string | Date;
}

export interface PublicAiEventCard extends PublicAiEventCandidate {
  coverImageUrl: string;
  imageSourceUrl: string;
  imageAlt: string;
  imageStatus: AiEventImageStatus;
  imageAttribution: string;
  prize: string;
  benefits: string[];
  organizer: string;
  registrationUrl: string;
  region: string;
  language: string;
  eventType: string;
  audience: string;
  eventMode: AiEventMode;
  eventModeLabel: string;
  participantTypes: AiEventParticipantType[];
  participantTypeLabel: string;
  rewardTypes: AiEventRewardType[];
  rewardTypeLabel: string;
  organizerType: AiEventOrganizerType;
  organizerTypeLabel: string;
  regionGroup: PublicAiEventRegionGroup;
  regionGroupLabel: string;
  deadlineWindow: PublicAiEventDeadlineWindow;
  deadlineWindowLabel: string;
  knownFields: string[];
  missingFields: string[];
  fieldCompleteness: number;
  lifecycleStatus: PublicAiEventLifecycle;
  deadlineSortKey: string;
  deadlineDisplay: string;
  publicSource: PublicAiEventSource;
  primaryCategory: AiEventCategory;
  categoryTags: AiEventCategory[];
}

export interface PublicAiEventFeed extends Omit<PublicAiEventSampleRoomData, "items"> {
  items: PublicAiEventCard[];
  stats: PublicAiEventSampleRoomData["stats"] & {
    databaseCount: number;
    seedCount: number;
    totalCount: number;
    currentCount: number;
    historicalCount: number;
    filteredCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    categoryFacets: AiEventCategoryFacet[];
    regionFacets: PublicAiEventFacet[];
    rewardFacets: PublicAiEventFacet[];
    deadlineWindowFacets: PublicAiEventFacet[];
    imageCoverageCount: number;
    officialSourceCount: number;
    aggregatorSourceCount: number;
  };
}

function hashStableId(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function normalizeUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return raw.replace(/\/$/, "").toLowerCase();
  }
}

function getDomain(urlOrDomain: string): string {
  if (!urlOrDomain) return "";
  try {
    return new URL(urlOrDomain).hostname.replace(/^www\./, "");
  } catch {
    return urlOrDomain.replace(/^https?:\/\//, "").split("/")[0]?.replace(/^www\./, "") ?? "";
  }
}

function getPlatformCoverImageUrl(input: {
  officialUrl?: string;
  sourceDomain?: string;
  sourceName?: string;
  title?: string;
  sourceType?: string;
}): string {
  const domain = getDomain(input.officialUrl || input.sourceDomain || "").toLowerCase();
  const text = `${domain} ${input.officialUrl ?? ""} ${input.sourceName ?? ""} ${input.title ?? ""} ${input.sourceType ?? ""}`.toLowerCase();
  if (/devpost\.com/.test(text)) return "/assets/ai-event-cover-devpost.svg";
  if (/dorahacks\.io/.test(text)) return "/assets/ai-event-cover-dorahacks.svg";
  if (/lablab\.ai/.test(text)) return "/assets/ai-event-cover-lablab.svg";
  if (/kaggle\.com/.test(text)) return "/assets/ai-event-cover-kaggle.svg";
  if (/trae\.ai|trae|vibe\s*coding/.test(text)) return "/assets/ai-event-cover-trae.svg";
  if (/mlh\.io|mlh\.com|major\s+league\s+hacking/.test(text)) return "/assets/ai-event-cover-mlh.svg";
  if (/tapnow\.com|tapnow\.ai|pika\.art|kling\.ai|klingai\.com|vidu\.com|pixverse\.ai|ai\s+video|aigc\s+video/.test(text)) return "/assets/ai-event-cover-aigc-video.svg";
  if (/dreamina|jianying|jimeng|即梦|剪映/.test(text)) return "/assets/ai-event-cover-dreamina.svg";
  if (/volcengine|火山引擎|coze|豆包/.test(text)) return "/assets/ai-event-cover-volcengine.svg";
  if (/cloud\.tencent\.com|tencent\s+cloud|腾讯云/.test(text)) return "/assets/ai-event-cover-tencent-cloud.svg";
  if (/kdd\.org|kdd\s*cup/.test(text)) return "/assets/ai-event-cover-competition.svg";
  if (/aicrowd\.com|aicrowd/.test(text)) return "/assets/ai-event-cover-aicrowd.svg";
  if (/codabench\.org|codalab\.org|codabench|codalab/.test(text)) return "/assets/ai-event-cover-codabench.svg";
  if (/eval\.ai|evalai/.test(text)) return "/assets/ai-event-cover-evalai.svg";
  if (/grand-challenge\.org|grand\s+challenge/.test(text)) return "/assets/ai-event-cover-grandchallenge.svg";
  if (/mlcontests\.com|ml\s*contests/.test(text)) return "/assets/ai-event-cover-mlcontests.svg";
  if (/xfyun\.cn|iflytek|科大讯飞|讯飞/.test(text)) return "/assets/ai-event-cover-xfyun.svg";
  if (/projectodyssey\.ai|project\s*odyssey/.test(text)) return "/assets/ai-event-cover-project-odyssey.svg";
  if (/reply\.com|reply\s+ai\s+film/.test(text)) return "/assets/ai-event-cover-reply.svg";
  if (/filmfreeway\.com|filmfreeway/.test(text)) return "/assets/ai-event-cover-filmfreeway.svg";
  if (/modelscope\.cn|modelscope|魔搭/.test(text)) return "/assets/ai-event-cover-modelscope.svg";
  if (/opendatalab\.com|open\s*data\s*lab|opendatalab/.test(text)) return "/assets/ai-event-cover-opendatalab.svg";
  if (/datawhale|coggle/.test(text)) return "/assets/ai-event-cover-community.svg";
  if (/runwayml\.com|runway/.test(text)) return "/assets/ai-event-cover-runway.svg";
  if (/openhackathons\.org|open\s*hackathons/.test(text)) return "/assets/ai-event-cover-openhackathons.svg";
  if (/challenge\.gov|\.gov\b|政府|科技局|工信|公共机构/.test(text)) return "/assets/ai-event-cover-competition.svg";
  if (/\.edu\b|\.edu\.cn\b|university|college|school|academy|institute|高校|大学|学院|研究院/.test(text)) return "/assets/ai-event-cover-competition.svg";
  if (/cloud|qwen|aliyun|tencent|huaweicloud|aws|azure|google\s*cloud|microsoft|ibm/.test(text)) return "/assets/ai-event-cover-cloud.svg";
  if (/hackathon|黑客松|马拉松/.test(text)) return "/assets/ai-event-cover-hackathon.svg";
  if (/competition|challenge|contest|比赛|竞赛|挑战/.test(text)) return "/assets/ai-event-cover-competition.svg";
  return "";
}

function normalizePublicText(value: string | undefined | null, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (!raw || /^(9999-12-31|0000-00-00|待复核|needs review|review|unknown|tbd|n\/a|null|undefined)$/i.test(raw)) return fallback;
  return raw
    .replace(/待复核/g, fallback)
    .replace(/需自行复核/g, "请以官方页面确认")
    .replace(/需要打开官方来源复核/g, "建议打开官方来源确认")
    .replace(/进一步复核/g, "进一步确认")
    .replace(/字段仍需复核/g, "字段以官方页面为准")
    .replace(/复核/g, "确认")
    .replace(/needs review/gi, fallback)
    .replace(/review required/gi, fallback);
}

export function normalizePublicReward(value: string | undefined | null, fallback = "见官网"): string {
  const normalized = normalizePublicText(value, fallback);
  if (!normalized || normalized === fallback) return fallback;
  const genericNews = /本报讯|报道称|报道|嘉宾|产业|政策|背景|交流活动|现场|观众|发言|启幕|发布会|活动现场/i;
  const concreteReward = /(\$|￥|\bUSD\b|\bRMB\b|\bUSDT\b|(?:\d+\s*)?(?:百万|千万|亿元)|\d+\s*(?:万|万元|元|k|K|m|M|million|billion)|prize\s*pool|cash\s*prize|cash|cloud\s*credits?|API\s*credits?|credits?|云资源|算力|奖池|奖金池|展映|showcase\s+opportunit)/i;
  const moneyOrPrizePool = /(\$|￥|\bUSD\b|\bRMB\b|\bUSDT\b|(?:\d+\s*)?(?:百万|千万|亿元)|\d+\s*(?:万|万元|元|k|K|m|M|million|billion)|prize\s*pool|cash\s*prize|cash|奖池|奖金池)/i;
  const negatedReward = /没有(?:直接)?给出明确|未(?:直接)?给出明确|没有(?:直接)?列出明确|未(?:直接)?列出明确|没有公布|未公布|未披露|not\s+disclosed|not\s+announced/i;
  const platformIntro = /平台|社区|汇聚|举办|培养|开发者|赛事生态|competition\s+platform|developer\s+community/i;
  const summarizeReward = (text: string): string => {
    // Keep a concrete amount such as "$25,000 prize pool". Collapsing it to
    // the generic word "奖金" makes a public event card materially less useful.
    const moneyPhrase = text.match(/(?:(?:US\$|USD|RMB|USDT|\$|￥)\s*)?\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*(?:k|K|m|M|million|billion|万|万元|元)?\s*(?:奖金池|奖池|奖金|cash\s*prize|prize\s*pool|USD|RMB|USDT)?|(?:\$|￥)\s*\d+(?:\.\d+)?\s*(?:k|K|m|M|million|billion|万|万元|元)?\s*(?:奖金池|奖池|奖金|cash\s*prize|prize\s*pool)?|(?:\d+(?:\.\d+)?\s*(?:万|万元|元|k|K|m|M|million|billion)|百万|千万)\s*(?:奖金池|奖池|奖金|cash\s*prize|prize\s*pool)?/i)?.[0]?.trim();
    const moneyLabel = moneyPhrase
      ? (/奖|prize|cash/i.test(moneyPhrase) ? moneyPhrase.replace(/\s+/g, " ") : "奖金")
      : "";
    const labels = [
      moneyLabel,
      /(cloud\s*credits?|API\s*credits?|credits?|云资源|算力|GPU|云代金券)/i.test(text) ? "云资源" : "",
      /(showcase|展示|曝光|展映|上架|Demo\s*Day)/i.test(text) ? "展示机会" : "",
      /(grant|扶持|孵化|导师|accelerat|incubat)/i.test(text) ? "创业扶持" : "",
      /(社区|community|membership)/i.test(text) ? "社区资源" : "",
      /(证书|certificate|badge)/i.test(text) ? "证书" : "",
    ].filter(Boolean);
    return Array.from(new Set(labels)).slice(0, 3).join(" / ");
  };
  if (negatedReward.test(normalized)) return fallback;
  if (normalized.length > 80 && /upcoming|browse|events?|sessions?|programs?|event\s+pages|目录|列表|页面|活动页|议程/i.test(normalized) && !moneyOrPrizePool.test(normalized)) {
    return fallback;
  }
  if (normalized.length > 40 && concreteReward.test(normalized)) {
    const summarized = summarizeReward(normalized);
    if (summarized) return summarized;
  }
  if (genericNews.test(normalized) && !concreteReward.test(normalized)) return fallback;
  if (genericNews.test(normalized) && normalized.length > 80) return fallback;
  if (platformIntro.test(normalized) && normalized.length > 70) {
    const summarized = summarizeReward(normalized);
    return summarized || fallback;
  }
  if (normalized.length > 60 && !moneyOrPrizePool.test(normalized)) return fallback;
  if (normalized.length > 80) return fallback;
  return normalized;
}

function normalizeReferenceDate(value: string | Date | undefined): Date {
  const input = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(input.getTime())) {
    const fallback = new Date();
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  }
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const DEADLINE_CUE_RE = /截止|报名|提交|申请|赛程|参赛|大赛|比赛|黑客松|马拉松|deadline|due|close|closes|closing|ends|ending|submit|submission|apply|application|before|until|by|hackathon|challenge|contest|competition/i;

function makeLocalDate(year: number, month: number, day: number): Date | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function parseDeadlineDate(value: string | undefined | null, referenceDate = normalizeReferenceDate(undefined)): Date | null {
  const text = String(value ?? "").trim();
  if (!text || /待复核|持续|按年度|见官网|TBD|unknown/i.test(text)) return null;
  const fullNumeric = text.match(/(20\d{2})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);
  if (fullNumeric) {
    const date = makeLocalDate(Number(fullNumeric[1]), Number(fullNumeric[2]), Number(fullNumeric[3]));
    if (date) return date;
  }

  const monthFirst = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*)?(20\d{2})?\b/i);
  if (monthFirst) {
    const month = MONTH_NAME_TO_NUMBER[monthFirst[1].toLowerCase().replace(/\.$/, "")];
    const year = Number(monthFirst[3] ?? referenceDate.getFullYear());
    const date = makeLocalDate(year, month, Number(monthFirst[2]));
    if (date) return date;
  }

  const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:,\s*)?(20\d{2})?\b/i);
  if (dayFirst) {
    const month = MONTH_NAME_TO_NUMBER[dayFirst[2].toLowerCase().replace(/\.$/, "")];
    const year = Number(dayFirst[3] ?? referenceDate.getFullYear());
    const date = makeLocalDate(year, month, Number(dayFirst[1]));
    if (date) return date;
  }

  if (!DEADLINE_CUE_RE.test(text)) return null;
  const monthDayMatches = Array.from(text.matchAll(/(?:^|[^\d])(\d{1,2})(?:[.\/]|月)(\d{1,2})(?:日)?(?!\d)/g));
  for (const match of monthDayMatches.reverse()) {
    const date = makeLocalDate(referenceDate.getFullYear(), Number(match[1]), Number(match[2]));
    if (date) return date;
  }
  return null;
}

function formatDateKey(date: Date | null, lifecycle: PublicAiEventLifecycle): string {
  if (!date) return lifecycle === "current" ? "9999-12-31" : "0000-00-00";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = String(dateKey || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateKey(date, "current");
}

function inferLifecycle(input: {
  title?: string;
  status?: string;
  deadline?: string;
  evidenceStatus?: string;
  candidateType?: string;
}, referenceDate: Date): PublicAiEventLifecycle {
  if (/已截止|已结束|报名结束|closed|ended|past event|archive/i.test(String(input.title ?? ""))) return "historical";
  if (HISTORICAL_STATUSES.has(String(input.status ?? ""))) return "historical";
  if (input.evidenceStatus === "historical_reference" || input.candidateType === "reference_case") return "historical";
  const deadlineDate = parseDeadlineDate(input.deadline, referenceDate);
  if (deadlineDate && deadlineDate.getTime() < referenceDate.getTime()) return "historical";
  return "current";
}

function resolvePublicDeadline(input: {
  rawDeadline?: string | null;
  context: Array<string | undefined | null>;
  referenceDate: Date;
}): { deadlineDate: Date | null; deadlineDisplay: string } {
  const explicitDate = parseDeadlineDate(input.rawDeadline, input.referenceDate);
  if (explicitDate) {
    return {
      deadlineDate: explicitDate,
      deadlineDisplay: formatDateKey(explicitDate, "current"),
    };
  }
  const contextText = compactStrings(input.context).join(" ");
  const inferredDate = parseDeadlineDate(contextText, input.referenceDate);
  if (inferredDate) {
    return {
      deadlineDate: inferredDate,
      deadlineDisplay: formatDateKey(inferredDate, "current"),
    };
  }
  return {
    deadlineDate: null,
    deadlineDisplay: normalizePublicText(input.rawDeadline, "见官网"),
  };
}

function inferSourceType(domain: string, typeText: string): AiEventSourceType {
  const sourceText = `${domain} ${typeText}`.toLowerCase();
  if (/devpost|dorahacks|lablab|hackathon/.test(sourceText)) return "hackathon_platform";
  if (/kaggle|aicrowd|tianchi|datafountain|drivendata|zindi|codalab|codabench|eval\.ai|grand-challenge|topcoder|hackerearth|analyticsvidhya|competehub|mlcontests|competition|竞赛|比赛|讯飞|xfyun|aistudio/.test(sourceText)) return "competition_platform";
  if (/cloud|aws|azure|google|microsoft|aliyun|tencent|huawei|huaweicloud|云/.test(sourceText)) return "cloud_provider";
  if (/neurips|cvpr|iclr|conference|学术/.test(sourceText)) return "academic_conference";
  if (/runway|creator|aigc|创作/.test(sourceText)) return "creator_platform";
  return "developer_community";
}

function resolveCategory(id: AiEventCategoryId): AiEventCategory {
  return AI_EVENT_CATEGORY_BY_ID.get(id) ?? AI_EVENT_CATEGORIES[2];
}

function normalizeCategoryId(value: string | undefined): AiEventCategoryId | "all" {
  if (!value || value === "all") return "all";
  return AI_EVENT_CATEGORY_BY_ID.has(value as AiEventCategoryId) ? value as AiEventCategoryId : "all";
}

function normalizeRegionFilter(value: string | undefined): PublicAiEventRegionGroup | "all" {
  if (!value || value === "all") return "all";
  return AI_EVENT_REGION_GROUPS.some((group) => group.id === value) ? value as PublicAiEventRegionGroup : "all";
}

function normalizeRewardFilter(value: string | undefined): AiEventRewardType | "all" {
  if (!value || value === "all") return "all";
  return Object.prototype.hasOwnProperty.call(REWARD_TYPE_LABELS, value) ? value as AiEventRewardType : "all";
}

function normalizeDeadlineWindowFilter(value: string | undefined): PublicAiEventDeadlineWindow | "all" {
  if (!value || value === "all") return "all";
  return AI_EVENT_DEADLINE_WINDOWS.some((window) => window.id === value) ? value as PublicAiEventDeadlineWindow : "all";
}

function compactCategoryTags(ids: AiEventCategoryId[]): AiEventCategory[] {
  const seen = new Set<AiEventCategoryId>();
  const ordered = ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return ordered.map(resolveCategory);
}

function inferCategoryIds(input: {
  title: string;
  sourceDomain: string;
  sourceType: AiEventSourceType;
  type?: string;
  organizer?: string;
  region?: string;
  reward?: string;
  reason?: string;
  tags?: string[];
}): AiEventCategory[] {
  const text = [
    input.title,
    input.sourceDomain,
    input.sourceType,
    input.type,
    input.organizer,
    input.region,
    input.reward,
    input.reason,
    ...(input.tags ?? []),
  ].join(" ");
  const ids: AiEventCategoryId[] = [];
  const add = (id: AiEventCategoryId, pattern: RegExp): void => {
    if (pattern.test(text)) ids.push(id);
  };

  add("ai_agent", /\bAI\s*Agent\b|\bAgentic\b|\bAgent\b|智能体|多智能体|multi[-\s]?agent|RAG|LLM|大模型|Qwen|Claude|GPT|Gemini|Autopilot|MemoryAgent/i);
  add("vibe_coding", /Vibe\s*Coding|AI\s*IDE|coding|code|developer\s*tool|编程|代码|开发者工具|TRAE|Cursor|Kiro|Windsurf|copilot/i);
  add("aigc_creator", /AIGC|creator|content|自媒体|短视频|视频|film|movie|music|音乐|image|图像|design|设计|创作|Runway|AI\s*Film|生成式视频/i);
  add("ai_game", /game|gaming|游戏|NPC|Game\s*Jam|simulation|simulator|仿真|Minecraft|Roblox/i);
  add("data_science", /Kaggle|AIcrowd|dataset|benchmark|leaderboard|CVPR|NeurIPS|ICLR|KDD|algorithm|算法|数据|computer\s*vision|机器学习|machine\s*learning|模型挑战|challenge\s*track/i);
  add("robotics_edge", /robot|robotics|具身|embodied|edge|边缘|IoT|LeRobot|无人机|RoboCup|hardware|硬件/i);
  add("cloud_startup", /cloud|云资源|云厂商|startup|创业|credits?|扶持|accelerator|incubator|grant|AWS|Azure|Google\s*Cloud|Microsoft|阿里云|腾讯云|华为云|Qwen\s*Cloud/i);
  add("ai_hackathon", /hackathon|黑客松|马拉松|Devpost|DoraHacks|lablab|hack\s*day|buildathon|jam/i);
  add("ai_app", /AI\s*App|application|应用|项目|product|产品|tool|工具|showcase|展示|SaaS|MVP/i);

  if (ids.length === 0) ids.push(input.sourceType === "competition_platform" ? "data_science" : "ai_app");
  const prioritySet = new Set(ids);
  return compactCategoryTags([
    ...CATEGORY_PRIORITY.filter((id) => prioritySet.has(id)),
    ...ids,
  ]);
}

function hasCategory(card: PublicAiEventCard, category: AiEventCategoryId | "all"): boolean {
  if (category === "all") return true;
  return card.primaryCategory.id === category || card.categoryTags.some((tag) => tag.id === category);
}

function buildCategoryFacets(items: PublicAiEventCard[]): AiEventCategoryFacet[] {
  return AI_EVENT_CATEGORIES
    .map((category) => ({
      ...category,
      count: items.filter((item) => hasCategory(item, category.id)).length,
    }))
    .filter((facet) => facet.count > 0);
}

function buildRegionFacets(items: PublicAiEventCard[]): PublicAiEventFacet[] {
  return AI_EVENT_REGION_GROUPS
    .map((group) => ({
      ...group,
      count: items.filter((item) => item.regionGroup === group.id).length,
    }))
    .filter((facet) => facet.count > 0);
}

function buildRewardFacets(items: PublicAiEventCard[]): PublicAiEventFacet[] {
  return (Object.keys(REWARD_TYPE_LABELS) as AiEventRewardType[])
    .map((id) => ({
      id,
      label: REWARD_TYPE_LABELS[id],
      labelEn: id.replace(/_/g, " "),
      count: items.filter((item) => item.rewardTypes.includes(id)).length,
    }))
    .filter((facet) => facet.count > 0);
}

function buildDeadlineWindowFacets(items: PublicAiEventCard[]): PublicAiEventFacet[] {
  return AI_EVENT_DEADLINE_WINDOWS
    .map((window) => ({
      ...window,
      count: items.filter((item) => item.deadlineWindow === window.id).length,
    }))
    .filter((facet) => facet.count > 0);
}

function hasRegionGroup(card: PublicAiEventCard, region: PublicAiEventRegionGroup | "all"): boolean {
  return region === "all" || card.regionGroup === region;
}

function hasRewardType(card: PublicAiEventCard, reward: AiEventRewardType | "all"): boolean {
  return reward === "all" || card.rewardTypes.includes(reward);
}

function hasDeadlineWindow(card: PublicAiEventCard, deadlineWindow: PublicAiEventDeadlineWindow | "all"): boolean {
  if (deadlineWindow === "all") return true;
  if (deadlineWindow === "unknown" || deadlineWindow === "later") return card.deadlineWindow === deadlineWindow;
  const rank: Record<PublicAiEventDeadlineWindow, number> = {
    "7d": 7,
    "30d": 30,
    "60d": 60,
    "90d": 90,
    later: 9999,
    unknown: 10000,
  };
  return rank[card.deadlineWindow] <= rank[deadlineWindow];
}

function inferLanguage(domain: string, text: string): string {
  if (/[一-龥]/.test(text) || /\.cn$|aliyun|tencent|baidu|huaweicloud|trae\.ai/.test(domain)) {
    return "zh";
  }
  return "en";
}

const EVENT_MODE_LABELS: Record<AiEventMode, string> = {
  online: "线上",
  offline: "线下",
  hybrid: "线上 + 线下",
  unknown: "见官网",
};

const PARTICIPANT_TYPE_LABELS: Record<AiEventParticipantType, string> = {
  individual: "个人开发者",
  team: "小团队",
  startup: "创业者 / OPC",
  student: "学生",
  researcher: "研究者",
  creator: "创作者",
  company: "企业 / 机构",
  unknown: "见官网",
};

const REWARD_TYPE_LABELS: Record<AiEventRewardType, string> = {
  cash_prize: "奖金",
  cloud_credits: "云资源",
  showcase: "展示 / 曝光",
  incubation: "创业扶持",
  certificate: "证书",
  publication: "论文 / 榜单",
  community: "社区资源",
  other: "见官网",
};

const ORGANIZER_TYPE_LABELS: Record<AiEventOrganizerType, string> = {
  hackathon_platform: "Hackathon 平台",
  competition_platform: "竞赛平台",
  cloud_provider: "云厂商 / 开发者平台",
  academic_conference: "学术会议",
  creator_platform: "创作平台",
  developer_community: "开发者社区",
  university: "高校 / 研究机构",
  government: "政府 / 公共机构",
  company: "企业主办",
  unknown: "见官网",
};

function compactEnumValues<T extends string>(values: T[], fallback: T): T[] {
  const seen = new Set<T>();
  const result = values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
  return result.length > 0 ? result : [fallback];
}

function labelEnumValues<T extends string>(values: T[], labels: Record<T, string>): string {
  return values
    .map((value) => labels[value])
    .filter((value, index, array) => value && array.indexOf(value) === index)
    .join(" / ") || "见官网";
}

function inferEventMode(text: string): AiEventMode {
  const hasOnline = /线上|在线|online|virtual|remote|全球线上|worldwide|global/i.test(text);
  const hasOffline = /线下|现场|到场|in[-\s]?person|onsite|on[-\s]?site|venue|广州|深圳|香港|澳门|大湾区|北京|上海/i.test(text);
  if (hasOnline && hasOffline) return "hybrid";
  if (hasOnline) return "online";
  if (hasOffline) return "offline";
  return "unknown";
}

function inferParticipantTypes(text: string): AiEventParticipantType[] {
  const values: AiEventParticipantType[] = [];
  const add = (value: AiEventParticipantType, pattern: RegExp): void => {
    if (pattern.test(text)) values.push(value);
  };
  add("individual", /个人|个人开发者|individual|solo|indie|developer|builder/i);
  add("team", /团队|小团队|team|squad|group|小组/i);
  add("startup", /OPC|创业|创业者|startup|founder|indie\s*hacker|maker/i);
  add("student", /学生|高校|大学生|student|university|college|campus/i);
  add("researcher", /研究|学术|论文|research|academic|benchmark|conference|CVPR|NeurIPS|ICLR/i);
  add("creator", /创作者|自媒体|AIGC|视频|film|creator|content|design|music|作品/i);
  add("company", /企业|机构|company|enterprise|organization|团队报名|B2B/i);
  return compactEnumValues(values, "unknown");
}

function inferRewardTypes(text: string): AiEventRewardType[] {
  const values: AiEventRewardType[] = [];
  const add = (value: AiEventRewardType, pattern: RegExp): void => {
    if (pattern.test(text)) values.push(value);
  };
  add("cash_prize", /奖金|现金|奖池|prize|cash|award|USD|\$|￥|元|万|million/i);
  add("cloud_credits", /云资源|credits?|cloud\s*credits|compute|算力|API\s*credit|GPU|云代金券/i);
  add("showcase", /展示|曝光|showcase|demo\s*day|上架|发布|product\s*hunt|展映|作品展示/i);
  add("incubation", /扶持|创业扶持|incubat|accelerat|grant|investment|孵化|投融资|导师/i);
  add("certificate", /证书|certificate|badge|credential/i);
  add("publication", /论文|publication|paper|leaderboard|榜单|排名/i);
  add("community", /社区|community|membership|社群|开发者资源/i);
  return compactEnumValues(values, "other");
}

function inferOrganizerType(sourceType: AiEventSourceType, domain: string, text: string): AiEventOrganizerType {
  if (sourceType === "hackathon_platform" || /devpost|dorahacks|lablab|hackathon/i.test(domain)) return "hackathon_platform";
  if (sourceType === "competition_platform" || /kaggle|aicrowd|tianchi|datafountain|topcoder|zindi|drivendata|codalab/i.test(domain)) return "competition_platform";
  if (sourceType === "cloud_provider" || /aws|azure|google\s*cloud|microsoft|aliyun|tencent|huawei|qwen|cloud|云/i.test(`${domain} ${text}`)) return "cloud_provider";
  if (sourceType === "academic_conference" || /neurips|cvpr|iclr|kdd|conference|学术|会议/i.test(`${domain} ${text}`)) return "academic_conference";
  if (sourceType === "creator_platform" || /runway|creator|aigc|创作|film|video/i.test(`${domain} ${text}`)) return "creator_platform";
  if (/\.edu\b|university|college|高校|大学|学院|研究院/i.test(`${domain} ${text}`)) return "university";
  if (/\.gov\b|政府|科技局|工信|公共机构/i.test(`${domain} ${text}`)) return "government";
  if (sourceType === "developer_community" || /github|huggingface|developer|community|社区/i.test(`${domain} ${text}`)) return "developer_community";
  if (/\.com\b|公司|企业|inc\.|ltd/i.test(`${domain} ${text}`)) return "company";
  return "unknown";
}

function inferRegionGroup(input: {
  region?: string;
  sourceDomain?: string;
  language?: string;
  eventMode?: AiEventMode;
  text?: string;
}): PublicAiEventRegionGroup {
  const text = `${input.region ?? ""} ${input.sourceDomain ?? ""} ${input.language ?? ""} ${input.text ?? ""}`;
  if (/大湾区|粤港澳|广州|深圳|香港|澳门|Hong\s*Kong|Macau|Macao|Guangzhou|Shenzhen|GBA/i.test(text)) return "china_gba";
  if (/中国|中文|内地|北京|上海|杭州|南京|成都|武汉|天池|阿里云|腾讯云|华为云|飞桨|百度|讯飞|\.cn\b|China|Mainland/i.test(text)) return "china";
  if (/North\s*America|United\s*States|\bUSA\b|\bUS\b|Canada|Silicon\s*Valley|San\s*Francisco|New\s*York|北美|美国|加拿大/i.test(text)) return "north_america";
  if (/Europe|\bEU\b|United\s*Kingdom|\bUK\b|Germany|France|Netherlands|London|Berlin|Paris|欧洲|英国|德国|法国/i.test(text)) return "europe";
  if (/Asia\s*Pacific|\bAPAC\b|Japan|Korea|Singapore|India|Indonesia|Vietnam|Thailand|Malaysia|Australia|New\s*Zealand|亚太|日本|韩国|新加坡|印度|东南亚|澳大利亚/i.test(text)) return "asia_pacific";
  if (input.eventMode === "online" || /全球|线上|在线|online|virtual|remote|worldwide|global/i.test(text)) return "global_online";
  return "other";
}

function inferDeadlineWindow(deadlineDate: Date | null, lifecycle: PublicAiEventLifecycle, referenceDate: Date): PublicAiEventDeadlineWindow {
  if (!deadlineDate) return "unknown";
  if (lifecycle === "historical") return "unknown";
  const days = Math.ceil((deadlineDate.getTime() - referenceDate.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  if (days <= 60) return "60d";
  if (days <= 90) return "90d";
  return "later";
}

function buildFieldQuality(input: {
  deadline: string;
  reward: string;
  organizer: string;
  region: string;
  registrationUrl: string;
  audience: string;
  eventMode: AiEventMode;
  participantTypes: AiEventParticipantType[];
  rewardTypes: AiEventRewardType[];
  organizerType: AiEventOrganizerType;
  coverImageUrl: string;
}): { knownFields: string[]; missingFields: string[]; fieldCompleteness: number } {
  const checks: Array<[string, boolean]> = [
    ["截止时间", !/^(见官网|待确认|未知)$/i.test(input.deadline)],
    ["奖励", !/^(见官网|待确认|未知)$/i.test(input.reward)],
    ["主办方", !/^(见官网|官方来源|待识别)$/i.test(input.organizer)],
    ["地区", !/^(见官网|待确认|未知)$/i.test(input.region)],
    ["报名入口", /^https?:\/\//i.test(input.registrationUrl)],
    ["参赛对象", !/^(见官网|待确认|未知)$/i.test(input.audience)],
    ["形式", input.eventMode !== "unknown"],
    ["适合人群", input.participantTypes.some((type) => type !== "unknown")],
    ["奖励类型", input.rewardTypes.some((type) => type !== "other")],
    ["主办类型", input.organizerType !== "unknown"],
    ["赛事图片", input.coverImageUrl !== DEFAULT_COVER_IMAGE_URL],
  ];
  const knownFields = checks.filter(([, known]) => known).map(([label]) => label);
  const missingFields = checks.filter(([, known]) => !known).map(([label]) => label);
  const fieldCompleteness = Math.round((knownFields.length / checks.length) * 100);
  return { knownFields, missingFields, fieldCompleteness };
}

function isAiEventCard(card: OpportunityCard): boolean {
  const text = [
    card.title,
    card.type,
    card.organizer,
    card.region,
    card.reward_or_value,
    card.match_reason,
    card.next_action,
    card.opportunity_kind,
    ...(card.sourceBadges ?? []),
  ].join(" ");
  return /\bAI\b|人工智能|大模型|LLM|Agent|Hackathon|黑客松|算法挑战|开发者挑战|云资源|AIGC|Vibe Coding|AI\s*IDE|Machine Learning|Kaggle|Devpost|DoraHacks|Lablab/i.test(text);
}

function isPublishableStoreEntry(entry: StoreEntry): boolean {
  const card = entry.card;
  if (!card?.official_source_url) return false;
  if (card.is_demo_data) return false;
  if (card.data_mode === "mock") return false;
  if (LOW_VALUE_LEVELS.has(card.visible_level)) return false;
  if (NON_PUBLIC_STATUSES.has(card.status)) return false;
  if (/example\.com|localhost|127\.0\.0\.1/i.test(card.official_source_url)) return false;
  if (LOW_ACTION_PUBLIC_DOMAINS.test(getDomain(card.official_source_url))) return false;
  if (INTERNAL_OR_MOCK_TEXT.test([
    card.title,
    card.match_reason,
    card.fitReason,
    card.next_action,
    card.risk_note,
    ...(card.sourceBadges ?? []),
  ].join(" "))) return false;
  if (entry.radar_type === "ai_competition") return true;
  return isAiEventCard(card);
}

function compactStrings(values: Array<string | undefined | null>): string[] {
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);
}

function compactPublicTags(values: Array<string | undefined | null>): string[] {
  return compactStrings(values)
    .map((value) => normalizePublicText(value, ""))
    .filter((value) => value.length > 0)
    .filter((value) => !ENGINEERING_TAGS.test(value))
    .filter((value, index, array) => array.indexOf(value) === index);
}

function splitBenefits(value: string): string[] {
  if (/^(见官网|待确认|未知)$/i.test(value.trim())) return [];
  const normalized = value.replace(/[；;、，,]/g, "\n");
  return normalized
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function getCachedOfficialPageHtml(card: OpportunityCard): string | undefined {
  const record = card as unknown as Record<string, unknown>;
  const html = record.officialPageHtml
    ?? record.official_page_html
    ?? record.sourcePageHtml
    ?? record.source_page_html
    ?? record.fetchedHtml
    ?? record.fetched_html
    ?? record.pageHtml
    ?? record.page_html;
  return typeof html === "string" && html.trim().length > 0 ? html : undefined;
}

function getCachedOfficialPageMetadata(card: OpportunityCard): AiEventPageMetadata {
  const record = card as unknown as Record<string, unknown>;
  const structured = record.officialPageMetadata ?? record.official_page_metadata;
  if (structured && typeof structured === "object" && !Array.isArray(structured)) {
    return structured as AiEventPageMetadata;
  }
  const html = getCachedOfficialPageHtml(card);
  if (!html || !card.official_source_url) return {};
  return extractAiEventPageMetadata(html, card.official_source_url);
}

function getStoredSourceLogoImage(card: OpportunityCard): string {
  const record = card as unknown as Record<string, unknown>;
  const imageStatus = String(record.imageStatus ?? record.image_status ?? "");
  const coverImageUrl = String(record.coverImageUrl ?? record.cover_image_url ?? "");
  if (imageStatus !== "source_logo" || !/^https?:\/\//i.test(coverImageUrl)) return "";
  return coverImageUrl;
}

function mapEvidenceStatus(card: OpportunityCard): PublicAiEventCard["evidenceStatus"] {
  if (card.evidence_status === "confirmed") return "verified";
  if (card.evidence_status === "partially_verified") return "partially_verified";
  if (card.evidence_status === "unverified") return "unverified";
  return "search_discovered";
}

function mapCandidateType(card: OpportunityCard): PublicAiEventCard["candidateType"] {
  if (card.opportunity_kind && card.opportunity_kind !== "rejected") {
    return card.opportunity_kind;
  }
  return "direct_opportunity";
}

function databasePriority(card: OpportunityCard): number {
  const levelBoost: Record<string, number> = { S: 120, A: 108, B: 94, C: 82, D: 20, hidden: 0 };
  return (levelBoost[card.visible_level] ?? 70) + Math.min(10, Math.max(0, Math.round(card.backend_score / 10)));
}

function sourceTrustPriority(card: PublicAiEventCard): number {
  const text = `${card.title} ${card.sourceDomain} ${card.sourceName} ${card.candidateType} ${card.evidenceStatus} ${card.sourceType}`.toLowerCase();
  let score = 0;
  if (card.candidateType === "direct_opportunity") score += 30;
  if (card.evidenceStatus === "official_entry_to_review" || card.evidenceStatus === "partially_verified" || card.evidenceStatus === "verified") score += 18;
  if (["hackathon_platform", "competition_platform", "cloud_provider", "creator_platform", "academic_conference"].includes(card.sourceType)) score += 10;
  if (/devpost|dorahacks|lablab|kaggle|aicrowd|reply\.com|projectodyssey|heywhale|datafountain|tianchi|xfyun|aistudio|huaweicloud/.test(text)) score += 8;
  if (card.candidateType === "source_entry") score -= 6;
  if (card.candidateType === "watch_signal" || card.candidateType === "reference_case") score -= 22;
  if (/github|awesome|competehub|mlcontests|paperswithcode|arenix|reddit|youtube|facebook|instagram/.test(text)) score -= 28;
  return score;
}

function publicDisplayTier(card: PublicAiEventCard): number {
  const text = `${card.title} ${card.sourceDomain} ${card.sourceName} ${card.candidateType}`.toLowerCase();
  if (/观察源|聚合线索|resources?\b|participants?\b|awesome|directory|github|competehub|mlcontests|paperswithcode|arenix/.test(text)) return 3;
  if (card.candidateType === "watch_signal" || card.candidateType === "reference_case") return 2;
  if (card.candidateType === "source_entry") return 1;
  if (/资源集合|活动列表|赛事入口|竞赛入口|hackathon\s+入口|competition\s+hub|competition\s+platform/.test(text)) return 1;
  return 0;
}

export function projectOpportunityEntryToPublicAiEvent(entry: StoreEntry, options: { now?: Date } = {}): PublicAiEventCard | null {
  if (!isPublishableStoreEntry(entry)) return null;

  const card = entry.card;
  const referenceDate = options.now ?? normalizeReferenceDate(undefined);
  const officialUrl = card.official_source_url.trim();
  const pageMetadata = getCachedOfficialPageMetadata(card);
  const registrationUrl = (pageMetadata.registrationUrl || card.application_url || officialUrl).trim();
  const sourceDomain = getDomain(officialUrl);
  const typeText = `${card.type} ${card.opportunity_kind ?? ""}`;
  const sourceType = inferSourceType(sourceDomain, typeText);
  const rawDeadline = pageMetadata.deadline || card.deadline;
  const rawDeadlineContext = [
    card.title,
    card.type,
    card.organizer,
    card.region,
    card.eligibility,
    card.match_reason,
    card.fitReason,
    card.next_action,
    card.risk_note,
    sourceDomain,
  ];
  const resolvedDeadline = resolvePublicDeadline({
    rawDeadline,
    context: rawDeadlineContext,
    referenceDate,
  });
  const lifecycleStatus = inferLifecycle({
    title: card.title,
    status: card.status,
    deadline: resolvedDeadline.deadlineDisplay,
    evidenceStatus: card.evidence_status,
    candidateType: card.opportunity_kind,
  }, referenceDate);
  const { deadlineDate, deadlineDisplay } = resolvedDeadline;
  const reward = normalizePublicReward(pageMetadata.reward || card.reward_or_value, "见官网");
  const reason = normalizePublicText(card.fitReason || card.match_reason || card.next_action, "这是 AI 赛事雷达发现的公开机会，建议打开官方入口查看报名、截止时间和参赛资格。");
  const storedCoverImageUrl = String((card as unknown as Record<string, unknown>).coverImageUrl ?? (card as unknown as Record<string, unknown>).cover_image_url ?? "");
  const usableStoredCoverImageUrl = isUsableAiEventImageUrl(storedCoverImageUrl, `${card.title} ${card.type} stored cover`)
    ? storedCoverImageUrl
    : "";
  const realCoverImageUrl = usableStoredCoverImageUrl || pageMetadata.coverImageUrl || "";
  const sourceLogoImageUrl = realCoverImageUrl
    ? ""
    : getStoredSourceLogoImage(card) || pageMetadata.brandLogoUrl || "";
  const platformCoverImageUrl = getPlatformCoverImageUrl({
    officialUrl,
    sourceDomain,
    sourceName: card.organizer,
    title: card.title,
    sourceType,
  });
  const coverImageUrl = realCoverImageUrl || sourceLogoImageUrl || platformCoverImageUrl || DEFAULT_COVER_IMAGE_URL;
  const imageSourceUrl = String(
    (usableStoredCoverImageUrl
      ? ((card as unknown as Record<string, unknown>).imageSourceUrl ?? (card as unknown as Record<string, unknown>).image_source_url)
      : undefined)
    ?? pageMetadata.imageSourceUrl
    ?? (sourceLogoImageUrl ? sourceLogoImageUrl : realCoverImageUrl ? coverImageUrl : officialUrl),
  );
  const imageAlt = String((card as unknown as Record<string, unknown>).imageAlt ?? (card as unknown as Record<string, unknown>).image_alt ?? pageMetadata.imageAlt ?? pageMetadata.brandLogoAlt ?? `${card.title} 赛事封面`);
  const imageStatus = (realCoverImageUrl ? "source_image" : sourceLogoImageUrl ? "source_logo" : platformCoverImageUrl ? "platform_placeholder" : "default_placeholder") as AiEventImageStatus;
  const imageAttribution = String((card as unknown as Record<string, unknown>).imageAttribution ?? (card as unknown as Record<string, unknown>).image_attribution ?? pageMetadata.organizer ?? card.organizer ?? sourceDomain ?? "ChancePing");
  const tags = compactPublicTags([
    card.type,
    card.region,
    card.opportunity_kind,
    ...(card.sourceBadges ?? []),
  ]).slice(0, 8);
  const language = inferLanguage(sourceDomain, `${card.title} ${card.type} ${card.region} ${card.organizer}`);
  const contextualText = [
    card.title,
    card.type,
    card.organizer,
    card.region,
    reward,
    card.eligibility,
    reason,
    card.next_action,
    sourceDomain,
    tags.join(" "),
  ].join(" ");
  const eventMode = inferEventMode(contextualText);
  const participantTypes = inferParticipantTypes(contextualText);
  const rewardTypes = inferRewardTypes(contextualText);
  const organizerType = inferOrganizerType(sourceType, sourceDomain, contextualText);
  const categoryTags = inferCategoryIds({
    title: card.title,
    sourceDomain,
    sourceType,
    type: card.type,
    organizer: card.organizer,
    region: card.region,
    reward,
    reason,
    tags,
  });
  const primaryCategory = categoryTags[0] ?? resolveCategory("ai_app");
  const organizer = normalizePublicText(pageMetadata.organizer || card.organizer, sourceDomain || "官方来源");
  const region = normalizePublicText(pageMetadata.region || card.region, "见官网");
  const audience = normalizePublicText(card.eligibility, "见官网");
  const regionGroup = inferRegionGroup({
    region,
    sourceDomain,
    language,
    eventMode,
    text: contextualText,
  });
  const deadlineWindow = inferDeadlineWindow(deadlineDate, lifecycleStatus, referenceDate);
  const fieldQuality = buildFieldQuality({
    deadline: deadlineDisplay,
    reward,
    organizer,
    region,
    registrationUrl,
    audience,
    eventMode,
    participantTypes,
    rewardTypes,
    organizerType,
    coverImageUrl,
  });

  return {
    id: `db-${hashStableId(normalizeUrl(officialUrl) || `${card.title}:${sourceDomain}`)}`,
    title: card.title,
    platform: card.organizer || sourceDomain || "官方来源",
    sourceName: card.organizer || sourceDomain || "官方来源",
    sourceDomain,
    sourceType,
    statusLabel: lifecycleStatus === "current" ? "当前有效" : "历史赛事",
    tags,
    deadline: deadlineDisplay,
    reward,
    coverImageUrl,
    imageSourceUrl,
    imageAlt,
    imageStatus,
    imageAttribution,
    prize: reward,
    benefits: splitBenefits(reward),
    organizer,
    registrationUrl,
    region,
    language,
    eventType: card.type || "AI 赛事",
    audience,
    eventMode,
    eventModeLabel: EVENT_MODE_LABELS[eventMode],
    participantTypes,
    participantTypeLabel: labelEnumValues(participantTypes, PARTICIPANT_TYPE_LABELS),
    rewardTypes,
    rewardTypeLabel: labelEnumValues(rewardTypes, REWARD_TYPE_LABELS),
    organizerType,
    organizerTypeLabel: ORGANIZER_TYPE_LABELS[organizerType],
    regionGroup,
    regionGroupLabel: REGION_GROUP_LABELS[regionGroup],
    deadlineWindow,
    deadlineWindowLabel: DEADLINE_WINDOW_LABELS[deadlineWindow],
    ...fieldQuality,
    reason,
    officialUrl,
    evidenceStatus: mapEvidenceStatus(card),
    candidateType: mapCandidateType(card),
    displayable: true,
    lastCheckedAt: (entry.updated_at || entry.added_at || new Date().toISOString()).slice(0, 10),
    priority: databasePriority(card),
    lifecycleStatus,
    deadlineSortKey: formatDateKey(deadlineDate, lifecycleStatus),
    deadlineDisplay,
    publicSource: "database",
    primaryCategory,
    categoryTags,
  };
}

function normalizeSeedCandidate(candidate: PublicAiEventCandidate, referenceDate: Date): PublicAiEventCard {
  const domain = candidate.sourceDomain === "multiple" ? getDomain(candidate.officialUrl) : candidate.sourceDomain;
  const resolvedDeadline = resolvePublicDeadline({
    rawDeadline: candidate.deadline,
    context: [
      candidate.title,
      candidate.eventType,
      candidate.organizer,
      candidate.sourceName,
      candidate.region,
      candidate.audience,
      candidate.reward,
      candidate.reason,
      domain,
      candidate.tags.join(" "),
    ],
    referenceDate,
  });
  const lifecycleStatus = inferLifecycle({
    title: candidate.title,
    deadline: resolvedDeadline.deadlineDisplay,
    evidenceStatus: candidate.evidenceStatus,
    candidateType: candidate.candidateType,
  }, referenceDate);
  const { deadlineDate, deadlineDisplay } = resolvedDeadline;
  const reward = normalizePublicReward(candidate.reward, "见官网");
  const candidateTags = compactPublicTags(candidate.tags).slice(0, 8);
  const contextualText = [
    candidate.title,
    candidate.eventType,
    candidate.organizer,
    candidate.sourceName,
    candidate.region,
    candidate.audience,
    reward,
    candidate.reason,
    domain,
    candidateTags.join(" "),
  ].join(" ");
  const eventMode = candidate.eventMode ?? inferEventMode(contextualText);
  const participantTypes = candidate.participantTypes?.length
    ? candidate.participantTypes
    : inferParticipantTypes(contextualText);
  const rewardTypes = candidate.rewardTypes?.length
    ? candidate.rewardTypes
    : inferRewardTypes(contextualText);
  const organizerType = candidate.organizerType ?? inferOrganizerType(candidate.sourceType, domain, contextualText);
  const categoryTags = candidate.categoryTags?.length
    ? candidate.categoryTags
    : inferCategoryIds({
      title: candidate.title,
      sourceDomain: domain,
      sourceType: candidate.sourceType,
      type: candidate.eventType,
      organizer: candidate.organizer ?? candidate.sourceName,
      region: candidate.region,
      reward,
      reason: candidate.reason,
      tags: candidateTags,
    });
  const primaryCategory = candidate.primaryCategory ?? categoryTags[0] ?? resolveCategory("ai_app");
  const seedCoverImageUrl = candidate.coverImageUrl ?? "";
  const realSeedCoverImageUrl = isUsableAiEventImageUrl(seedCoverImageUrl, `${candidate.title} ${candidate.sourceName} seed cover`)
    ? seedCoverImageUrl
    : "";
  const platformCoverImageUrl = getPlatformCoverImageUrl({
    officialUrl: candidate.officialUrl,
    sourceDomain: domain,
    sourceName: candidate.sourceName,
    title: candidate.title,
    sourceType: candidate.sourceType,
  });
  const coverImageUrl = realSeedCoverImageUrl || platformCoverImageUrl || DEFAULT_COVER_IMAGE_URL;
  const imageSourceUrl = candidate.imageSourceUrl ?? (realSeedCoverImageUrl ? coverImageUrl : candidate.officialUrl);
  const imageAlt = candidate.imageAlt ?? `${candidate.title} 赛事封面`;
  const imageStatus = candidate.imageStatus ?? (realSeedCoverImageUrl ? "source_image" : platformCoverImageUrl ? "platform_placeholder" : "default_placeholder");
  const imageAttribution = candidate.imageAttribution ?? candidate.sourceName ?? "ChancePing";
  const organizer = normalizePublicText(candidate.organizer ?? candidate.sourceName, "官方来源");
  const region = candidate.region ?? (/国内|中文|阿里云|天池|飞桨|华为/.test(candidate.reason + candidate.tags.join(" ")) ? "中国 / 中文来源" : "全球 / 海外");
  const audience = normalizePublicText(candidate.audience, "个人开发者、小团队或 AI 创作者请以官方页面确认资格");
  const registrationUrl = candidate.registrationUrl ?? candidate.officialUrl;
  const regionGroup = inferRegionGroup({
    region,
    sourceDomain: domain,
    language: candidate.language,
    eventMode,
    text: contextualText,
  });
  const deadlineWindow = inferDeadlineWindow(deadlineDate, lifecycleStatus, referenceDate);
  const fieldQuality = buildFieldQuality({
    deadline: deadlineDisplay,
    reward,
    organizer,
    region,
    registrationUrl,
    audience,
    eventMode,
    participantTypes,
    rewardTypes,
    organizerType,
    coverImageUrl,
  });
  return {
    ...candidate,
    statusLabel: lifecycleStatus === "current" ? "当前有效" : "历史赛事",
    deadline: deadlineDisplay,
    reward,
    coverImageUrl,
    imageSourceUrl,
    imageAlt,
    imageStatus,
    imageAttribution,
    prize: normalizePublicReward(candidate.prize ?? reward, "见官网"),
    tags: candidateTags,
    benefits: candidate.benefits?.map((item) => normalizePublicText(item, "见官网")) ?? splitBenefits(reward),
    organizer,
    registrationUrl,
    region,
    language: candidate.language ?? inferLanguage(domain, `${candidate.title} ${candidate.reason} ${candidate.tags.join(" ")}`),
    eventType: candidate.eventType ?? candidate.tags[0] ?? "AI 赛事",
    audience,
    eventMode,
    eventModeLabel: candidate.eventModeLabel ?? EVENT_MODE_LABELS[eventMode],
    participantTypes,
    participantTypeLabel: candidate.participantTypeLabel ?? labelEnumValues(participantTypes, PARTICIPANT_TYPE_LABELS),
    rewardTypes,
    rewardTypeLabel: candidate.rewardTypeLabel ?? labelEnumValues(rewardTypes, REWARD_TYPE_LABELS),
    organizerType,
    organizerTypeLabel: candidate.organizerTypeLabel ?? ORGANIZER_TYPE_LABELS[organizerType],
    regionGroup,
    regionGroupLabel: REGION_GROUP_LABELS[regionGroup],
    deadlineWindow,
    deadlineWindowLabel: DEADLINE_WINDOW_LABELS[deadlineWindow],
    ...fieldQuality,
    reason: normalizePublicText(candidate.reason, "这是 AI 赛事雷达发现的公开机会，建议打开官方入口查看详情。"),
    lifecycleStatus,
    deadlineSortKey: formatDateKey(deadlineDate, lifecycleStatus),
    deadlineDisplay,
    publicSource: "sample_room_seed",
    primaryCategory,
    categoryTags,
  };
}

function mergeUniqueCards(databaseCards: PublicAiEventCard[], seedCards: PublicAiEventCard[]): PublicAiEventCard[] {
  const seen = new Set<string>();
  const merged: PublicAiEventCard[] = [];
  for (const card of [...databaseCards, ...seedCards]) {
    const key = normalizeUrl(card.officialUrl) || `${card.title}:${card.sourceDomain}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(card);
  }
  return merged;
}

function sortPublicCards(cards: PublicAiEventCard[], lifecycle: PublicAiEventLifecycle | "all"): PublicAiEventCard[] {
  return cards.slice().sort((a, b) => {
    if (lifecycle === "all" && a.lifecycleStatus !== b.lifecycleStatus) {
      return a.lifecycleStatus === "current" ? -1 : 1;
    }
    const tierDelta = publicDisplayTier(a) - publicDisplayTier(b);
    if (tierDelta !== 0) return tierDelta;
    const aDate = parseDeadlineDate(a.deadlineDisplay || a.deadline);
    const bDate = parseDeadlineDate(b.deadlineDisplay || b.deadline);
    if (aDate && bDate && aDate.getTime() !== bDate.getTime()) {
      return a.lifecycleStatus === "historical"
        ? bDate.getTime() - aDate.getTime()
        : aDate.getTime() - bDate.getTime();
    }
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    const sourceTrustDelta = sourceTrustPriority(b) - sourceTrustPriority(a);
    if (sourceTrustDelta !== 0) return sourceTrustDelta;
    return b.priority - a.priority;
  });
}

function clampPositiveInteger(value: number | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value as number)));
}

export function buildPublicAiEventFeed(
  entries: StoreEntry[] = [],
  seedData: PublicAiEventSampleRoomData = getPublicAiEventSampleRoomData(),
  options: BuildPublicAiEventFeedOptions = {},
): PublicAiEventFeed {
  const referenceDate = normalizeReferenceDate(options.now);
  const lifecycle = options.lifecycle ?? "current";
  const category = normalizeCategoryId(options.category);
  const region = normalizeRegionFilter(options.region);
  const reward = normalizeRewardFilter(options.reward);
  const deadlineWindow = normalizeDeadlineWindowFilter(options.deadlineWindow);
  const page = clampPositiveInteger(options.page, 1);
  const pageSize = clampPositiveInteger(options.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const databaseCards = entries
    .map((entry) => projectOpportunityEntryToPublicAiEvent(entry, { now: referenceDate }))
    .filter((card): card is PublicAiEventCard => card !== null);
  const seedCards = seedData.items.map((candidate) => normalizeSeedCandidate(candidate, referenceDate));
  const sourceNetwork = seedData.sourceNetwork.map((source) => ({ ...source }));
  const mergedItems = mergeUniqueCards(databaseCards, seedCards);
  const allItems = mergedItems.filter((item) => item.displayable !== false);
  const currentCount = allItems.filter((item) => item.lifecycleStatus === "current").length;
  const historicalCount = allItems.filter((item) => item.lifecycleStatus === "historical").length;
  const filteredItems = lifecycle === "all"
    ? allItems
    : allItems.filter((item) => item.lifecycleStatus === lifecycle);
  const categoryFacets = buildCategoryFacets(filteredItems);
  const categoryFilteredItems = category === "all"
    ? filteredItems
    : filteredItems.filter((item) => hasCategory(item, category));
  const regionFacets = buildRegionFacets(categoryFilteredItems);
  const rewardFacets = buildRewardFacets(categoryFilteredItems);
  const deadlineWindowFacets = buildDeadlineWindowFacets(categoryFilteredItems);
  const dimensionFilteredItems = categoryFilteredItems
    .filter((item) => hasRegionGroup(item, region))
    .filter((item) => hasRewardType(item, reward))
    .filter((item) => hasDeadlineWindow(item, deadlineWindow));
  const sortedItems = sortPublicCards(dimensionFilteredItems, lifecycle);
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const items = sortedItems.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize);
  const imageCoverageCount = allItems.filter((item) =>
    item.imageStatus === "source_image" &&
    Boolean(item.coverImageUrl) &&
    item.coverImageUrl !== DEFAULT_COVER_IMAGE_URL
  ).length;
  const officialSourceCount = sourceNetwork.filter((source) => source.trustTier === "official_first").length;
  const aggregatorSourceCount = sourceNetwork.filter((source) => source.trustTier === "aggregation_lead").length;
  const lastCollectedAt = allItems[0]?.lastCheckedAt ?? seedData.stats.lastCheckedAt;
  const nextScheduledCollectionAt = addDaysToDateKey(lastCollectedAt, PUBLIC_AI_EVENTS_UPDATE_CADENCE_DAYS);
  return {
    items,
    sourceNetwork,
    stats: {
      candidateCount: mergedItems.length,
      displayableCount: filteredItems.length,
      sourceCount: AI_EVENT_SOURCE_NETWORK.length,
      officialEntryCount: allItems.filter((item) => item.evidenceStatus === "official_entry_to_review" || item.evidenceStatus === "verified" || item.evidenceStatus === "partially_verified").length,
      needsReviewCount: 0,
      databaseCount: databaseCards.length,
      seedCount: seedCards.length,
      totalCount: mergedItems.length,
      currentCount,
      historicalCount,
      filteredCount: dimensionFilteredItems.length,
      page: normalizedPage,
      pageSize,
      totalPages,
      categoryFacets,
      regionFacets,
      rewardFacets,
      deadlineWindowFacets,
      imageCoverageCount,
      officialSourceCount,
      aggregatorSourceCount,
      lastCheckedAt: lastCollectedAt,
      lastCollectedAt,
      updateCadenceDays: PUBLIC_AI_EVENTS_UPDATE_CADENCE_DAYS,
      nextScheduledCollectionAt,
    },
  };
}
