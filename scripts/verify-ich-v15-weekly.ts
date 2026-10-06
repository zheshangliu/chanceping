import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { ichPagesRoutes } from "../src/api/routes/ich-pages";
import { buildWeeklyOpportunityActions } from "../src/opportunity-v2/procurement-workbench";
import { isCraftRelevantProcurement } from "../src/opportunity-v2/procurement";
import { buildOpportunityV2Display, isForeignLanguageOpportunity, isForeignLanguageTitle } from "../src/opportunity-v2/display";
import { filterOpportunityV2Radar } from "../src/opportunity-v2/radar-view";
import { serializeOpportunityV2Public } from "../src/opportunity-v2/public-deadline";
import { getOpportunityV2SourcePermission, getOpportunityV2SourcePermissionEvidence, isOpportunityV2PublicSummaryAllowed, isOpportunityV2SourceCollectionAllowed } from "../src/opportunity-v2/source-governance";
import { collectOpportunityV2TranslationTargets } from "../src/opportunity-v2/translation-targets";
import { selectOpportunityV2TranslationQueue } from "../src/opportunity-v2/translation-queue";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const now = new Date("2026-10-06T00:00:00.000Z");
const source: OpportunityV2Source = {
  id: "test-weekly-source", name: "手工艺机会来源", url: "https://example.org/opportunities", region: "GLOBAL", priority: "P0",
  types: ["competition", "craft"], radars: ["ich"], enabled: true, status: "ACTIVE", last_fetch_at: now.toISOString(),
};

function item(overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return {
    id: "weekly-test-01", title: "International Craft Open Call 2026", summary: "Open call for craft makers; submissions close 2026-10-30.",
    source_id: source.id, source_item_id: "weekly-01", source_name: source.name, source_url: source.url,
    detail_url: "https://example.org/opportunities/weekly-01", category: "competition", region: "GLOBAL", tags: ["craft"],
    deadline: "2026-10-30", deadline_text: "Closing date 2026-10-30", status: "CURRENT", first_seen_at: "2026-09-01T00:00:00.000Z",
    last_seen_at: now.toISOString(), discovered_by_sources: [source.id], radar_relevance: "RELEVANT", participation_scope: "unspecified",
    ...overrides,
  };
}

