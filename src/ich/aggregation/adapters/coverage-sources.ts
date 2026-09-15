import { extractDeadlineEvidence, htmlToText, identityHash, normalizeUrl, type ParsedAggregationItem } from "./common";

function emptyDeadline(rawText: string): Pick<ParsedAggregationItem, "deadline_text" | "deadline_at" | "deadline_source_url" | "deadline_raw_text" | "deadline_checked_at" | "deadline_resolution" | "deadline_kind"> {
  const evidence = extractDeadlineEvidence(rawText).find((candidate) => candidate.deadline_at);
  return {
    deadline_text: evidence?.text ?? null,
    deadline_at: evidence?.deadline_at ?? null,
    deadline_source_url: evidence?.deadline_at ? null : null,
    deadline_raw_text: evidence?.raw_text ?? null,
    deadline_checked_at: evidence ? new Date().toISOString() : null,
    deadline_resolution: evidence?.deadline_at ? "found_listing" : evidence ? "relative_only" : "not_attempted",
    deadline_kind: evidence?.kind ?? null,
  };
}

/** CNAF's guide list is an official grant/support listing, not a competition feed. */
export function parseCnafGuidesListing(html: string, listingUrl: string): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  const seen = new Set<string>();
  for (const block of html.matchAll(/<div\b[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*<\/div>/giu)) {
    const body = block[0];
    const anchor = body.match(/<a\b[^>]*href=["']([^"']*guide_detail[^"']*)["'][^>]*>([\s\S]*?)<\/a>/iu);
    if (!anchor) continue;
    const detailUrl = normalizeUrl(anchor[1], listingUrl);
    if (!detailUrl || seen.has(detailUrl)) continue;
    const title = htmlToText(anchor[2]);
    if (!title || !/(?:申报指南|资助项目|基金)/u.test(title)) continue;
    seen.add(detailUrl);
    const rawText = htmlToText(body).slice(0, 8000);
    const deadline = emptyDeadline(rawText);
    result.push({
      source_item_id: identityHash(detailUrl),
      title,
      source_category: "grant_funding",
      source_status: "official_guide",
      detail_url: detailUrl,
      source_url: listingUrl,
      published_at: body.match(/<div\b[^>]*class=["'][^"']*\bt3\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1] ? htmlToText(body.match(/<div\b[^>]*class=["'][^"']*\bt3\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)![1]) : null,
      ...deadline,
      organizer: "国家艺术基金",
      application_url: detailUrl,
      raw_text: rawText,
      participation_scope: "nationwide",
      participation_mode: "online",
    });
  }
  return result;
}

function listText(block: string, className: "primary-meta-item" | "description" | "secondary-meta-label"): string[] {
  const pattern = className === "description"
    ? /<div\b[^>]*class=["'][^"']*ecl-content-block__description[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/iu
    : new RegExp(`<[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "giu");
  if (className === "description") {
    const match = block.match(pattern as RegExp);
    return match ? [htmlToText(match[1])] : [];
  }
  return [...block.matchAll(pattern as RegExp)].map((match) => htmlToText(match[1])).filter(Boolean);
}

const CRAFT_OR_CULTURE_PROFILE = /(?:craft|handmade|heritage|artisan|ceramic|textile|jewell?ery|woodwork|design studio|museum|cultural|非遗|手工|工艺|文创)/iu;

/** EEN is a mixed partner directory; only inbound Business Request cards are retained. */
export function parseEenPartneringListing(html: string, listingUrl: string): ParsedAggregationItem[] {
  const result: ParsedAggregationItem[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<article\b[^>]*class=["'][^"']*ecl-card[^"']*["'][^>]*>[\s\S]*?<\/article>/giu)) {
    const body = match[0];
    const primary = listText(body, "primary-meta-item");
    if (!primary.some((item) => /^business request$/iu.test(item))) continue;
    const anchor = body.match(/<div\b[^>]*class=["'][^"']*ecl-content-block__title[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/iu);
    if (!anchor) continue;
    const detailUrl = normalizeUrl(anchor[1], listingUrl);
    if (!detailUrl || seen.has(detailUrl)) continue;
    const title = htmlToText(anchor[0].replace(/^[\s\S]*?>/u, "").replace(/<\/a>[\s\S]*$/u, ""));
    const description = listText(body, "description")[0] ?? "";
    // EEN is intentionally broad. Keep the adapter honest for this radar by
    // retaining only culture/craft/design profiles; unrelated industrial and
    // logistics requests remain observable negatives, not public coverage.
    if (!title || !description || !CRAFT_OR_CULTURE_PROFILE.test(`${title} ${description}`)) continue;
    seen.add(detailUrl);
    const rawText = `${title} ${description} ${primary.join(" ")}`.slice(0, 8000);
    const deadline = emptyDeadline(rawText);
    result.push({
      source_item_id: primary.find((item) => /^(?:BR|TR|BO)[A-Z]{2}\d+/iu.test(item)) ?? identityHash(detailUrl),
      title,
      source_category: "business_request",
      source_status: "public_profile",
      detail_url: detailUrl,
      source_url: listingUrl,
      published_at: null,
      ...deadline,
      organizer: null,
      application_url: detailUrl,
      raw_text: rawText,
      participation_scope: "global",
      participation_mode: "online",
    });
  }
  return result;
}
