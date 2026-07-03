import fs from "node:fs";
import path from "node:path";
import { createDefaultSpec, type RadarRequirementSpec } from "../src/schema/radar-requirement-spec";
import type { OpportunityKind, SourceArchetypeId } from "../src/schema/radar-mvp-contracts";
import type { RadarVersionQueryFamily } from "../src/schema/radar-version-spec";
import { applyCandidateRelevanceGate, assessCandidateRelevance } from "../src/search/candidate-relevance";
import type { SearchResult } from "../src/search/types";

type Decision = "accept" | "downgrade_to_watch_signal" | "reject";

interface ProfileFixture {
  targetUser: string;
  businessContext: string;
  opportunityIntents: string[];
  highValueCriteria: string[];
  exclusionRules: string[];
  prioritySourceArchetypes: string[];
  queryFamily: string;
  query: string;
}

interface Dataset {
  profiles: Record<string, ProfileFixture>;
  cases: Array<{
    id: string;
    profile: string;
    scenario: string;
    candidate: {
      title: string;
      url: string;
      snippet: string;
      semanticType: OpportunityKind;
      sourceArchetype: SourceArchetypeId;
      publishedAt?: string;
    };
    expected: { decision: Decision; critical: boolean };
  }>;
}

function toSpec(profile: ProfileFixture): RadarRequirementSpec {
  const spec = createDefaultSpec();
  spec.client_profile.client_type = profile.targetUser;
  spec.client_profile.business_type = profile.targetUser;
  spec.core_goals.primary_goal = profile.businessContext;
  spec.core_goals.action_intent = ["寻找合作"];
  spec.opportunity_scope.primary_opportunity_types = profile.opportunityIntents;
  spec.keyword_strategy.core_keywords_zh = profile.opportunityIntents;
  spec.filter_rules.must_exclude = profile.exclusionRules;
  const queryFamily: RadarVersionQueryFamily = {
    familyName: profile.queryFamily,
    intentType: "business_lead",
    sourceArchetype: profile.prioritySourceArchetypes[0] ?? "官方网站",
    queries: [profile.query],
    whyThisFamily: "Q.6 relevance fixture",
  };
  spec.radar_version = {
    version: "V1.0",
    oneSentencePositioning: `${profile.targetUser}机会雷达`,
    targetUser: profile.targetUser,
    businessContext: profile.businessContext,
    opportunityIntents: profile.opportunityIntents,
    highValueCriteria: profile.highValueCriteria,
    exclusionRules: profile.exclusionRules,
    prioritySourceArchetypes: profile.prioritySourceArchetypes,
    queryFamilies: [queryFamily],
    scoringRules: [],
    reportTemplate: ["重点机会", "待复核项"],
    missingConfig: [],
    defaultAssumptions: [],
    revisionNotes: [],
    resultBuckets: ["direct_opportunity", "business_lead", "watch_signal"],
  };
  return spec;
}

function toResult(item: Dataset["cases"][number], profile: ProfileFixture): SearchResult {
  return {
    title: item.candidate.title,
    url: item.candidate.url,
    snippet: item.candidate.snippet,
    source_provider: "fixture",
    source_type: "web",
    ...(item.candidate.publishedAt ? { published_at: item.candidate.publishedAt } : {}),
    search_query: profile.query,
    search_theme: profile.queryFamily,
    query_family: profile.queryFamily,
    query_variant: "action_keyword",
    intent_type: item.candidate.semanticType === "direct_opportunity" ? "direct_opportunity" : "business_lead",
    semantic_type: item.candidate.semanticType,
    source_archetype: item.candidate.sourceArchetype,
    source_archetype_label: item.candidate.sourceArchetype,
  };
}

const dataset = JSON.parse(
  fs.readFileSync(path.resolve("fixtures/q6-candidate-relevance.json"), "utf8"),
) as Dataset;

let exact = 0;
let positiveTotal = 0;
let positiveRetained = 0;
let criticalWronglyAccepted = 0;
const misses: string[] = [];

for (const item of dataset.cases) {
  const profile = dataset.profiles[item.profile];
  const assessment = assessCandidateRelevance(toResult(item, profile), toSpec(profile), {
    now: new Date("2026-07-03T00:00:00+08:00"),
  });

  if (assessment.decision === item.expected.decision) exact += 1;
  else misses.push(`${item.id} ${item.scenario}: expected=${item.expected.decision} actual=${assessment.decision} reasons=${assessment.reasonCodes.join(",")} subject=${assessment.subjectFit.basis.join("|")} action=${assessment.actionFit.basis.join("|")}`);

  if (item.expected.decision === "accept") {
    positiveTotal += 1;
    if (assessment.decision === "accept") positiveRetained += 1;
  }
  if (item.expected.critical && item.expected.decision !== "accept" && assessment.decision === "accept") {
    criticalWronglyAccepted += 1;
  }

  const dimensions = [
    assessment.subjectFit,
    assessment.targetFit,
    assessment.actionFit,
    assessment.sourceFit,
    assessment.freshnessFit,
    assessment.regionFit,
    assessment.opportunityFit,
  ];
  if (dimensions.some((dimension) => !["match", "mismatch", "unknown"].includes(dimension.status))) {
    misses.push(`${item.id}: invalid fit status`);
  }
}

const accuracy = exact / dataset.cases.length;
const positiveRetention = positiveRetained / positiveTotal;

console.log(`Q.6-A accuracy=${(accuracy * 100).toFixed(1)}% (${exact}/${dataset.cases.length})`);
console.log(`Q.6-A positiveRetention=${(positiveRetention * 100).toFixed(1)}% (${positiveRetained}/${positiveTotal})`);
console.log(`Q.6-A criticalWronglyAccepted=${criticalWronglyAccepted}`);

const firstProfile = dataset.profiles.go_player;
const gateSample = dataset.cases.filter((item) => item.profile === "go_player").map((item) => toResult(item, firstProfile));
const gateResult = applyCandidateRelevanceGate(gateSample, toSpec(firstProfile), {
  now: new Date("2026-07-03T00:00:00+08:00"),
});
if (gateResult.accepted.length !== 1 || gateResult.downgraded.length !== 1 || gateResult.rejected.length !== 1) {
  misses.push(`gate integration: expected 1 accepted / 1 downgraded / 1 rejected, got ${gateResult.accepted.length}/${gateResult.downgraded.length}/${gateResult.rejected.length}`);
}
if (!gateResult.downgraded.every((item) => item.semantic_type === "watch_signal")) {
  misses.push("gate integration: downgraded candidates must become watch_signal");
}
if (!gateResult.rejected.every((item) => item.semantic_type === "rejected")) {
  misses.push("gate integration: rejected candidates must remain audit-only rejected results");
}

if (accuracy < 0.9 || positiveRetention < 0.9 || criticalWronglyAccepted > 0 || misses.length > dataset.cases.length * 0.1) {
  for (const miss of misses) console.error(`MISS ${miss}`);
  process.exit(1);
}

console.log("Q.6-A candidate relevance gate: PASS");
