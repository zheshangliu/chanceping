import assert from "node:assert/strict";
import { createIchRadarSpec, ICH_PROVIDER_ROUTING } from "../src/ich/profile";
import { buildIchSearchIntentPlan } from "../src/ich/radar-engine";
import { evaluateIchSourcePolicy, findIchWorkflowDrift } from "../src/ich/source-policy";
import { mapIchProvenanceToEvidenceItems, mapEvidenceToIchProvenance } from "../src/ich/normalizer";
import { findDuplicatePrimaryUrls } from "../src/ich/dedup";
import type { IchOpportunityFile } from "../src/ich/types";
import fs from "node:fs";
import path from "node:path";
import type { EvidenceItem } from "../src/schema/evidence-item";

const spec = createIchRadarSpec();
assert.equal(spec.product_category, "非遗机会雷达");
assert.equal(spec.radar_version?.version, "V1.0");
assert.equal(spec.radar_version?.queryFamilies.length, 5);
const plan = buildIchSearchIntentPlan();
assert(plan.queries.length >= 5);
assert(ICH_PROVIDER_ROUTING.primary.includes("bocha"));

const detail = evaluateIchSourcePolicy({ sourceId: "yuexiu-notices", url: "https://www.yuexiu.gov.cn/yxdt/tzgg/content/post_10839528.html" });
assert.equal(detail.decision, "publishable_primary");
const listing = evaluateIchSourcePolicy({ sourceId: "crafts-council-uk", url: "https://www.craftscouncil.org.uk/sector-support/opportunities" });
assert.equal(listing.isDetailPage, false);
assert.equal(listing.decision, "discovery_only");

const evidence: EvidenceItem[] = [{ evidenceId: "ev_test", sourceId: "candidate-source", field: "title", value: "非遗机会", evidenceText: "非遗机会", confidence: 0.9, needsReview: false }];
const provenance = mapEvidenceToIchProvenance("https://www.yuexiu.gov.cn/yxdt/tzgg/content/post_10839528.html", evidence, "非遗机会");
assert.equal(provenance.title.value, "非遗机会");
assert.equal(mapIchProvenanceToEvidenceItems(provenance, "candidate-source").length, 2);

const drift = findIchWorkflowDrift();
assert.equal(drift.missingWorkflowSourceIds.length, 0);
assert.equal(drift.orphanWorkflowSourceIds.length, 0);
const formalStore = JSON.parse(fs.readFileSync(path.resolve("data/ich-opportunities.json"), "utf8")) as IchOpportunityFile;
assert.deepEqual(findDuplicatePrimaryUrls(formalStore.entries), []);
console.log(JSON.stringify({ gate: "pass", profile: spec.radar_version?.version, query_families: spec.radar_version?.queryFamilies.length, plan_queries: plan.queries.length, detail_policy: detail.decision, listing_policy: listing.decision, workflow_drift: drift.missingWorkflowSourceIds.length }, null, 2));
