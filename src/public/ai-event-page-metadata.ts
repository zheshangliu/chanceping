import type { AiEventImageStatus } from "../demo/ai-events-sample-room";

export interface AiEventPageMetadata {
  title?: string;
  coverImageUrl?: string;
  imageSourceUrl?: string;
  imageAlt?: string;
  imageStatus?: AiEventImageStatus;
  deadline?: string;
  reward?: string;
  organizer?: string;
  registrationUrl?: string;
  region?: string;
}

const MONTHS: Record<string, string> = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sep: "09",
  sept: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12",
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanText(value: string | undefined): string {
  return decodeHtml(String(value ?? ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[3] ?? match[4] ?? match[5] ?? "");
  }
  return attrs;
}

function resolveUrl(value: string | undefined, baseUrl: string): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw || /^data:|^javascript:|^mailto:/i.test(raw)) return undefined;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function firstDefined<T>(values: Array<T | undefined | null | "">): T | undefined {
  return values.find((value): value is T => value !== undefined && value !== null && value !== "");
}

function pickLargestSrcsetImage(value: string | undefined): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const candidates = raw
    .split(",")
    .map((item) => {
      const [url = "", descriptor = ""] = item.trim().split(/\s+/, 2);
      const width = Number(descriptor.match(/^(\d+)w$/i)?.[1] ?? 0);
      const density = Number(descriptor.match(/^(\d+(?:\.\d+)?)x$/i)?.[1] ?? 0);
      return { url: url.trim(), score: width || density * 1000 || 1 };
    })
    .filter((item) => item.url.length > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.url;
}

function getMetaContent(html: string, names: string[]): string | undefined {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = readAttributes(match[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    if (wanted.has(key) && attrs.content) return attrs.content.trim();
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(titleMatch?.[1]);
}

function normalizeDate(value: string | undefined): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const zh = text.match(/\b(20\d{2})\s*[年/.]\s*(\d{1,2})\s*[月/.]\s*(\d{1,2})\s*(?:日)?\b/);
  if (zh) {
    return `${zh[1]}-${zh[2].padStart(2, "0")}-${zh[3].padStart(2, "0")}`;
  }

  const english = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i);
  if (english) {
    const month = MONTHS[english[1].toLowerCase()];
    if (month) return `${english[3]}-${month}-${english[2].padStart(2, "0")}`;
  }

  return undefined;
}

function extractDeadlineFromText(text: string): string | undefined {
  const dateHints = [
    /(?:deadline|submissions?\s+close|apply\s+by|submit\s+by|ends?\s+on|close[sd]?\s+on)[^.\n。]{0,80}/gi,
    /(?:截止|报名截止|提交截止|申请截止|结束时间)[^.\n。]{0,80}/g,
  ];
  for (const pattern of dateHints) {
    for (const match of text.matchAll(pattern)) {
      const normalized = normalizeDate(match[0]);
      if (normalized) return normalized;
    }
  }
  return normalizeDate(text);
}

function extractRewardFromText(text: string): string | undefined {
  const sentences = text
    .split(/[。.!?]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  const hasConcreteReward = (sentence: string): boolean => {
    const concrete = /(\$|￥|\bUSD\b|\bRMB\b|\bUSDT\b|\d+\s*(?:万|万元|元|k|K|m|M|million|billion)|prize\s*pool|cash\s*prize|cash|cloud\s*credits?|API\s*credits?|credits?|云资源|算力|奖池|奖金池|展映|showcase\s+opportunit)/i;
    const moneyOrPrizePool = /(\$|￥|\bUSD\b|\bRMB\b|\bUSDT\b|\d+\s*(?:万|万元|元|k|K|m|M|million|billion)|prize\s*pool|cash\s*prize|cash|奖池|奖金池)/i;
    const genericNews = /本报讯|报道称|报道|举行|嘉宾|产业|政策|背景|交流活动|现场|观众|发言|启幕|发布会/i;
    if (/没有(?:直接)?给出明确|未(?:直接)?给出明确|没有(?:直接)?列出明确|未(?:直接)?列出明确|没有公布|未公布|未披露|not\s+disclosed|not\s+announced/i.test(sentence)) return false;
    if (sentence.length > 80 && !moneyOrPrizePool.test(sentence)) return false;
    if (concrete.test(sentence)) return true;
    if (genericNews.test(sentence)) return false;
    return sentence.length <= 70 && /奖金|奖励|展示机会|曝光机会|扶持|孵化|导师|证书|award|prize|showcase|grant/i.test(sentence);
  };
  const rewardSentence = sentences.find((sentence) => /prize|award|cash|cloud\s*credits?|credits?|奖金|奖池|云资源|算力|展示|showcase|grant|扶持|孵化/i.test(sentence) && hasConcreteReward(sentence));
  if (!rewardSentence) return undefined;
  return rewardSentence.slice(0, 90);
}

function getJsonLdObjects(html: string): unknown[] {
  const objects: unknown[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = decodeHtml(match[1]).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        objects.push(...parsed);
      } else {
        objects.push(parsed);
      }
    } catch {
      // Ignore malformed JSON-LD; public pages should not fail because one source has invalid markup.
    }
  }
  return objects;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function getJsonLdType(value: Record<string, unknown>): string {
  const type = value["@type"];
  if (Array.isArray(type)) return type.join(" ");
  return String(type ?? "");
}

