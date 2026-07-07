import type { AiEventImageStatus } from "../demo/ai-events-sample-room";

export interface AiEventPageMetadata {
  title?: string;
  coverImageUrl?: string;
  imageSourceUrl?: string;
  imageAlt?: string;
  imageStatus?: AiEventImageStatus;
  brandLogoUrl?: string;
  brandLogoAlt?: string;
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

function getMetaContents(html: string, names: string[]): string[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const contents: string[] = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = readAttributes(match[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    if (wanted.has(key) && attrs.content) contents.push(attrs.content.trim());
  }
  return contents;
}

function getLinkImages(html: string): string[] {
  const images: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = readAttributes(match[0]);
    const rel = String(attrs.rel ?? "").toLowerCase();
    const as = String(attrs.as ?? "").toLowerCase();
    if (!/(^|\s)image_src(\s|$)/i.test(rel) && !(rel.includes("preload") && as === "image")) continue;
    if (attrs.href) images.push(attrs.href.trim());
  }
  return images;
}

function extractTitle(html: string): string | undefined {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(titleMatch?.[1]);
}

function normalizeDate(value: string | undefined): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;

  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?\b/);
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

function collectEventAttributeText(html: string): string {
  const values: string[] = [];
  for (const match of html.matchAll(/<(?:input|time|meta|button|a|span|div|section)\b[^>]*>/gi)) {
    const attrs = readAttributes(match[0]);
    const text = [
      attrs.name,
      attrs.id,
      attrs.class,
      attrs.value,
      attrs.content,
      attrs.datetime,
      attrs.title,
      attrs.alt,
      attrs["aria-label"],
      attrs.placeholder,
      attrs.href,
      attrs["data-deadline"],
      attrs["data-date"],
      attrs["data-prize"],
      attrs["data-reward"],
    ].join(" ");
    if (/(deadline|close|closing|submit|submission|apply|application|register|prize|award|reward|credit|截止|报名|提交|申请|奖励|奖金|奖池|云资源)/i.test(text)) {
      values.push(text);
    }
  }
  return values.join(" ");
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
  const concisePatterns = [
    /(?:total\s+prizes?|prize\s+pool|cash\s+prize|awards?|rewards?)\s+(?:include|includes|including|up\s+to|worth|of|:)?\s*[^。.!?\n]{0,90}/i,
    /(?:奖金池|总奖金|现金奖励|奖品|奖励|奖项|云资源|算力|扶持资源)[^。.!?\n]{0,90}/i,
  ];
  for (const pattern of concisePatterns) {
    const match = text.match(pattern)?.[0]?.trim();
    if (match && !/没有(?:直接)?给出明确|未(?:直接)?给出明确|没有公布|未公布|未披露|not\s+disclosed|not\s+announced/i.test(match)) {
      return match.slice(0, 90);
    }
  }
  const hasConcreteReward = (sentence: string): boolean => {
    const concrete = /(\$|￥|\bUSD\b|\bRMB\b|\bUSDT\b|\d+\s*(?:万|万元|元|k|K|m|M|million|billion)|prize\s*pool|cash\s*prize|cash|cloud\s*credits?|API\s*credits?|credits?|云资源|算力|奖池|奖金池|展映|showcase\s+opportunit)/i;
    const moneyOrPrizePool = /(\$|￥|\bUSD\b|\bRMB\b|\bUSDT\b|\d+\s*(?:万|万元|元|k|K|m|M|million|billion)|prize\s*pool|cash\s*prize|cash|奖池|奖金池)/i;
    const genericNews = /本报讯|报道称|报道|举行|嘉宾|产业|政策|背景|交流活动|现场|观众|发言|启幕|发布会/i;
    if (/没有(?:直接)?给出明确|未(?:直接)?给出明确|没有(?:直接)?列出明确|未(?:直接)?列出明确|没有公布|未公布|未披露|not\s+disclosed|not\s+announced/i.test(sentence)) return false;
    if (sentence.length > 60 && !moneyOrPrizePool.test(sentence)) return false;
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

function collectJsonLdImages(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectJsonLdImages);
  const record = asRecord(value);
  if (record) {
    return [record.url, record.contentUrl]
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function pickJsonLdName(value: unknown): string | undefined {
  const record = asRecord(value);
  if (record) return String(record.name ?? "");
  return typeof value === "string" ? value : undefined;
}

function pickJsonLdReward(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.map(pickJsonLdReward).find(Boolean);
  }
  const record = asRecord(value);
  if (record) {
    return String(record.name ?? record.description ?? record.price ?? "");
  }
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

interface ImageCandidate {
  rawUrl: string | undefined;
  context: string;
  priority: number;
}

function extractCssBackgroundUrls(value: string): string[] {
  const urls: string[] = [];
  for (const match of value.matchAll(/background(?:-image)?\s*:\s*url\((["']?)([^"')]+)\1\)/gi)) {
    urls.push(match[2]);
  }
  return urls;
}

function normalizeScriptImageUrl(value: string): string {
  return value
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u003[aA]/g, ":")
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'")
    .replace(/&amp;/g, "&");
}

function collectScriptPayloadText(html: string): string {
  const chunks: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const scriptText = normalizeScriptImageUrl(decodeHtml(match[1] ?? ""));
    if (/(deadline|submission|registration|register|apply|prize|reward|award|cover|hackathon|challenge|比赛|报名|截止|奖金|奖励)/i.test(scriptText)) {
      chunks.push(scriptText);
    }
  }
  return chunks.join(" ");
}

function extractPayloadValues(payloadText: string, keys: string[]): string[] {
  const escapedKeys = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const keyPattern = escapedKeys.join("|");
  const values: string[] = [];
  const patterns = [
    new RegExp(`["']?(?:${keyPattern})["']?\\s*[:=]\\s*["']([^"'<>]{1,240})["']`, "gi"),
    new RegExp(`(?:${keyPattern})\\s+([^"'<>]{1,160})`, "gi"),
  ];
  for (const pattern of patterns) {
    for (const match of payloadText.matchAll(pattern)) {
      const value = cleanText(match[1]);
      if (value) values.push(value);
    }
  }
  return values;
}

function extractPayloadDeadline(payloadText: string): string | undefined {
  const values = extractPayloadValues(payloadText, [
    "submission_deadline",
    "submissionDeadline",
    "application_deadline",
    "applicationDeadline",
    "registration_deadline",
    "registrationDeadline",
    "deadline",
    "endDate",
    "end_date",
    "endsAt",
    "ends_at",
  ]);
  for (const value of values) {
    const normalized = normalizeDate(value);
    if (normalized) return normalized;
  }
  return extractDeadlineFromText(payloadText);
}

function extractPayloadReward(payloadText: string): string | undefined {
  const values = extractPayloadValues(payloadText, [
    "prize_amount",
    "prizeAmount",
    "prize_pool",
    "prizePool",
    "total_prize",
    "totalPrize",
    "reward",
    "rewards",
    "award",
    "awards",
    "prize",
    "prizes",
  ]);
  const rewardValue = values.find((value) => /(\$|￥|\bUSD\b|\bRMB\b|\d|cloud|credits?|GPU|prize|award|reward|奖金|奖池|云资源|算力|展示)/i.test(value));
  if (rewardValue) return rewardValue.slice(0, 90);
  return extractRewardFromText(payloadText);
}

function extractPayloadRegistrationUrl(payloadText: string, baseUrl: string): string | undefined {
  const values = extractPayloadValues(payloadText, [
    "registration_url",
    "registrationUrl",
    "register_url",
    "registerUrl",
    "apply_url",
    "applyUrl",
    "application_url",
    "applicationUrl",
    "submission_url",
    "submissionUrl",
    "submit_url",
    "submitUrl",
  ]);
  for (const value of values) {
    const resolved = resolveUrl(value, baseUrl);
    if (resolved) return resolved;
  }
  return undefined;
}

function extractScriptImageCandidates(html: string): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const scriptText = normalizeScriptImageUrl(decodeHtml(match[1] ?? ""));
    for (const imageMatch of scriptText.matchAll(/https?:\/\/[^"'`\s<>\\]+?\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'`\s<>\\]*)?/gi)) {
      const rawUrl = imageMatch[0];
      const start = Math.max(0, imageMatch.index - 90);
      const end = Math.min(scriptText.length, imageMatch.index + rawUrl.length + 90);
      const context = scriptText.slice(start, end);
      candidates.push({
        rawUrl,
        context: `app payload event image ${context}`,
        priority: /banner|hero|cover|poster/i.test(context) ? 86 : 78,
      });
    }
  }
  return candidates;
}

function imageCandidatePenalty(url: string, context: string): number {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  const text = `${pathname} ${context}`.toLowerCase();
  let penalty = 0;
  if (/\.(?:ico|svg)(?:[?#].*)?$/i.test(url)) penalty += 120;
  if (/(^|[\/_.-])(?:favicon|logo|icon|icons|avatar|sprite|pixel|spacer|blank|transparent|qrcode|qr|ewm|navbar-logo|frontlogo|footer_logo)(?:[\/_.-]|$)/i.test(text)) penalty += 120;
  if (/tracking|analytics|loader|placeholder|1x1|wechat-qr|weixin-qr/i.test(text)) penalty += 60;
  if (/(?:cover|banner|hero|poster|share|event|hackathon|challenge|competition|contest)/i.test(text)) penalty -= 22;
  if (/\.(?:jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(url)) penalty -= 8;
  return penalty;
}

export function isUsableAiEventImageUrl(url: string, context = ""): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  return imageCandidatePenalty(url, context) < 70;
}

function pickBestImageCandidate(candidates: ImageCandidate[], baseUrl: string): string | undefined {
  const scored = candidates
    .map((candidate, index) => {
      const resolved = resolveUrl(candidate.rawUrl, baseUrl);
      if (!resolved || !isUsableAiEventImageUrl(resolved, candidate.context)) return undefined;
      return {
        url: resolved,
        score: candidate.priority - imageCandidatePenalty(resolved, candidate.context) - index * 0.01,
      };
    })
    .filter((item): item is { url: string; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.url;
}

function isUsableBrandLogoUrl(url: string, context = ""): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const text = `${url} ${context}`.toLowerCase();
  if (/pixel|spacer|blank|transparent|avatar|qrcode|qr|sprite|tracking|analytics/i.test(text)) return false;
  return /\.(?:svg|ico|png|jpg|jpeg|webp|avif)(?:[?#].*)?$/i.test(url);
}

function pickBestBrandLogoCandidate(candidates: ImageCandidate[], baseUrl: string): string | undefined {
  const scored = candidates
    .map((candidate, index) => {
      const resolved = resolveUrl(candidate.rawUrl, baseUrl);
      if (!resolved || !isUsableBrandLogoUrl(resolved, candidate.context)) return undefined;
      return {
        url: resolved,
        score: candidate.priority - index * 0.01,
      };
    })
    .filter((item): item is { url: string; score: number } => Boolean(item))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.url;
}

function extractBrandLogoImage(html: string, baseUrl: string): string | undefined {
  const candidates: ImageCandidate[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = readAttributes(match[0]);
    const context = `${attrs.alt ?? ""} ${attrs.class ?? ""} ${attrs.id ?? ""} ${attrs.title ?? ""}`;
    if (!/logo|brand|site-logo|navbar-logo|header-logo|平台|品牌|官方/i.test(context)) continue;
    candidates.push({
      rawUrl: firstDefined([
        pickLargestSrcsetImage(attrs.srcset),
        pickLargestSrcsetImage(attrs["data-srcset"]),
        attrs.src,
        attrs["data-src"],
        attrs["data-original"],
      ]),
      context,
      priority: 96,
    });
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = readAttributes(match[0]);
    const rel = String(attrs.rel ?? "").toLowerCase();
    if (!/(^|\s)(apple-touch-icon|icon|shortcut icon|mask-icon)(\s|$)/i.test(rel)) continue;
    candidates.push({
      rawUrl: attrs.href,
      context: `brand logo link ${rel}`,
      priority: rel.includes("apple-touch-icon") ? 62 : 48,
    });
  }
  candidates.push(
    ...getMetaContents(html, ["og:logo", "twitter:logo", "logo", "application-name"])
      .map((rawUrl) => ({ rawUrl, context: "brand logo meta", priority: 78 })),
  );
  for (const rawUrl of getMetaContents(html, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"])) {
    if (/logo|brand|site-logo/i.test(rawUrl)) {
      candidates.push({ rawUrl, context: "social image logo fallback", priority: 70 });
    }
  }
  return pickBestBrandLogoCandidate(candidates, baseUrl);
}

function extractFirstImage(html: string, baseUrl: string): string | undefined {
  const candidates: ImageCandidate[] = [];
  for (const match of html.matchAll(/<source\b[^>]*>/gi)) {
    const attrs = readAttributes(match[0]);
    const candidate = firstDefined([
      pickLargestSrcsetImage(attrs.srcset),
      pickLargestSrcsetImage(attrs["data-srcset"]),
      attrs.src,
      attrs["data-src"],
    ]);
    candidates.push({
      rawUrl: candidate,
      context: `${attrs.alt ?? ""} ${attrs.class ?? ""} ${attrs.id ?? ""} ${attrs.type ?? ""}`,
      priority: 70,
    });
  }
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
    candidates.push({
      rawUrl: candidate,
      context: `${attrs.alt ?? ""} ${attrs.class ?? ""} ${attrs.id ?? ""} ${attrs.width ?? ""} ${attrs.height ?? ""}`,
      priority: 60,
    });
  }
  for (const match of html.matchAll(/<[^>]+\bstyle\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const style = decodeHtml(match[2] ?? match[3] ?? "");
    for (const url of extractCssBackgroundUrls(style)) {
      candidates.push({
        rawUrl: url,
        context: `${match[0]} hero banner cover event`,
        priority: 82,
      });
    }
  }
  return pickBestImageCandidate(candidates, baseUrl);
}

export function extractAiEventPageMetadata(html: string, pageUrl: string): AiEventPageMetadata {
  const jsonLd = findEventJsonLd(getJsonLdObjects(html));
  const pageText = cleanText(html);
  const attributeText = collectEventAttributeText(html);
  const payloadText = collectScriptPayloadText(html);
  const description = getMetaContent(html, ["description", "og:description", "twitter:description"]);
  const title = firstDefined([
    getMetaContent(html, ["og:title", "twitter:title"]),
    pickJsonLdName(jsonLd?.name),
    extractTitle(html),
  ]);
  const coverImageUrl = pickBestImageCandidate([
    ...getMetaContents(html, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src", "image", "thumbnail", "thumbnailUrl", "thumbnailurl"])
      .map((rawUrl) => ({ rawUrl, context: "social meta image", priority: 100 })),
    ...getLinkImages(html).map((rawUrl) => ({ rawUrl, context: "link image_src preload image", priority: 96 })),
    ...collectJsonLdImages(jsonLd?.image).map((rawUrl) => ({ rawUrl, context: "json-ld event image", priority: 92 })),
    { rawUrl: pickJsonLdImage(jsonLd?.thumbnailUrl), context: "json-ld thumbnail image", priority: 88 },
    ...extractScriptImageCandidates(html),
    { rawUrl: extractFirstImage(html, pageUrl), context: "html event image", priority: 74 },
  ], pageUrl);
  const brandLogoUrl = coverImageUrl ? undefined : extractBrandLogoImage(html, pageUrl);
  const deadline = firstDefined([
    normalizeDate(getMetaContent(html, ["deadline", "event:deadline", "applicationdeadline", "application_deadline", "validthrough"])),
    normalizeDate(String(jsonLd?.endDate ?? "")),
    normalizeDate(String(jsonLd?.startDate ?? "")),
    extractPayloadDeadline(payloadText),
    extractDeadlineFromText(`${description ?? ""} ${attributeText} ${payloadText} ${pageText}`),
  ]);
  const registrationUrl = firstDefined([
    resolveUrl(pickOfferUrl(jsonLd?.offers), pageUrl),
    extractPayloadRegistrationUrl(payloadText, pageUrl),
    extractActionLink(html, pageUrl),
  ]);
  const organizer = firstDefined([
    pickJsonLdName(jsonLd?.organizer),
    getMetaContent(html, ["author", "publisher"]),
  ]);
  const reward = firstDefined([
    getMetaContent(html, ["prize", "award", "awards", "reward", "rewards", "event:prize", "event:reward"]),
    pickJsonLdReward(jsonLd?.award),
    pickJsonLdReward(jsonLd?.awards),
    pickJsonLdReward(jsonLd?.offers),
    pickJsonLdReward((jsonLd as Record<string, unknown> | undefined)?.prize),
    pickJsonLdReward((jsonLd as Record<string, unknown> | undefined)?.prizes),
    extractPayloadReward(payloadText),
    extractRewardFromText(`${description ?? ""}. ${attributeText}. ${payloadText}. ${pageText}`),
  ]);
  const locationRecord = asRecord(jsonLd?.location);
  const locationName = pickJsonLdName(jsonLd?.location);
  const region = /VirtualLocation/i.test(getJsonLdType(locationRecord ?? {})) ? "全球线上" : locationName;

  return {
    title,
    coverImageUrl,
    imageSourceUrl: coverImageUrl,
    imageAlt: title ? `${title} 赛事封面` : undefined,
    imageStatus: coverImageUrl ? "source_image" : undefined,
    brandLogoUrl,
    brandLogoAlt: title ? `${title} 来源品牌标识` : undefined,
    deadline,
    reward,
    organizer,
    registrationUrl,
    region,
  };
}
