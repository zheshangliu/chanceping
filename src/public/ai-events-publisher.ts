import crypto from "node:crypto";
import type { StoreEntry } from "../agents/opportunity-store";
import type { OpportunityCard } from "../schema/opportunity-card";
import {
  AI_EVENT_SOURCE_NETWORK,
  getPublicAiEventSampleRoomData,
  type AiEventSourceType,
  type PublicAiEventCandidate,
  type PublicAiEventSampleRoomData,
} from "../demo/ai-events-sample-room";

const DEFAULT_COVER_IMAGE_URL = "/assets/ai-event-placeholder.svg";
const NON_PUBLIC_STATUSES = new Set(["archived", "dismissed", "expired", "missed"]);
const LOW_VALUE_LEVELS = new Set(["hidden", "D"]);

export type PublicAiEventSource = "database" | "sample_room_seed";

export interface PublicAiEventCard extends PublicAiEventCandidate {
  coverImageUrl: string;
  prize: string;
  benefits: string[];
  organizer: string;
  registrationUrl: string;
  region: string;
  language: string;
  eventType: string;
  audience: string;
  publicSource: PublicAiEventSource;
}

export interface PublicAiEventFeed extends Omit<PublicAiEventSampleRoomData, "items"> {
  items: PublicAiEventCard[];
  stats: PublicAiEventSampleRoomData["stats"] & {
    databaseCount: number;
    seedCount: number;
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

function inferSourceType(domain: string, typeText: string): AiEventSourceType {
  const sourceText = `${domain} ${typeText}`.toLowerCase();
  if (/devpost|dorahacks|lablab|hackathon/.test(sourceText)) return "hackathon_platform";
  if (/kaggle|aicrowd|tianchi|datafountain|competition|竞赛|比赛/.test(sourceText)) return "competition_platform";
  if (/cloud|aws|azure|google|microsoft|aliyun|tencent|huawei|云/.test(sourceText)) return "cloud_provider";
  if (/neurips|cvpr|iclr|conference|学术/.test(sourceText)) return "academic_conference";
  if (/runway|creator|aigc|创作/.test(sourceText)) return "creator_platform";
  return "developer_community";
}

function inferLanguage(domain: string, text: string): string {
  if (/[一-龥]/.test(text) || /\.cn$|aliyun|tencent|baidu|huaweicloud|trae\.ai/.test(domain)) {
    return "zh";
  }
  return "en";
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
  return /AI|人工智能|大模型|Agent|Hackathon|黑客松|赛事|比赛|竞赛|开发者挑战|云资源|AIGC|Vibe Coding|IDE/i.test(text);
}

function isPublishableStoreEntry(entry: StoreEntry): boolean {
  const card = entry.card;
  if (!card?.official_source_url) return false;
  if (card.is_demo_data) return false;
  if (LOW_VALUE_LEVELS.has(card.visible_level)) return false;
  if (NON_PUBLIC_STATUSES.has(card.status)) return false;
  if (/example\.com|localhost|127\.0\.0\.1/i.test(card.official_source_url)) return false;
  if (entry.radar_type === "ai_competition") return true;
  return isAiEventCard(card);
}

function compactStrings(values: Array<string | undefined | null>): string[] {
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);
}

function splitBenefits(value: string): string[] {
  const normalized = value.replace(/[；;、，,]/g, "\n");
  return normalized
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function mapEvidenceStatus(card: OpportunityCard): PublicAiEventCard["evidenceStatus"] {
  if (card.evidence_status === "confirmed") return "verified";
  if (card.evidence_status === "partially_verified") return "partially_verified";
  if (card.evidence_status === "unverified") return "unverified";
  return "needs_review";
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

export function projectOpportunityEntryToPublicAiEvent(entry: StoreEntry): PublicAiEventCard | null {
  if (!isPublishableStoreEntry(entry)) return null;

  const card = entry.card;
  const officialUrl = card.official_source_url.trim();
  const registrationUrl = (card.application_url || officialUrl).trim();
  const sourceDomain = getDomain(officialUrl);
  const typeText = `${card.type} ${card.opportunity_kind ?? ""}`;
  const reward = card.reward_or_value || "待复核";
  const reason = card.fitReason || card.match_reason || card.next_action || "已进入 AI 赛事雷达候选，需要打开官方来源复核。";
  const coverImageUrl = String((card as unknown as Record<string, unknown>).coverImageUrl ?? (card as unknown as Record<string, unknown>).cover_image_url ?? DEFAULT_COVER_IMAGE_URL);
  const tags = compactStrings([
    card.type,
    card.region,
    card.visible_level ? `${card.visible_level} 级` : undefined,
    card.opportunity_kind,
    ...(card.sourceBadges ?? []),
  ]).slice(0, 8);
  const language = inferLanguage(sourceDomain, `${card.title} ${card.type} ${card.region} ${card.organizer}`);

  return {
    id: `db-${hashStableId(normalizeUrl(officialUrl) || `${card.title}:${sourceDomain}`)}`,
    title: card.title,
    platform: card.organizer || sourceDomain || "官方来源",
    sourceName: card.organizer || sourceDomain || "官方来源",
    sourceDomain,
    sourceType: inferSourceType(sourceDomain, typeText),
    statusLabel: card.evidence_status === "confirmed" ? "字段证据 - 已核验" : "字段证据 - 待复核",
    tags,
    deadline: card.deadline || "待复核",
    reward,
    coverImageUrl,
    prize: reward,
    benefits: splitBenefits(reward),
    organizer: card.organizer || "待复核",
    registrationUrl,
    region: card.region || "待复核",
    language,
    eventType: card.type || "AI 赛事",
    audience: card.eligibility || "待复核",
    reason,
    officialUrl,
    evidenceStatus: mapEvidenceStatus(card),
    candidateType: mapCandidateType(card),
    displayable: true,
    lastCheckedAt: (entry.updated_at || entry.added_at || new Date().toISOString()).slice(0, 10),
    priority: databasePriority(card),
    publicSource: "database",
  };
}

function normalizeSeedCandidate(candidate: PublicAiEventCandidate): PublicAiEventCard {
  const domain = candidate.sourceDomain === "multiple" ? getDomain(candidate.officialUrl) : candidate.sourceDomain;
  return {
    ...candidate,
    coverImageUrl: candidate.coverImageUrl ?? DEFAULT_COVER_IMAGE_URL,
    prize: candidate.prize ?? candidate.reward,
    benefits: candidate.benefits ?? splitBenefits(candidate.reward),
    organizer: candidate.organizer ?? candidate.sourceName,
    registrationUrl: candidate.registrationUrl ?? candidate.officialUrl,
    region: candidate.region ?? (/国内|中文|阿里云|天池|飞桨|华为/.test(candidate.reason + candidate.tags.join(" ")) ? "中国 / 中文来源" : "全球 / 海外"),
    language: candidate.language ?? inferLanguage(domain, `${candidate.title} ${candidate.reason} ${candidate.tags.join(" ")}`),
    eventType: candidate.eventType ?? candidate.tags[0] ?? "AI 赛事",
    audience: candidate.audience ?? "个人开发者、小团队或 AI 创作者需自行复核资格",
    publicSource: "sample_room_seed",
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
  return merged.sort((a, b) => b.priority - a.priority);
}

export function buildPublicAiEventFeed(
  entries: StoreEntry[] = [],
  seedData: PublicAiEventSampleRoomData = getPublicAiEventSampleRoomData(),
): PublicAiEventFeed {
  const databaseCards = entries
    .map(projectOpportunityEntryToPublicAiEvent)
    .filter((card): card is PublicAiEventCard => card !== null);
  const seedCards = seedData.items.map(normalizeSeedCandidate);
  const items = mergeUniqueCards(databaseCards, seedCards);
  const displayableCount = items.filter((item) => item.displayable !== false).length;
  return {
    items,
    sourceNetwork: seedData.sourceNetwork.map((source) => ({ ...source })),
    stats: {
      candidateCount: items.length,
      displayableCount,
      sourceCount: AI_EVENT_SOURCE_NETWORK.length,
      officialEntryCount: items.filter((item) => item.evidenceStatus === "official_entry_to_review" || item.evidenceStatus === "verified" || item.evidenceStatus === "partially_verified").length,
      needsReviewCount: items.filter((item) => item.evidenceStatus !== "verified").length,
      databaseCount: databaseCards.length,
      seedCount: seedCards.length,
      lastCheckedAt: items[0]?.lastCheckedAt ?? seedData.stats.lastCheckedAt,
    },
  };
}
