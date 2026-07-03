import fs from "node:fs";
import path from "node:path";

type Decision = "accept" | "downgrade_to_watch_signal" | "reject";

interface Dataset {
  version: string;
  profiles: Record<string, {
    targetUser: string;
    businessContext: string;
    opportunityIntents: string[];
    highValueCriteria: string[];
    exclusionRules: string[];
    prioritySourceArchetypes: string[];
    queryFamily: string;
    query: string;
  }>;
  cases: Array<{
    id: string;
    profile: string;
    scenario: string;
    candidate: {
      title: string;
      url: string;
      snippet: string;
      semanticType: string;
      sourceArchetype: string;
      publishedAt?: string;
    };
    expected: { decision: Decision; critical: boolean };
  }>;
}

const datasetPath = path.resolve("fixtures/q6-candidate-relevance.json");
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8")) as Dataset;
const failures: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

check(dataset.version === "Q6-0-v1", "dataset version must be Q6-0-v1");
check(dataset.cases.length >= 30, "dataset must contain at least 30 labelled cases");
check(new Set(dataset.cases.map((item) => item.id)).size === dataset.cases.length, "case ids must be unique");

const decisions = new Map<Decision, number>();
const scenarios = new Set<string>();
let criticalCases = 0;

for (const item of dataset.cases) {
  const profile = dataset.profiles[item.profile];
  check(Boolean(profile), `${item.id}: profile ${item.profile} must exist`);
  if (!profile) continue;
  check(Boolean(profile.targetUser.trim()), `${item.id}: targetUser is required`);
  check(profile.opportunityIntents.length > 0, `${item.id}: opportunityIntents are required`);
  check(profile.prioritySourceArchetypes.length > 0, `${item.id}: source archetypes are required`);
  check(Boolean(profile.queryFamily.trim()) && Boolean(profile.query.trim()), `${item.id}: query provenance is required`);
  check(Boolean(item.candidate.title.trim()), `${item.id}: candidate title is required`);
  check(item.candidate.url.startsWith("https://"), `${item.id}: candidate URL must be HTTPS`);
  check(Boolean(item.candidate.semanticType), `${item.id}: semantic type is required`);
  check(Boolean(item.candidate.sourceArchetype), `${item.id}: source archetype is required`);
  decisions.set(item.expected.decision, (decisions.get(item.expected.decision) ?? 0) + 1);
  scenarios.add(item.scenario);
  if (item.expected.critical) criticalCases += 1;
}

for (const decision of ["accept", "downgrade_to_watch_signal", "reject"] as const) {
  check((decisions.get(decision) ?? 0) >= 5, `decision ${decision} must have at least 5 examples`);
}

for (const scenario of [
  "positive_direct",
  "positive_lead",
  "subject_mismatch",
  "target_mismatch",
  "action_mismatch",
  "source_mismatch",
  "expired_deadline",
  "stale_year",
  "reference_not_opportunity",
  "unknown_date",
]) {
  check(scenarios.has(scenario), `scenario ${scenario} must be represented`);
}

check(Object.keys(dataset.profiles).length >= 8, "dataset must span at least 8 user profiles");
check(criticalCases >= 15, "dataset must include at least 15 critical cases");

if (failures.length > 0) {
  console.error(`Q.6-0 dataset validation failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Q.6-0 candidate relevance dataset: PASS");
console.log(`cases=${dataset.cases.length}`);
console.log(`profiles=${Object.keys(dataset.profiles).length}`);
console.log(`accept=${decisions.get("accept") ?? 0}`);
console.log(`downgrade=${decisions.get("downgrade_to_watch_signal") ?? 0}`);
console.log(`reject=${decisions.get("reject") ?? 0}`);
console.log(`critical=${criticalCases}`);
