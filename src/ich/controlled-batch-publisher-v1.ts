import { compareIchOpportunities } from "./dedup";
import { computeIchOpportunityStatus } from "./status";
import { findIchSemanticIssues } from "./semantic-validation";
import { validateIchOpportunity } from "./validation";
import type { IchOpportunity } from "./types";

export interface IchBatchDecision { id: string; slug: string; decision: "eligible" | "blocked"; reasons: string[]; }

export function evaluateControlledBatch(candidates: IchOpportunity[], existing: IchOpportunity[], now: Date, maxBatchSize = 10): IchBatchDecision[] {
  const decisions: IchBatchDecision[] = candidates.map((candidate) => ({ id: candidate.id, slug: candidate.slug, decision: "eligible", reasons: [] }));
  if (candidates.length > maxBatchSize) for (const decision of decisions) { decision.decision = "blocked"; decision.reasons.push(`batch size ${candidates.length} exceeds max ${maxBatchSize}`); }
  const seenIds = new Set(existing.map((entry) => entry.id));
  const seenSlugs = new Set(existing.map((entry) => entry.slug));
  const seenUrls = new Set(existing.flatMap((entry) => entry.sources.filter((source) => source.is_primary).map((source) => source.url.replace(/#.*$/, "").replace(/\/$/, ""))));
  for (const [index, candidate] of candidates.entries()) {
    const decision = decisions[index]!;
    const block = (reason: string) => { decision.decision = "blocked"; decision.reasons.push(reason); };
    const validation = validateIchOpportunity(candidate);
    if (!validation.valid) block(`validation: ${validation.errors.join("; ")}`);
    if (candidate.workflow.state !== "approved") block(`workflow=${candidate.workflow.state}, required=approved`);
    if (candidate.is_published) block("candidate is already published");
    if (candidate.classification_status !== "confirmed") block(`classification=${candidate.classification_status}, required=confirmed`);
    const primary = candidate.sources.find((source) => source.is_primary);
    if (!primary) block("primary source is required");
    else {
      if (!primary.is_accessible) block("primary source must be accessible");
      const normalizedUrl = primary.url.replace(/#.*$/, "").replace(/\/$/, "");
      if (seenUrls.has(normalizedUrl)) block("primary source URL duplicates an existing record");
      seenUrls.add(normalizedUrl);
    }
    if (seenIds.has(candidate.id)) block("id duplicates an existing record");
    if (seenSlugs.has(candidate.slug)) block("slug duplicates an existing record");
    seenIds.add(candidate.id); seenSlugs.add(candidate.slug);
    if (computeIchOpportunityStatus(candidate, now) === "expired" || computeIchOpportunityStatus(candidate, now) === "ended") block("candidate is no longer actionable");
    const semanticIssues = findIchSemanticIssues(candidate, existing);
    if (semanticIssues.length) block(`semantic issues: ${semanticIssues.map((issue) => issue.field).join(", ")}`);
    const duplicate = existing.map((entry) => compareIchOpportunities(entry, candidate)).find((result) => result.decision === "duplicate");
    if (duplicate) block(`dedup: ${duplicate.reason}`);
  }
  return decisions;
}
