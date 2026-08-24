import crypto from "node:crypto";
import { getIchSourceRegistryV2, type IchSourceRegistryV2Entry } from "./source-registry-v2";
import type { IchPrimaryCategory } from "./types";

export const ICH_DS1B_ADAPTER_SCHEMA = "ich-ds1b-adapter.v1" as const;

export interface IchFieldProvenance {
  value: string | null;
  source_url: string;
  method: "html_title" | "structured_text" | "listing_anchor" | "registry_scope" | "not_found";
  evidence_excerpt: string | null;
  confirmed: boolean;
}

export interface IchCandidateSample {
  candidate_id: string;
  adapter_id: string;
  source_id: string;
  discovery_url: string;
  source_url: string;
  title: string;
  organizer: string | null;
  deadline_text: string | null;
  geography: string | null;
  category_hint: IchPrimaryCategory | null;
  published_text: string | null;
  raw_snapshot_hash: string;
  review_state: "candidate_only";
  field_provenance: {
    title: IchFieldProvenance;
    organizer: IchFieldProvenance;
    deadline_text: IchFieldProvenance;
    geography: IchFieldProvenance;
    category_hint: IchFieldProvenance;
    source_url: IchFieldProvenance;
  };
}

export interface IchDs1bAdapter {
  adapter_id: string;
  source_id: string;
  discovery_url: string;
  category_hint: IchPrimaryCategory;
  geography_hint: string;
  selectDetailLinks(html: string, discoveryUrl: string): Array<{ url: string; listing_title: string }>;
  extractCandidate(args: { html: string; sourceUrl: string; discoveryUrl: string; listingTitle: string }): IchCandidateSample;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/(20)\s*(\d)\s*(\d)\s*年/gu, "$1$2$3年")
    .replace(/(20\d{2})年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/gu, "$1年$2月$3日")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromHtml(html: string, fallback: string): { value: string; excerpt: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
  const value = (title || fallback).replace(/_(?:通知公告|地市新闻|招标公告|中标公告)(?:_.*)?$/u, "").trim();
  return { value, excerpt: value.slice(0, 180) };
}

function firstMatch(text: string, patterns: RegExp[]): { value: string; excerpt: string } | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return { value: match[1].replace(/\s+/g, " ").trim(), excerpt: match[0].replace(/\s+/g, " ").trim().slice(0, 220) };
  }
  return null;
}

function normalizeUrl(href: string, baseUrl: string): string {
  const url = new URL(href, baseUrl);
  if (url.protocol === "http:" && ["www.yuexiu.gov.cn", "yuexiu.gov.cn"].includes(url.hostname)) url.protocol = "https:";
  url.hash = "";
  return url.toString();
}

function extractLinks(html: string, baseUrl: string, predicate: (url: string) => boolean): Array<{ url: string; listing_title: string }> {
  const links: Array<{ url: string; listing_title: string }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const listingTitle = htmlToText(match[2]);
    if (!listingTitle) continue;
    let url: string;
    try { url = normalizeUrl(match[1], baseUrl); } catch { continue; }
    if (!predicate(url) || seen.has(url)) continue;
    seen.add(url);
    links.push({ url, listing_title: listingTitle });
  }
  return links;
}

function candidateId(sourceId: string, sourceUrl: string): string {
  return `ds1b-${sourceId}-${crypto.createHash("sha256").update(sourceUrl).digest("hex").slice(0, 12)}`;
}

function buildCandidate(args: {
  adapterId: string;
  sourceId: string;
  categoryHint: IchPrimaryCategory;
  geographyHint: string;
  html: string;
  sourceUrl: string;
  discoveryUrl: string;
  listingTitle: string;
  organizerPatterns: RegExp[];
  deadlinePatterns: RegExp[];
  publishedPatterns: RegExp[];
}): IchCandidateSample {
  const text = htmlToText(args.html);
  const title = titleFromHtml(args.html, args.listingTitle);
  const organizerMatch = firstMatch(text, args.organizerPatterns);
  const deadlineMatch = firstMatch(text, args.deadlinePatterns);
  const publishedMatch = firstMatch(text, args.publishedPatterns);
  const field = (value: string | null, sourceUrl: string, method: IchFieldProvenance["method"], excerpt: string | null, confirmed: boolean): IchFieldProvenance => ({ value, source_url: sourceUrl, method, evidence_excerpt: excerpt, confirmed });
  const scopeNote = "来源登记范围提示；不是详情页逐字段确认 (INFERENCE)";
  return {
    candidate_id: candidateId(args.sourceId, args.sourceUrl),
    adapter_id: args.adapterId,
    source_id: args.sourceId,
    discovery_url: args.discoveryUrl,
    source_url: args.sourceUrl,
    title: title.value,
    organizer: organizerMatch?.value ?? null,
    deadline_text: deadlineMatch?.value ?? null,
    geography: args.geographyHint || null,
    category_hint: args.categoryHint,
    published_text: publishedMatch?.value ?? null,
    raw_snapshot_hash: crypto.createHash("sha256").update(args.html).digest("hex"),
    review_state: "candidate_only",
    field_provenance: {
      title: field(title.value, args.sourceUrl, "html_title", title.excerpt, true),
      organizer: field(organizerMatch?.value ?? null, args.sourceUrl, organizerMatch ? "structured_text" : "not_found", organizerMatch?.excerpt ?? null, Boolean(organizerMatch)),
      deadline_text: field(deadlineMatch?.value ?? null, args.sourceUrl, deadlineMatch ? "structured_text" : "not_found", deadlineMatch?.excerpt ?? null, Boolean(deadlineMatch)),
      geography: field(args.geographyHint || null, args.discoveryUrl, "registry_scope", scopeNote, false),
      category_hint: field(args.categoryHint, args.discoveryUrl, "registry_scope", "适配器类别提示，需候选审核确认", false),
      source_url: field(args.sourceUrl, args.sourceUrl, "listing_anchor", args.sourceUrl, true),
    },
  };
}

