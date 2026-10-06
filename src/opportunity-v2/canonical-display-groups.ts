import type { OpportunityV2 } from "./types";

export type CanonicalDisplayGroupStatus = "GROUPED" | "DUPLICATE_REVIEW";

export interface CanonicalOpportunityDisplay extends OpportunityV2 {
  canonical_display_group_id?: string;
  canonical_alias_ids?: string[];
}

export interface CanonicalOpportunityDisplayGroup {
  group_id: string;
  status: CanonicalDisplayGroupStatus;
  canonical_id: string | null;
  member_ids: string[];
  alias_ids: string[];
  evidence: Array<{ source_id: string; source_item_id: string; detail_url: string; basis: string }>;
}

interface ReviewedMember {
  source_id: string;
  source_item_id: string;
  detail_url: string;
  basis: string;
}

interface ReviewedGroup {
  id: string;
  canonical_source_id: string;
  canonical_source_item_id: string;
  canonical_detail_url: string;
  edition: string;
  members: ReviewedMember[];
}

// Human-reviewed, source-identity allowlist, not title-similarity matching.
// Evidence was read from the public records on 2026-10-06: official LOEWE 2027
// entry; Craft Scotland's 2027/10th-edition notice with the same Oct 15 closing
// date; and the OpenCalls AI 2027 entry. Pool records remain untouched.
const REVIEWED_GROUPS: ReviewedGroup[] = [{
  id: "loewe-craft-prize-2027",
  canonical_source_id: "loewe-craft-prize",
  canonical_source_item_id: "9c506728be468703d19d6d09",
  canonical_detail_url: "https://craftprize.loewe.com/zh/craftprize2027",
  edition: "2027",
  members: [
    { source_id: "loewe-craft-prize", source_item_id: "9c506728be468703d19d6d09", detail_url: "https://craftprize.loewe.com/zh/craftprize2027", basis: "Official source and application URL identify the 2027 edition." },
    { source_id: "craft-scotland-opportunities", source_item_id: "43885b166107ea794022fea4", detail_url: "https://www.craftscotland.org/community/opportunity/loewe-foundation-craft-prize-2027", basis: "Same named 2027/10th-edition announcement and same 2026-10-15 closing date." },
    { source_id: "opencalls-ai", source_item_id: "48039ca6f2f38a96c4829f9c", detail_url: "https://opencalls.ai/opencalls/loewe-foundation-craft-prize-2027-a8bf1492-ae36-4af9-8ab6-e9d71b3d468f", basis: "Same named LOEWE FOUNDATION 2027 prize call; official source remains canonical." },
  ],
}];

function matchesMember(item: OpportunityV2, member: ReviewedMember): boolean {
  return item.source_id === member.source_id
    && item.source_item_id === member.source_item_id
    && item.detail_url.replace(/\/$/u, "") === member.detail_url.replace(/\/$/u, "");
}

function editionEvidenceMatches(item: OpportunityV2, edition: string): boolean {
  const value = `${item.title}\n${item.summary}`;
  if (!new RegExp(`\\b${edition}\\b`, "u").test(value)) return false;
  if (!/(?:loewe\s+foundation|lo[eë]we|craft\s+prize)/iu.test(value)) return false;
  return !/(?:winner|winners|shortlist|finalists?|获奖名单|获奖结果|入围名单|结果公示)/iu.test(value);
}

/** Collapse only complete, explicitly reviewed source identities for display; never mutate/persist pool rows. */
export function buildCanonicalOpportunityDisplayGroups(items: OpportunityV2[]): { cards: CanonicalOpportunityDisplay[]; groups: CanonicalOpportunityDisplayGroup[] } {
  const cards: CanonicalOpportunityDisplay[] = [...items];
  const groups: CanonicalOpportunityDisplayGroup[] = [];
  for (const definition of REVIEWED_GROUPS) {
    const matched = definition.members.map((member) => ({ member, item: items.find((candidate) => matchesMember(candidate, member)) ?? null }));
    const present = matched.filter((entry): entry is { member: ReviewedMember; item: OpportunityV2 } => entry.item !== null);
    if (!present.length) continue;
    const editionSafe = present.length === definition.members.length && present.every(({ item }) => editionEvidenceMatches(item, definition.edition));
    const canonical = present.find(({ member }) => member.source_id === definition.canonical_source_id && member.source_item_id === definition.canonical_source_item_id)?.item ?? null;
    const complete = editionSafe && canonical !== null;
    const aliasIds = complete ? present.map(({ item }) => item.id).filter((id) => id !== canonical.id).sort() : [];
    groups.push({
      group_id: definition.id,
      status: complete ? "GROUPED" : "DUPLICATE_REVIEW",
      canonical_id: complete ? canonical.id : null,
      member_ids: present.map(({ item }) => item.id).sort(),
      alias_ids: aliasIds,
      evidence: present.map(({ member }) => ({ source_id: member.source_id, source_item_id: member.source_item_id, detail_url: member.detail_url, basis: member.basis })),
    });
    if (!complete) continue;
    const discovered = [...new Set(present.flatMap(({ item }) => [item.source_id, ...item.discovered_by_sources]))].sort();
    const card: CanonicalOpportunityDisplay = { ...canonical, discovered_by_sources: discovered, canonical_display_group_id: definition.id, canonical_alias_ids: aliasIds };
    const canonicalIndex = cards.findIndex((item) => item.id === canonical.id);
    if (canonicalIndex >= 0) cards[canonicalIndex] = card;
    const aliasSet = new Set(aliasIds);
    for (let index = cards.length - 1; index >= 0; index -= 1) if (aliasSet.has(cards[index].id)) cards.splice(index, 1);
  }
  return { cards, groups };
}
