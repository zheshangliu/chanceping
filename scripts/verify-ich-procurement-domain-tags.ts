import assert from "node:assert/strict";
import { filterOpportunityV2Radar } from "../src/opportunity-v2/radar-view";
import { hasProcurementDomainTag, isCraftRelevantProcurement, procurementDomainTags } from "../src/opportunity-v2/procurement";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const now = new Date("2026-09-11T12:00:00+08:00");
const source: OpportunityV2Source = {
  id: "fixture-procurement-domain",
  name: "Fixture procurement source",
  url: "https://fixture.example.com/procurement",
  region: "GLOBAL",
  priority: "P0",
  types: ["procurement"],
  radars: ["ich"],
  enabled: true,
  status: "ACTIVE",
  last_fetch_at: null,
};

function item(id: string, title: string, tags: string[]): OpportunityV2 {
  return {
    id,
    title,
    summary: `${title}，buyer demand procurement project with structured official evidence.`,
    source_id: source.id,
    source_item_id: id,
    source_name: source.name,
    source_url: source.url,
    detail_url: `https://official.example.gov/tenders/${id}`,
    category: "procurement_project",
    region: "GLOBAL",
    tags,
    deadline: "2026-10-01",
    deadline_text: "2026-10-01",
    deadline_source_url: `https://official.example.gov/tenders/${id}`,
    deadline_raw_text: "submission deadline 2026-10-01",
    deadline_checked_at: now.toISOString(),
    deadline_resolution: "found_detail",
    deadline_kind: "submission_deadline",
    deadline_conflict_unsafe: false,
    deadline_conflicts: [],
    status: "CURRENT",
    first_seen_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    discovered_by_sources: [source.id],
    radar_relevance: "RELEVANT",
    procurement: {
      direction: "buyer_demand",
      stage: "open",
      notice_type: "tender",
      project_id: id,
      buyer_name: "Fixture buyer",
      procurement_method: "open tender",
      budget_amount: null,
      budget_currency: null,
      milestones: [{ kind: "submission", date: "2026-10-01", text: "submission deadline" }],
      source_record_id: id,
    },
  };
}

const untaggedText = "艺术采购服务";
assert.equal(isCraftRelevantProcurement(untaggedText), true, "relevant-but-untagged fixture must remain craft-relevant");
assert.deepEqual(procurementDomainTags(untaggedText), [], "fixture must have no approved domain tag");
assert.equal(hasProcurementDomainTag(["procurement"]), false, "generic procurement tag is not a domain tag");
assert.equal(filterOpportunityV2Radar([item("untagged", untaggedText, ["procurement"])], [source], { now }).length, 0, "relevant-but-domain-untagged procurement must stay out of public Radar");

const genericOnly = item("generic-only", "艺术采购服务项目", ["procurement"]);
assert.equal(filterOpportunityV2Radar([genericOnly], [source], { now }).length, 0, "generic procurement tag alone must not publish");

const productTags = procurementDomainTags("ceramic craft product design");
assert.equal(productTags.includes("文创产品"), true, "ceramic craft product design must map to 文创产品");
assert.equal(hasProcurementDomainTag(productTags), true);

const packagingTags = procurementDomainTags("包装设计采购");
assert.equal(packagingTags.includes("文创产品"), true, "包装设计采购 must map to 文创产品");

const plantTags = procurementDomainTags("绿植租赁服务采购");
assert.equal(plantTags.includes("绿植"), true, "绿植租赁 must map to 绿植");

const culturalTags = procurementDomainTags("非遗文化展陈活动执行服务采购");
assert.equal(culturalTags.includes("展陈"), true);
assert.equal(culturalTags.includes("文化服务"), true);
assert.equal(culturalTags.includes("活动执行"), true);

console.log(JSON.stringify({
  gate: "PASS",
  generic_procurement_only: "PASS",
  relevant_but_domain_untagged_blocked: "PASS",
  positive_mappings: {
    product_design: productTags,
    packaging: packagingTags,
    plants: plantTags,
    cultural_event: culturalTags,
  },
}, null, 2));