async function main(): Promise<void> {
  const current = Array.from({ length: 11 }, (_, index) => item({
    id: `weekly-current-${String(index + 1).padStart(2, "0")}`,
    source_item_id: `weekly-${index + 1}`,
    detail_url: `https://example.org/opportunities/weekly-${index + 1}`,
    title: `International Craft Open Call 2026 ${index + 1}`,
  }));
  const expired = item({ id: "weekly-expired", title: "Expired Craft Competition 2026", deadline: "2026-09-01", status: "CURRENT" });
  const resultOnly = item({ id: "weekly-result", title: "Craft Award Winners Announced 2026", summary: "The 2026 winners and selected finalists have been announced." });
  const cancelled = item({ id: "weekly-cancelled", title: "Cancelled Craft Open Call 2026", summary: "This open call has been cancelled." });
  const conflict = item({ id: "weekly-conflict", title: "Rolling Craft Opportunity 2026", deadline: null, deadline_text: "", status: "UNKNOWN_DEADLINE", is_long_term: true, deadline_conflict_unsafe: true });
  const pool = [...current, expired, resultOnly, cancelled, conflict];
  const actions = buildWeeklyOpportunityActions({ opportunities: pool, sources: [source], now });
  assert.equal(actions.length, 10, "11 eligible actions are capped at 10");
  assert.equal(actions.some((action) => action.opportunity_id === expired.id), false, "expired opportunity is blocked even if its stored status is stale");
  assert.equal(actions.some((action) => action.opportunity_id === resultOnly.id), false, "result-only notice is not an action");
  assert.equal(actions.some((action) => action.opportunity_id === cancelled.id), false, "cancelled call is not an action");
  assert.equal(actions.every((action) => action.money_fact === null), true, "unsubstantiated money is omitted, never rendered as zero or a grant");
  assert.equal(isForeignLanguageOpportunity({ title: "2026年非遗创意大赛", summary: "This opportunity is open to eligible applicants worldwide." }), true, "English summary remains a translation target");
  assert.equal(isForeignLanguageTitle({ title: "2026年非遗创意大赛" }), false, "a Chinese-native title is not included in the foreign-title denominator");
  assert.equal(buildOpportunityV2Display(current[0]).summary, "", "NOT_REVIEWED sources expose metadata and source links, not copied summaries");
  assert.equal(serializeOpportunityV2Public(current[0]).summary, "", "public JSON applies the same metadata-only source rule");
  assert.equal(getOpportunityV2SourcePermission("proc-ca-canadabuys"), "OFFICIAL_OPEN_DATA", "CanadaBuys has dataset-specific official open-data evidence");
  assert.match(getOpportunityV2SourcePermissionEvidence("proc-ca-canadabuys").url ?? "", /open\.canada\.ca\/data/u);
  assert.equal(isOpportunityV2PublicSummaryAllowed("proc-ca-canadabuys"), true);
  assert.equal(getOpportunityV2SourcePermission("proc-global-ocp"), "OFFICIAL_OPEN_DATA", "the OCP adapter is pinned to Sell2Wales OCDS data with an official OGL reuse policy");
  assert.match(getOpportunityV2SourcePermissionEvidence("proc-global-ocp").url ?? "", /sell2wales\.gov\.wales\/helpandresources\/ocds\/publicationpolicy/u);
  assert.match(getOpportunityV2SourcePermissionEvidence("proc-global-ocp").basis, /third-party attachments.*personal data/u);
  assert.equal(isOpportunityV2PublicSummaryAllowed("proc-global-ocp"), true);
  assert.equal(getOpportunityV2SourcePermission("1zj-cultural-competition"), "NOT_REVIEWED", "aggregator use terms are not inferred from public availability");
  const reviewedButUnlicensedSources = [
    "crafts-council-opportunities", "everyart-competition", "proc-cn-cib", "proc-cn-ccgp",
    "shejijingsai-list", "whaleideas-competition", "1zj-cultural-competition", "iuben-cultural-competition",
    "chuangsaiyun-competition-list", "cnyisai-competition", "contest-watchers-open", "competitions-archi", "cfw-cultural-ip",
  ];
  for (const sourceId of reviewedButUnlicensedSources) {
    const evidence = getOpportunityV2SourcePermissionEvidence(sourceId);
    assert.equal(getOpportunityV2SourcePermission(sourceId), "NOT_REVIEWED", `${sourceId} must not gain inferred permission`);
    assert.ok(evidence.url, `${sourceId} governance record links to reviewed official/source evidence`);
    assert.notEqual(evidence.basis, "NOT_REVIEWED; no permission/license conclusion is made. Public display is limited to necessary metadata and source link.", `${sourceId} has an explicit scope note`);
    assert.equal(isOpportunityV2PublicSummaryAllowed(sourceId), false, `${sourceId} remains metadata-only until a reuse grant is verified`);
  }
  assert.equal(getOpportunityV2SourcePermission("opencalls-ai"), "COMPLIANCE_HOLD", "official opencalls.ai terms prohibit automated catalogue extraction");
  assert.equal(isOpportunityV2SourceCollectionAllowed("opencalls-ai"), false);
  const complianceHoldFixtures: Array<{ id: string; name: string; url: string; title: string }> = [
    { id: "curatorspace-opportunities", name: "CuratorSpace Opportunities", url: "https://www.curatorspace.com/opportunities?orderBy=latest", title: "CuratorSpace Craft Open Call" },
    { id: "american-craft-council-opportunities", name: "American Craft Council Opportunities Board", url: "https://craftcouncil.org/opportunities-board/", title: "American Craft Council Maker Fellowship" },
    { id: "cafe-call-for-entry", name: "CaFÉ CallForEntry", url: "https://artist.callforentry.org/festivals.php/calendar.phtml", title: "CaFÉ Craft Exhibition Call for Entry" },
  ];
  for (const [index, held] of complianceHoldFixtures.entries()) {
    assert.equal(getOpportunityV2SourcePermission(held.id), "COMPLIANCE_HOLD");
    assert.equal(isOpportunityV2SourceCollectionAllowed(held.id), false);
    const heldSource: OpportunityV2Source = { ...source, id: held.id, name: held.name, url: held.url };
    const heldItem = item({ id: `weekly-held-${index}`, title: held.title, source_id: held.id, source_name: held.name, source_url: held.url, discovered_by_sources: [held.id], detail_url: `${held.url.replace(/\/$/u, "")}/detail` });
    assert.equal(buildWeeklyOpportunityActions({ opportunities: [heldItem], sources: [heldSource], now }).length, 0, `held source ${held.id} does not appear in public Weekly Actions`);
  }

  const conflictOnly = buildWeeklyOpportunityActions({ opportunities: [conflict], sources: [source], now });
  assert.equal(conflictOnly.length, 1);
  assert.equal(conflictOnly[0].lane, "review", "deadline conflicts are hard blockers for action ranking");
  assert.equal(conflictOnly[0].deadline, null);
  assert.match(conflictOnly[0].deadline_text, /核实|确认/u);

  const four = buildWeeklyOpportunityActions({ opportunities: current.slice(0, 4), sources: [source], now });
  assert.equal(four.length, 4, "short lists show their real size; the system never fills a quota");
  assert.equal(four[0].evidence_state, "DISCOVERY_ONLY");
  assert.equal(four[0].evidence_grade, "B", "an opportunity-specific listing URL is explicitly evidence grade B");
  assert.match(four[0].evidence_state_text, /官方条件待核/u);
  assert.match(four[0].eligibility_summary, /尚未结构化/u);
  assert.match(four[0].risk_flags.join(" "), /官方条件待核/u);
  assert.equal(four[0].title_translation_status, "pending");
  assert.equal(four[0].freshness, "FRESH");
  assert.equal(four[0].evidence_excerpt, current[0].title, "weekly evidence falls back to the minimum necessary title metadata");

  const craftGrant = item({
    id: "weekly-craft-grant", source_item_id: "grant-01", category: "policy_funding", directions: ["craft_arts"],
    title: "International Craft Fellowship Grant 2026 Open Call", summary: "The grant supports traditional craft makers; applications are open until 2026-11-01.",
    deadline: "2026-11-01", deadline_text: "Applications close 2026-11-01", official_url: "https://example.org/official/grant-01",
  });
  const broadDesignContests = Array.from({ length: 9 }, (_, index) => item({
    id: `weekly-logo-${index}`, source_item_id: `logo-${index}`, title: `International Logo Design Contest 2026 ${index}`,
    summary: "Open call for a generic brand logo contest; deadline 2026-11-01.",
    deadline: "2026-11-01", deadline_text: "Closing 2026-11-01", tags: ["design"],
  }));
  const weighted = buildWeeklyOpportunityActions({ opportunities: [...broadDesignContests, craftGrant], sources: [source], now });
  assert.equal(weighted[0]?.opportunity_id, craftGrant.id, "a high-quality craft funding action ranks ahead of generic logo contests");
  assert.equal(weighted.filter((action) => action.type_labels.includes("赛事 / 征集")).length <= 6, true, "high-quality non-contest actions cap contest recommendations at six");
  assert.equal(weighted.find((action) => action.opportunity_id === craftGrant.id)?.evidence_grade, "A", "official opportunity evidence is grade A");

  const procurementSource: OpportunityV2Source = {
    ...source, id: "proc-ca-canadabuys", name: "CanadaBuys", types: ["procurement"], radars: ["ich"],
  };
  const procurementItem = (id: string, title: string, summary: string): OpportunityV2 => item({
    id, source_id: procurementSource.id, source_name: procurementSource.name, source_url: procurementSource.url,
    detail_url: `https://example.org/procurement/${id}`, category: "procurement_project", tags: ["procurement", "文化服务"],
    title, summary, deadline: "2026-11-10", status: "CURRENT",
    discovered_by_sources: [procurementSource.id],
    procurement: { direction: "buyer_demand", stage: "open", notice_type: "other", project_id: id, milestones: [] },
  });
  const dutyOfCare = procurementItem("weekly-generic-duty-of-care", "Duty of Care Services", "Travel risk management, digital training, medical and security advice, and cultural guidance for employee travel.");
  const museumSecurity = procurementItem("weekly-generic-museum-security", "Security Service - National Coal Museum", "Security services for the museum and its premises.");
  const realCraftSupply = procurementItem("weekly-museum-craft-supply", "Museum Craft Shop seeks ceramic gifts", "The museum shop invites ceramic craft makers to apply as suppliers for handmade cultural gifts.");
  assert.equal(isCraftRelevantProcurement(`${dutyOfCare.title} ${dutyOfCare.summary}`), false, "incidental cultural guidance does not make travel-risk procurement an ICH opportunity");
  assert.equal(isCraftRelevantProcurement(`${museumSecurity.title} ${museumSecurity.summary}`), false, "a cultural buyer name does not make a security contract craft-relevant");
  const procurementWeekly = buildWeeklyOpportunityActions({
    opportunities: [dutyOfCare, museumSecurity, realCraftSupply], sources: [procurementSource], now,
  });
  assert.equal(procurementWeekly.some((action) => action.opportunity_id === dutyOfCare.id), false);
  assert.equal(procurementWeekly.some((action) => action.opportunity_id === museumSecurity.id), false);
  assert.equal(procurementWeekly.some((action) => action.opportunity_id === realCraftSupply.id), true, "specific museum craft supply opportunities remain eligible");
  assert.equal(filterOpportunityV2Radar([dutyOfCare, museumSecurity], [procurementSource], { now, status: "browse" }).length, 0, "generic service contracts are also excluded from the public Radar despite incidental cultural tags");
  assert.equal(filterOpportunityV2Radar([realCraftSupply], [procurementSource], { now, status: "browse" }).length, 1, "specific craft-supply procurement remains visible on Radar");

  const sourceFile = path.join(os.tmpdir(), `ich-v15-weekly-sources-${process.pid}.json`);
  const poolFile = path.join(os.tmpdir(), `ich-v15-weekly-pool-${process.pid}.json`);
  const translationFile = path.join(os.tmpdir(), `ich-v15-weekly-translations-${process.pid}.json`);
  const oldTranslationPath = process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH;
  try {
    fs.writeFileSync(sourceFile, JSON.stringify({ schema_version: "chanceping-opportunity-v2.sources.v1", updated_at: now.toISOString(), sources: [source] }));
    fs.writeFileSync(poolFile, JSON.stringify({ schema_version: "chanceping-opportunity-v2.v1", updated_at: now.toISOString(), opportunities: current.slice(0, 4) }));
    fs.writeFileSync(translationFile, JSON.stringify({ schema_version: "chanceping-opportunity-v2.translation.v1", updated_at: now.toISOString(), translations: [] }));
    process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH = translationFile;
    const page = new Hono();
    page.route("/ich", ichPagesRoutes({ opportunityV2: true, opportunityV2PoolPath: poolFile, opportunityV2SourcesPath: sourceFile, now: () => now }));
    const response = await page.request("http://localhost/ich/weekly");
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /本周值得看/u);
    assert.match(html, /全球文创・非遗・手工艺机会雷达/u);
    assert.match(html, /仅有发现来源链接/u);
    assert.match(html, /来源最近抓取/u);
    assert.match(html, /中文待补 · 暂显原文/u);
    assert.doesNotMatch(html, /2026-10-06T00:00:00\.000Z/u, "public page formats source timestamps for people");
    assert.doesNotMatch(html, /奖金为零|资助金额为0/u);

    const unknownDeadline = item({ id: "weekly-unknown", deadline: null, status: "UNKNOWN_DEADLINE", is_long_term: true });
    const oldTarget = item({ id: "weekly-history", deadline: "2026-09-01", status: "EXPIRED" });
    const targets = collectOpportunityV2TranslationTargets([current[0], unknownDeadline, oldTarget], [source], now);
    const p0 = targets.find((target) => target.item.id === current[0].id);
    assert.equal(p0?.priority, 0, "selected weekly/current foreign titles are P0 translation targets");
    assert.equal(targets.some((target) => target.item.id === oldTarget.id), false, "expired foreign titles do not consume P0/P1 daily translation budget");
    const queue = selectOpportunityV2TranslationQueue(targets, [], { now, maxItems: 1 });
    assert.equal(queue.selected[0]?.item.id, current[0].id, "current weekly title wins the bounded translation queue");
  } finally {
    if (oldTranslationPath === undefined) delete process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH;
    else process.env.CHANCEPING_OPPORTUNITY_V2_TRANSLATION_PATH = oldTranslationPath;
    for (const file of [sourceFile, poolFile, translationFile]) fs.rmSync(file, { force: true });
  }
  console.log("ICH_V15_WEEKLY: PASS (10 cap; no quota fill; hard blockers; evidence/freshness; shared shell; current translation P0)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
