import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildOpportunityV2MemoSnapshot } from "../src/opportunity-v2/memo";
import { mergeOpportunityV2, readOpportunityV2Pool, selectDeadlineBundle } from "../src/opportunity-v2/opportunity-pool";
import { readOpportunityV2Sources } from "../src/opportunity-v2/source-pool";
import type { DeadlineBundle } from "../src/opportunity-v2/opportunity-pool";
import type { OpportunityV2 } from "../src/opportunity-v2/types";

const NOW = new Date(process.env.ICH_DEADLINE_AUDIT_NOW ?? "2026-09-09T00:00:00.000Z");
const RUNTIME_ROOT = process.env.CHANCEPING_OPPORTUNITY_V2_RUNTIME_DIR;

function bundle(overrides: Partial<DeadlineBundle> = {}): DeadlineBundle {
  return {
    deadline: "2026-09-30T15:59:00.000Z",
    deadline_text: "提交截止：2026年9月30日",
    deadline_source_url: "https://example.com/detail",
    deadline_raw_text: "提交截止：2026年9月30日",
    deadline_checked_at: NOW.toISOString(),
    deadline_resolution: "found_detail",
    deadline_kind: "submission_deadline",
    source_id: "fixture-source",
    detail_url: "https://example.com/detail",
    evidence_strength: 3,
    ...overrides,
  };
}

function opportunity(overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return {
    id: "oppv2_deadline_fixture",
    title: "2026 手工艺设计赛事",
    summary: "真实赛事摘要",
    source_id: "fixture-source",
    source_item_id: "fixture-item",
    source_name: "Fixture Source",
    source_url: "https://example.com/list",
    detail_url: "https://example.com/detail",
    category: "competition",
    region: "CN",
    tags: [],
    deadline: "2026-09-30T15:59:00.000Z",
    deadline_text: "提交截止：2026年9月30日",
    deadline_source_url: "https://example.com/detail",
    deadline_raw_text: "提交截止：2026年9月30日",
    deadline_checked_at: NOW.toISOString(),
    deadline_resolution: "found_detail",
    deadline_kind: "submission_deadline",
    status: "CURRENT",
    first_seen_at: NOW.toISOString(),
    last_seen_at: NOW.toISOString(),
    discovered_by_sources: ["fixture-source"],
    radar_relevance: "RELEVANT",
    ...overrides,
  };
}

function runFixtures(): Record<string, string> {
  const prior = bundle({
    deadline: "2026-09-30T15:59:00.000Z",
    deadline_text: "提交截止：2026年9月30日",
    deadline_raw_text: "提交截止：2026年9月30日",
    evidence_strength: 3,
  });
  const incoming = bundle({
    deadline: "2026-10-20T15:59:00.000Z",
    deadline_text: "报名截止：2026年10月20日",
    deadline_raw_text: "报名截止：2026年10月20日",
    deadline_kind: "registration_deadline",
    evidence_strength: 2,
    source_id: "fixture-source-2",
    detail_url: "https://example.com/list",
    deadline_source_url: "https://example.com/list",
    deadline_resolution: "found_listing",
  });
  const selected = selectDeadlineBundle([prior, incoming], NOW);
  assert.equal(selected.selected.deadline, prior.deadline);
  assert.equal(selected.selected.deadline_raw_text, prior.deadline_raw_text);
  assert.equal(selected.selected.deadline_source_url, prior.deadline_source_url);

  const genericVsApplication = selectDeadlineBundle([
    bundle({ deadline: "2026-09-30T15:59:00.000Z", deadline_kind: "deadline", evidence_strength: 3, deadline_raw_text: "截止：2026年9月30日", deadline_text: "截止：2026年9月30日" }),
    bundle({ deadline: "2026-10-20T15:59:00.000Z", deadline_kind: "application_deadline", evidence_strength: 2, deadline_raw_text: "申请截止：2026年10月20日", deadline_text: "申请截止：2026年10月20日" }),
  ], NOW);
  assert.equal(genericVsApplication.selected.deadline, "2026-10-20T15:59:00.000Z");
  assert.equal(genericVsApplication.selected.deadline_kind, "application_deadline");

  const applicationVsSubmission = selectDeadlineBundle([
    bundle({ deadline: "2026-10-20T15:59:00.000Z", deadline_kind: "application_deadline", evidence_strength: 3, deadline_raw_text: "申请截止：2026年10月20日", deadline_text: "申请截止：2026年10月20日" }),
    bundle({ deadline: "2026-09-30T15:59:00.000Z", deadline_kind: "submission_deadline", evidence_strength: 2, deadline_raw_text: "投稿截止：2026年9月30日", deadline_text: "投稿截止：2026年9月30日" }),
  ], NOW);
  assert.equal(applicationVsSubmission.selected.deadline, "2026-09-30T15:59:00.000Z");
  assert.equal(applicationVsSubmission.selected.deadline_kind, "submission_deadline");

  const sameKindConflict = selectDeadlineBundle([
    bundle({ deadline: "2026-09-30T15:59:00.000Z" }),
    bundle({ deadline: "2026-10-20T15:59:00.000Z", source_id: "fixture-source-2", detail_url: "https://example.com/detail-2", deadline_source_url: "https://example.com/detail-2", deadline_raw_text: "提交截止：2026年10月20日", deadline_text: "提交截止：2026年10月20日" }),
  ], NOW);
  assert.equal(sameKindConflict.selected.deadline, null);
  assert.equal(sameKindConflict.selected.deadline_resolution, "date_conflict");
  assert.equal(sameKindConflict.unsafe, true);

  const historical = selectDeadlineBundle([
    bundle({ deadline: "2026-08-30T15:59:00.000Z", deadline_raw_text: "提交截止：2026年8月30日", deadline_text: "提交截止：2026年8月30日" }),
    bundle({ deadline: "2026-10-20T15:59:00.000Z", deadline_raw_text: "提交截止：2026年10月20日", deadline_text: "提交截止：2026年10月20日", source_id: "fixture-source-2" }),
  ], NOW);
  assert.equal(historical.selected.deadline, "2026-10-20T15:59:00.000Z");
  assert.equal(historical.unsafe, false);

  const atomic = mergeOpportunityV2(
    [opportunity({ deadline: prior.deadline, deadline_text: prior.deadline_text, deadline_raw_text: prior.deadline_raw_text, deadline_source_url: prior.deadline_source_url, deadline_kind: prior.deadline_kind })],
    [opportunity({ id: "oppv2_deadline_fixture_incoming", deadline: incoming.deadline, deadline_text: incoming.deadline_text, deadline_raw_text: incoming.deadline_raw_text, deadline_source_url: incoming.deadline_source_url, deadline_kind: incoming.deadline_kind })],
    NOW,
  );
  assert.equal(atomic.length, 1);
  assert.equal(atomic[0]?.deadline, prior.deadline);
  assert.equal(atomic[0]?.deadline_raw_text, prior.deadline_raw_text);
  assert.equal(atomic[0]?.deadline_source_url, prior.deadline_source_url);

  return {
    atomic_evidence_bundle: "PASS",
    generic_vs_application_priority: "PASS",
    application_vs_submission_priority: "PASS",
    same_kind_conflict_downgrades_unknown: "PASS",
    historical_conflict_keeps_current: "PASS",
  };
}

