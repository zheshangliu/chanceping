import crypto from "node:crypto";
import type { EvidenceItem, EvidenceField } from "../schema/evidence-item";
import { generateEvidenceId, shouldReviewEvidence } from "../schema/evidence-item";
import type { CleanedContent, SearchResult } from "../search/types";
import type { IchFieldProvenance } from "./source-adapters-v1";
import { evaluateIchSourcePolicy, type IchSourcePolicyResult } from "./source-policy";
import { inferIchApplicantFit, type IchApplicantFit } from "./applicant-fit";

export interface IchNormalizedCandidate {
  candidate_id: string;
  title: string;
  summary: string;
  source_url: string;
  source_id: string;
  field_provenance: {
    title: IchFieldProvenance;
    organizer: IchFieldProvenance;
    deadline_text: IchFieldProvenance;
    geography: IchFieldProvenance;
    category_hint: IchFieldProvenance;
    source_url: IchFieldProvenance;
  };
  evidence_items: EvidenceItem[];
  source_policy: IchSourcePolicyResult;
  eligible_profiles: IchApplicantFit["eligible_profiles"];
  applicant_fit: IchApplicantFit;
  raw_snapshot_hash: string;
}

function candidateId(url: string): string {
  return `ich-search-${crypto.createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

function emptyProvenance(sourceUrl: string, value: string | null, method: IchFieldProvenance["method"], confirmed: boolean, excerpt: string | null): IchFieldProvenance {
  return { value, source_url: sourceUrl, method, confirmed, evidence_excerpt: excerpt };
}

function evidenceField(field: keyof IchNormalizedCandidate["field_provenance"]): EvidenceField | null {
  if (field === "deadline_text") return "deadline";
  if (field === "category_hint") return "eligibility";
  if (field === "source_url") return "application_url";
  if (["title", "organizer", "geography"].includes(field)) return field === "geography" ? "region" : field as EvidenceField;
  return null;
}

/** Convert generic field evidence into the existing ICH provenance contract. */
export function mapEvidenceToIchProvenance(sourceUrl: string, items: EvidenceItem[], fallbackTitle: string): IchNormalizedCandidate["field_provenance"] {
  const byField = new Map(items.map((item) => [item.field, item]));
  const get = (field: keyof IchNormalizedCandidate["field_provenance"], fallback: string | null): IchFieldProvenance => {
    const generic = [...byField.values()].find((item) => evidenceField(field) === item.field);
    return generic
      ? emptyProvenance(sourceUrl, generic.value, "structured_text", !generic.needsReview, generic.evidenceText)
      : emptyProvenance(sourceUrl, fallback, fallback ? "html_title" : "not_found", Boolean(fallback), fallback);
  };
  const title = get("title", fallbackTitle || null);
  return {
    title,
    organizer: get("organizer", null),
    deadline_text: get("deadline_text", null),
    geography: get("geography", null),
    category_hint: get("category_hint", null),
    source_url: emptyProvenance(sourceUrl, sourceUrl, "listing_anchor", true, sourceUrl),
  };
}

/** Map ICH provenance back to generic EvidenceItems without losing the original excerpt. */
export function mapIchProvenanceToEvidenceItems(provenance: IchNormalizedCandidate["field_provenance"], sourceId: string): EvidenceItem[] {
  const output: EvidenceItem[] = [];
  for (const [key, item] of Object.entries(provenance) as Array<[keyof IchNormalizedCandidate["field_provenance"], IchFieldProvenance]>) {
    const field = evidenceField(key);
    if (!field || !item.value) continue;
    const confidence = item.confirmed ? 0.85 : 0.45;
    output.push({ evidenceId: generateEvidenceId(), sourceId, field, value: item.value, evidenceText: item.evidence_excerpt ?? item.value, confidence, needsReview: shouldReviewEvidence(sourceId, confidence) });
  }
  return output;
}

export function normalizeSearchResultToIchCandidate(args: {
  result: SearchResult;
  content?: CleanedContent;
  evidenceItems?: EvidenceItem[];
  sourceId?: string;
  discoveryUrl?: string;
}): IchNormalizedCandidate {
  const evidenceItems = args.evidenceItems ?? [];
  const result = args.result;
  const sourceUrl = result.url;
  const policy = evaluateIchSourcePolicy({ sourceId: args.sourceId, url: sourceUrl, discoveryUrl: args.discoveryUrl });
  const title = args.content?.title || result.title;
  const provenance = mapEvidenceToIchProvenance(sourceUrl, evidenceItems, title);
  const rawText = `${args.content?.title ?? result.title}\n${args.content?.main_text ?? result.snippet}`;
  const sourceId = args.sourceId ?? candidateId(sourceUrl);
  const applicant_fit = inferIchApplicantFit(rawText);
  return { candidate_id: candidateId(sourceUrl), title, summary: args.content?.main_text?.slice(0, 500) || result.snippet, source_url: sourceUrl, source_id: sourceId, field_provenance: provenance, evidence_items: evidenceItems, source_policy: policy, eligible_profiles: applicant_fit.eligible_profiles, applicant_fit, raw_snapshot_hash: crypto.createHash("sha256").update(rawText).digest("hex") };
}