function requiredSource(sourceId: string): IchSourceRegistryV2Entry {
  const source = getIchSourceRegistryV2().sources.find((item) => item.id === sourceId);
  if (!source) throw new Error(`DS1-B source not registered: ${sourceId}`);
  if (!["planned", "adapter_ready"].includes(source.operational_status)) throw new Error(`DS1-B source is not collectible: ${sourceId}`);
  return source;
}

const ccgp = requiredSource("ccgp");
const gdCulture = requiredSource("gd-culture");
const yuexiu = requiredSource("yuexiu-notices");
const mct = requiredSource("mct-notices");
const cnaf = requiredSource("cnaf");
const ichina = requiredSource("ichina");

export const ICH_DS1B_ADAPTERS: IchDs1bAdapter[] = [
  {
    adapter_id: "ccgp-procurement-listing-v1",
    source_id: ccgp.id,
    discovery_url: "https://www.ccgp.gov.cn/cggg/dfgg/",
    category_hint: "procurement_project",
    geography_hint: "",
    selectDetailLinks: (html, url) => extractLinks(html, url, (href) => /ccgp\.gov\.cn\/cggg\/(?:dfgg|zygg)\/(?:gkzb|jzxcs|xjgg|gzgg|zbgg)\/\d{6}\/t\d+_\d+\.htm$/.test(href)),
    extractCandidate: ({ html, sourceUrl, discoveryUrl, listingTitle }) => buildCandidate({
      adapterId: "ccgp-procurement-listing-v1", sourceId: ccgp.id, categoryHint: "procurement_project", geographyHint: "", html, sourceUrl, discoveryUrl, listingTitle,
      organizerPatterns: [/采购单位\s+([^\s]{2,40})/u],
      deadlinePatterns: [/于\s*(\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}时\d{0,2}分?)\s*[（(]北京时间[）)]?\s*前/u, /开标时间\s*(\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}:?\d{0,2})/u],
      publishedPatterns: [/公告时间\s+(\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}:\d{2})/u],
    }),
  },
  {
    adapter_id: "gd-culture-notices-v1",
    source_id: gdCulture.id,
    discovery_url: "https://whly.gd.gov.cn/open_newggl/index.html",
    category_hint: "channel_collaboration",
    geography_hint: "广东省",
    selectDetailLinks: (html, url) => extractLinks(html, url, (href) => /whly\.gd\.gov\.cn\/open_newggl\/content\/post_\d+\.html$/.test(href)),
    extractCandidate: ({ html, sourceUrl, discoveryUrl, listingTitle }) => buildCandidate({
      adapterId: "gd-culture-notices-v1", sourceId: gdCulture.id, categoryHint: "channel_collaboration", geographyHint: "广东省", html, sourceUrl, discoveryUrl, listingTitle,
      organizerPatterns: [/作者\s*[:：]\s*([^\s]{2,30})/u, /主办单位\s*[:：]\s*([^\s]{2,40})/u],
      deadlinePatterns: [/截止(?:时间)?\s*[:：]?\s*(\d{4}年\d{1,2}月\d{1,2}日(?:\s*\d{1,2}(?:时|:)\d{0,2}分?)?)/u, /(?:申报|报名|提交)[^。；]{0,60}?(\d{4}年\d{1,2}月\d{1,2}日(?:\s*\d{1,2}(?:时|:)\d{0,2}分?)?)(?:前|截止|止)/u],
      publishedPatterns: [/时间\s*[:：]\s*(\d{4}-\d{1,2}-\d{1,2}\s*\d{1,2}:\d{2})/u],
    }),
  },
  {
    adapter_id: "yuexiu-notices-v1",
    source_id: yuexiu.id,
    discovery_url: yuexiu.canonical_url,
    category_hint: "procurement_project",
    geography_hint: "广州市越秀区",
    selectDetailLinks: (html, url) => extractLinks(html, url, (href) => /yuexiu\.gov\.cn\/yxdt\/tzgg\/content\/post_\d+\.html$/.test(href)),
    extractCandidate: ({ html, sourceUrl, discoveryUrl, listingTitle }) => buildCandidate({
      adapterId: "yuexiu-notices-v1", sourceId: yuexiu.id, categoryHint: "procurement_project", geographyHint: "广州市越秀区", html, sourceUrl, discoveryUrl, listingTitle,
      organizerPatterns: [/项目建设单位\s*[:：]\s*([^。；;]{2,60})/u, /采购单位\s*[:：]\s*([^。；;]{2,60})/u],
      deadlinePatterns: [/(?:提交资料时间|报名文件递交截止时间|递交报名资料的起止时间)\s*[:：]?\s*([^。；;]{4,80}?)(?:止|截止)/u, /(?:公示时间|公告期限)\s*[:：]?\s*([^。；;]{4,80}?)(?:止|截止)/u],
      publishedPatterns: [/日期\s*[:：]?\s*(\d{4}年\d{1,2}月\d{1,2}日)/u],
    }),
  },
  {
    adapter_id: "mct-notices-listing-v1",
    source_id: mct.id,
    discovery_url: mct.canonical_url,
    category_hint: "policy_funding",
    geography_hint: "全国",
    selectDetailLinks: (html, url) => extractLinks(html, url, (href) => /mct\.gov\.cn\/zfxxgkml\/[^/]+\/\d{6}\/t\d+_\d+\.html$/.test(href)),
    extractCandidate: ({ html, sourceUrl, discoveryUrl, listingTitle }) => buildCandidate({
      adapterId: "mct-notices-listing-v1", sourceId: mct.id, categoryHint: "policy_funding", geographyHint: "全国", html, sourceUrl, discoveryUrl, listingTitle,
      organizerPatterns: [/发布单位\s*[:：]\s*([^\s]{2,40})/u, /主办单位\s*[:：]\s*([^\s]{2,40})/u],
      deadlinePatterns: [/(?:截止|申报截止|报名截止)(?:时间)?\s*[:：]?\s*(\d{4}年\d{1,2}月\d{1,2}日(?:\s*\d{1,2}(?:时|:)\d{0,2}分?)?)/u],
      publishedPatterns: [/(?:发布时间|发布日期|成文日期)\s*[:：]?\s*(\d{4}年\d{1,2}月\d{1,2}日)/u],
    }),
  },
  {
    adapter_id: "cnaf-guides-listing-v1",
    source_id: cnaf.id,
    discovery_url: "https://www.cnaf.cn/guide.html",
    category_hint: "policy_funding",
    geography_hint: "全国",
    selectDetailLinks: (html, url) => extractLinks(html, url, (href) => /cnaf\.cn\/guide_detail\/\d+\.html$/.test(href)),
    extractCandidate: ({ html, sourceUrl, discoveryUrl, listingTitle }) => buildCandidate({
      adapterId: "cnaf-guides-listing-v1", sourceId: cnaf.id, categoryHint: "policy_funding", geographyHint: "全国", html, sourceUrl, discoveryUrl, listingTitle,
      organizerPatterns: [/编辑\s*[:：]\s*([^\s]{2,30})/u, /(国家艺术基金管理中心)/u],
      deadlinePatterns: [/至\s*(\d{1,2}月\d{1,2}日)\s*截止申报/u, /申报材料应于\s*(\d{4}年\d{1,2}月\d{1,2}日)前/u, /申报时间[^。；]{0,80}?(\d{4}年\d{1,2}月\d{1,2}日)/u],
      publishedPatterns: [/时间\s*[:：]\s*(\d{4}\.\d{1,2}\.\d{1,2})/u, /时间\s*[:：]\s*(\d{4}年\d{1,2}月\d{1,2}日)/u],
    }),
  },
  {
    adapter_id: "ichina-notices-listing-v1",
    source_id: ichina.id,
    discovery_url: "https://www.ihchina.cn/news_2",
    category_hint: "policy_funding",
    geography_hint: "全国",
    selectDetailLinks: (html, url) => extractLinks(html, url, (href) => /ihchina\.cn\/news_2_details\/\d+\.html$/.test(href)),
    extractCandidate: ({ html, sourceUrl, discoveryUrl, listingTitle }) => buildCandidate({
      adapterId: "ichina-notices-listing-v1", sourceId: ichina.id, categoryHint: "policy_funding", geographyHint: "全国", html, sourceUrl, discoveryUrl, listingTitle,
      organizerPatterns: [/来源\s*[:：]\s*([^\s]{2,40})/u, /主办\s*[:：]\s*([^\n]{2,60})/u],
      deadlinePatterns: [/公示时间\s*[:：]\s*(\d{4}年\d{1,2}月\d{1,2}日至\d{1,2}日)/u, /(?:申报|报名|提交)[^。；]{0,100}?(\d{4}年\d{1,2}月\d{1,2}日)/u, /截至\s*(\d{4}年\d{1,2}月\d{1,2}日)/u],
      publishedPatterns: [/创建时间\s*[:：]\s*(\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/u],
    }),
  },
];

export function getIchDs1bAdapter(adapterId: string): IchDs1bAdapter {
  const adapter = ICH_DS1B_ADAPTERS.find((item) => item.adapter_id === adapterId);
  if (!adapter) throw new Error(`Unknown DS1-B adapter: ${adapterId}`);
  return adapter;
}