function auditRuntime(): Record<string, unknown> | null {
  const poolPath = process.env.CHANCEPING_OPPORTUNITY_V2_POOL_PATH ?? (RUNTIME_ROOT ? path.join(RUNTIME_ROOT, "opportunities.json") : "data/opportunity-v2/opportunities.json");
  if (!fs.existsSync(poolPath)) return null;
  const pool = readOpportunityV2Pool(poolPath);
  const sourcesPath = process.env.CHANCEPING_OPPORTUNITY_V2_SOURCES_PATH ?? (RUNTIME_ROOT ? path.join(RUNTIME_ROOT, "sources.json") : "data/opportunity-v2/sources.json");
  const sources = readOpportunityV2Sources(sourcesPath);
  const memo = buildOpportunityV2MemoSnapshot({ opportunities: pool.opportunities, sources, health: [], alreadyFiltered: false, generatedAt: NOW.toISOString(), poolUpdatedAt: pool.updated_at });
  const conflicts = memo.items.filter((item) => (item.deadline_conflicts?.length ?? 0) > 0);
  const unsafeSelected = conflicts.filter((item) => Boolean(item.deadline_conflict_unsafe && item.deadline));
  const downgraded = conflicts.filter((item) => Boolean(item.deadline_conflict_unsafe && !item.deadline));
  const safeConflicts = conflicts.filter((item) => !item.deadline_conflict_unsafe && Boolean(item.deadline));
  const applicationKinds = new Set(["application_deadline", "submission_deadline", "registration_deadline"]);
  const applicationConflicts = conflicts.filter((item) => applicationKinds.has(item.deadline_kind ?? "") || (item.deadline_conflicts ?? []).some((conflict) => applicationKinds.has(conflict.kind ?? "")));
  const rows = conflicts.map((item) => ({
    id: item.id,
    title: item.title,
    selected_deadline: item.deadline,
    selected_deadline_kind: item.deadline_kind ?? null,
    selected_evidence: item.deadline_raw_text ?? item.deadline_text ?? null,
    selected_source_url: item.deadline_source_url ?? null,
    conflicting_deadlines: (item.deadline_conflicts ?? []).map((conflict) => ({ deadline: conflict.conflicting_deadline, kind: conflict.kind ?? null, evidence: conflict.evidence, source_url: conflict.source_url ?? null })),
    unsafe_reason: item.deadline_conflict_unsafe ? "same semantic deadline has no stronger evidence" : null,
  }));
  return {
    current_memo_conflict_count: conflicts.length,
    date_conflict_resolution_count: conflicts.filter((item) => item.deadline_resolution === "date_conflict").length,
    application_deadline_conflicts: applicationConflicts.length,
    unsafe_selected_deadline_count: unsafeSelected.length,
    safe_conflicts: safeConflicts.length,
    downgraded_to_deadline_unknown: downgraded.length,
    memo_total: memo.total,
    known_deadline: memo.known_deadlines,
    unknown_deadline: memo.unknown_deadlines,
    coverage_rate: memo.total ? Number(((memo.known_deadlines / memo.total) * 100).toFixed(2)) : 0,
    rows,
  };
}

const fixtures = runFixtures();
const runtime = auditRuntime();
const result = { now: NOW.toISOString(), fixtures, ...(runtime ? { runtime } : {}) };
const output = process.env.CHANCEPING_DEADLINE_CONFLICT_AUDIT_OUTPUT;
if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
if (runtime && Number(runtime.unsafe_selected_deadline_count) > 0) process.exitCode = 1;
