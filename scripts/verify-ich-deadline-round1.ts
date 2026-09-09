import assert from "node:assert/strict";
import { extractDeadlineEvidence, extractDeadlineText, parseDateText, type ParsedAggregationItem } from "../src/ich/aggregation/adapters/common";
import { enrichGenericItem } from "../src/ich/aggregation/adapters/generic-listing";
import { parseCuratorSpaceListing } from "../src/ich/aggregation/adapters/curatorspace";
import { mergeOpportunityV2 } from "../src/opportunity-v2/opportunity-pool";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const NOW = new Date("2026-09-07T00:00:00.000Z");

function day(value: string | null): string | null { return value?.slice(0, 10) ?? null; }

function source(id: string, name = id): OpportunityV2Source {
  return { id, name, url: `https://example.com/${id}`, region: "GLOBAL", priority: "P0", types: ["competition"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: null };
}

function opportunity(id: string, title: string, sourceId: string, deadline: string | null, resolution: OpportunityV2["deadline_resolution"] = deadline ? "found_listing" : "source_has_no_date"): OpportunityV2 {
  return { id, title, summary: "A real craft opportunity.", source_id: sourceId, source_name: sourceId, source_url: `https://example.com/${sourceId}`, detail_url: `https://example.com/${id}`, category: "competition", region: "GLOBAL", tags: ["craft"], deadline, deadline_text: deadline, deadline_source_url: `https://example.com/${id}`, deadline_raw_text: deadline, deadline_checked_at: NOW.toISOString(), deadline_resolution: resolution, status: deadline && deadline < NOW.toISOString() ? "EXPIRED" : deadline ? "CURRENT" : "UNKNOWN_DEADLINE", first_seen_at: NOW.toISOString(), last_seen_at: NOW.toISOString(), discovered_by_sources: [sourceId], radar_relevance: "RELEVANT" };
}

function parsedItem(): ParsedAggregationItem {
  return { source_item_id: "fixture", title: "Fixture competition", source_category: "competition", detail_url: "https://example.com/detail", source_url: "https://example.com/list", published_at: null, deadline_text: null, deadline_at: null, organizer: null, application_url: null, raw_text: "Fixture competition", deadline_resolution: "not_attempted" };
}

async function main(): Promise<void> {
  const cases = [
    ["2026比赛【截稿至7月5日】", "2026-07-05"],
    ["2026比赛【截稿至 8月20日】", "2026-08-20"],
    ["比赛｜申请截止：2026年08月28日", "2026-08-28"],
    ["比赛｜申请截止：2026-08-28", "2026-08-28"],
    ["比赛｜截止10月20日", "2026-10-20"],
  ] as const;
  for (const [text, expected] of cases) {
    const extracted = extractDeadlineText(text);
    assert.ok(extracted, `${text}: extract`);
    assert.equal(day(parseDateText(extracted, NOW, text)), expected, `${text}: parse`);
  }
  assert.equal(day(parseDateText("7月5日", NOW, "2026比赛")), "2026-07-05", "month/day inherits explicit title year");
  assert.equal(day(parseDateText("08/10/2026", NOW, "", "day-first")), "2026-10-08", "day-first listing date");
  assert.equal(day(parseDateText("2026-10-20", NOW)), "2026-10-20", "hyphenated date");
  assert.equal(day(parseDateText("2026-07-01至2026-10-15", NOW)), "2026-10-15", "range uses end date");
  const priority = extractDeadlineEvidence("Award date: 2026-12-31. Application deadline: 2026-08-28", NOW);
  assert.equal(priority[0]?.kind, "application_deadline", "application/submission semantics outrank award date");
  assert.equal(day(priority[0]?.deadline_at ?? null), "2026-08-28", "priority date selected");
  const detail = enrichGenericItem(parsedItem(), "<html><p>Application deadline: 28 August 2026</p></html>", "https://example.com/detail");
  assert.equal(day(detail.deadline_at), "2026-08-28", "detail-only date is resolved");
  assert.equal(detail.deadline_resolution, "found_detail", "detail resolution is explicit");
  const relative = extractDeadlineEvidence("16天后投稿截止", NOW);
  assert.equal(relative[0]?.kind, "submission_deadline", "relative-only submission is classified");
  assert.equal(relative[0]?.deadline_at, null, "relative-only date is not fabricated");
  const noDate = enrichGenericItem(parsedItem(), "<html><p>Opportunity details are available.</p></html>", "https://example.com/detail");
  assert.equal(noDate.deadline_at, null, "no-date source remains unknown");
  assert.equal(noDate.deadline_resolution, "source_has_no_date", "no-date resolution is explicit");
  const curator = parseCuratorSpaceListing(`<ul><li class="media opportunity"><a href="/opportunities/detail/11099"><h4>Exhibit in Brazil - Sensorial Exhibition</h4></a><div><strong>Deadline: 08/10/2026</strong></div></li></ul>`, "https://www.curatorspace.com/opportunities");
  assert.equal(curator.length, 1, "CuratorSpace listing item parsed");
  assert.equal(day(curator[0].deadline_at), "2026-10-08", "CuratorSpace DD/MM/YYYY is parsed day-first");
  const sameTitle = "LOEWE FOUNDATION Craft Prize 2027";
  const same = mergeOpportunityV2([opportunity("a", sameTitle, "loewe-craft-prize", "2027-01-01T23:59:00.000Z")], [opportunity("b", "Loewe Foundation 2027 Craft Prize", "asef-culture360-opportunities", "2027-01-01T23:59:00.000Z")], NOW);
  assert.equal(same.length, 1, "same opportunity cross-source deduplicates");
  assert.deepEqual(same[0].discovered_by_sources.sort(), ["asef-culture360-opportunities", "loewe-craft-prize"].sort(), "cross-source discovery is preserved");
  assert.equal(same[0].deadline_resolution, "found_cross_source", "same cross-source deadline is marked");
  const conflict = mergeOpportunityV2([opportunity("a", sameTitle, "loewe-craft-prize", "2027-01-01T23:59:00.000Z")], [opportunity("b", "Loewe Foundation 2027 Craft Prize", "asef-culture360-opportunities", "2027-02-01T23:59:00.000Z")], NOW);
  assert.equal(conflict[0].deadline_resolution, "date_conflict", "cross-source disagreement is explicit");
  assert.equal(conflict[0].deadline_conflicts?.length, 1, "cross-source conflict is recorded");
  assert.equal(opportunity("expired", "2026比赛", "fixture", "2026-07-05T23:59:00.000Z").status, "EXPIRED", "2026-07-05 is expired on 2026-09-07");
  assert.equal(opportunity("current", "2026比赛", "fixture", "2026-10-20T23:59:00.000Z").status, "CURRENT", "2026-10-20 is current on 2026-09-07");
  console.log(JSON.stringify({ deadline_cases: cases.length, detail_only: true, range_end: "2026-10-15", priority: "application_deadline", relative_only: true, curator_space: "2026-10-08", cross_source_same: true, cross_source_conflict: true, expired_on_2026_09_07: 3, current_on_2026_09_07: 1 }, null, 2));
}

void main();
