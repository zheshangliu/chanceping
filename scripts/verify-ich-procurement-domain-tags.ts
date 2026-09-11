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

const outboundText = [
  "兴业银行信用卡中心关于外呼业务支撑服务项目供应商征集调研公告",
  "为保障语音外呼相关业务有序开展，采购IVR语音和智能机器人技术、电话外拨、手工外呼、预览外呼、预测外呼、机器人呼叫、通话录音。",
].join(" ");
const outbound = { ...item("outbound-call-center", "兴业银行信用卡中心关于外呼业务支撑服务项目供应商征集调研公告", ["procurement", "文创产品"]), summary: outboundText };
assert.equal(procurementDomainTags(outboundText).includes("文创产品"), false, "手工外呼 must not map to 文创产品");
assert.equal(isCraftRelevantProcurement(outboundText), false, "call-center wording must not be craft relevant");
assert.equal(filterOpportunityV2Radar([outbound], [source], { now }).length, 0, "call-center procurement must stay out of public Radar");

for (const [label, text] of [
  ["手工录入", "客服系统手工录入服务"],
  ["手工操作", "后台手工操作服务"],
  ["工艺流程", "生产工艺流程管理服务"],
  ["施工工艺", "施工工艺咨询服务"],
  ["制造工艺", "制造工艺流程服务"],
  ["客服外包", "客服外包服务"],
  ["呼叫中心", "呼叫中心服务"],
  ["电话营销", "电话营销服务"],
  ["催收服务", "催收服务"],
  ["软件运维", "软件运维服务"],
  ["网络设备", "网络设备采购"],
] as const) {
  assert.equal(isCraftRelevantProcurement(text), false, `${label} must not be craft relevant`);
  assert.equal(procurementDomainTags(text).includes("文创产品"), false, `${label} must not map to 文创产品`);
}

const handcraftTags = procurementDomainTags("传统手工艺展览");
assert.equal(handcraftTags.includes("文创产品"), true);
assert.equal(isCraftRelevantProcurement("传统手工艺展览"), true);
const handmadeProductTags = procurementDomainTags("手工艺品采购");
assert.equal(handmadeProductTags.includes("文创产品"), true);
const artTags = procurementDomainTags("工艺美术作品采购");
assert.equal(artTags.includes("文创产品"), true);
const heritageSkillTags = procurementDomainTags("非遗传统技艺活动");
assert.equal(heritageSkillTags.includes("文创产品"), true);
const ceramicTags = procurementDomainTags("陶瓷工艺品采购");
assert.equal(ceramicTags.includes("文创产品"), true);
const handmadeGiftTags = procurementDomainTags("手作礼品采购");
assert.equal(handmadeGiftTags.includes("文创产品"), true);
assert.equal(handmadeGiftTags.includes("礼赠"), true);

console.log(JSON.stringify({
  gate: "PASS",
  generic_procurement_only: "PASS",
  relevant_but_domain_untagged_blocked: "PASS",
  semantic_negative_fixture: "PASS",
  semantic_positive_fixture: "PASS",
  positive_mappings: {
    product_design: productTags,
    packaging: packagingTags,
    plants: plantTags,
    cultural_event: culturalTags,
    traditional_handcraft: handcraftTags,
    handmade_product: handmadeProductTags,
    craft_art: artTags,
    heritage_skill: heritageSkillTags,
    ceramic: ceramicTags,
    handmade_gift: handmadeGiftTags,
  },
}, null, 2));