function findEventJsonLd(objects: unknown[]): Record<string, unknown> | undefined {
  const queue = [...objects];
  while (queue.length > 0) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const record = asRecord(current);
    if (!record) continue;
    if (/event|hackathon|competition/i.test(getJsonLdType(record))) return record;
    const graph = record["@graph"];
    if (Array.isArray(graph)) queue.push(...graph);
  }
  return undefined;
}

function pickJsonLdImage(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickJsonLdImage(item);
      if (picked) return picked;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (record) {
    return String(record.url ?? record.contentUrl ?? "");
  }
  return typeof value === "string" ? value : undefined;
}

function pickJsonLdName(value: unknown): string | undefined {
  const record = asRecord(value);
  if (record) return String(record.name ?? "");
  return typeof value === "string" ? value : undefined;
}

function pickOfferUrl(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickOfferUrl(item);
      if (picked) return picked;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  return String(record.url ?? record.availabilityStarts ?? "");
}

function extractActionLink(html: string, baseUrl: string): string | undefined {
  for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const attrs = readAttributes(match[0]);
    const text = cleanText(match[1]);
    if (!/register|apply|submit|join|enter|报名|申请|提交|参加|参赛|立即报名/i.test(`${text} ${attrs.href ?? ""}`)) continue;
    const resolved = resolveUrl(attrs.href, baseUrl);
    if (resolved) return resolved;
  }
  return undefined;
}

function extractFirstImage(html: string, baseUrl: string): string | undefined {
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = readAttributes(match[0]);
    const candidate = firstDefined([
      pickLargestSrcsetImage(attrs.srcset),
      pickLargestSrcsetImage(attrs["data-srcset"]),
      pickLargestSrcsetImage(attrs["data-lazy-srcset"]),
      attrs.src,
      attrs["data-src"],
      attrs["data-lazy-src"],
      attrs["data-original"],
    ]);
    const resolved = resolveUrl(candidate, baseUrl);
    if (resolved) return resolved;
  }
  return undefined;
}

export function extractAiEventPageMetadata(html: string, pageUrl: string): AiEventPageMetadata {
  const jsonLd = findEventJsonLd(getJsonLdObjects(html));
  const pageText = cleanText(html);
  const description = getMetaContent(html, ["description", "og:description", "twitter:description"]);
  const title = firstDefined([
    getMetaContent(html, ["og:title", "twitter:title"]),
    pickJsonLdName(jsonLd?.name),
    extractTitle(html),
  ]);
  const rawImage = firstDefined([
    getMetaContent(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src", "image", "thumbnail", "thumbnailUrl"]),
    pickJsonLdImage(jsonLd?.image),
    extractFirstImage(html, pageUrl),
  ]);
  const coverImageUrl = resolveUrl(rawImage, pageUrl);
  const deadline = firstDefined([
    normalizeDate(String(jsonLd?.endDate ?? "")),
    normalizeDate(String(jsonLd?.startDate ?? "")),
    extractDeadlineFromText(`${description ?? ""} ${pageText}`),
  ]);
  const registrationUrl = firstDefined([
    resolveUrl(pickOfferUrl(jsonLd?.offers), pageUrl),
    extractActionLink(html, pageUrl),
  ]);
  const organizer = firstDefined([
    pickJsonLdName(jsonLd?.organizer),
    getMetaContent(html, ["author", "publisher"]),
  ]);
  const reward = extractRewardFromText(`${description ?? ""}. ${pageText}`);
  const locationRecord = asRecord(jsonLd?.location);
  const locationName = pickJsonLdName(jsonLd?.location);
  const region = /VirtualLocation/i.test(getJsonLdType(locationRecord ?? {})) ? "全球线上" : locationName;

  return {
    title,
    coverImageUrl,
    imageSourceUrl: coverImageUrl,
    imageAlt: title ? `${title} 赛事封面` : undefined,
    imageStatus: coverImageUrl ? "source_image" : undefined,
    deadline,
    reward,
    organizer,
    registrationUrl,
    region,
  };
}
