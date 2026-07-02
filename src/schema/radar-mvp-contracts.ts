export type SourceCheckStatus =
  | "checked_with_results"
  | "checked_no_results"
  | "failed"
  | "not_checked";

export type OpportunityKind =
  | "direct_opportunity"
  | "business_lead"
  | "reference_case"
  | "watch_signal"
  | "rejected";

export type SearchIntentType = Exclude<OpportunityKind, "rejected">;

export type EvidenceStatus =
  | "confirmed"
  | "partially_verified"
  | "needs_review"
  | "unverified";

export type ActionStatus = "act_now" | "prepare" | "monitor" | "drop";

export type ScoreBasis = "fact" | "model_judgment" | "mixed";

export type FieldEvidenceName =
  | "title"
  | "source_url"
  | "source_domain"
  | "source_type"
  | "registration_or_application_signal"
  | "date_or_deadline"
  | "fee"
  | "eligibility"
  | "contact_or_application_route";

export type FieldEvidenceStatus =
  | "verified"
  | "partially_verified"
  | "unverified"
  | "not_found"
  | "failed";

export type FieldEvidenceBasis =
  | "fetched_content"
  | "search_result"
  | "not_checked";

export interface FieldEvidenceItem {
  field: FieldEvidenceName;
  status: FieldEvidenceStatus;
  basis: FieldEvidenceBasis;
  sourceUrl: string;
  sourceDomain: string;
  value?: string;
  evidenceText?: string;
  error?: string;
  checkedAt?: string;
}

export interface RadarProfileRevisionMeta {
  id: string;
  radarId?: string;
  version: number;
  changedFields: string[];
  changeSummary: string;
  confirmedAt: string;
}

export interface ProjectReadinessSnapshot {
  id: string;
  radarId?: string;
  runId?: string;
  availableAssets: string[];
  qualifications: string[];
  materialGaps: string[];
  timeBudget?: string;
  moneyBudget?: string;
  packagingOptions: string[];
  assumptions: string[];
}

export interface RadarSearchPlan {
  id: string;
  radarId?: string;
  runId?: string;
  profileRevisionId?: string;
  themes: string[];
  searchThemes?: Array<{
    id: string;
    themeName: string;
    intentType: SearchIntentType;
    sourceArchetype: string;
    queryExamples: string[];
    whyThisTheme: string;
  }>;
  queries: Array<{
    query: string;
    language: string;
    region?: string;
    timeWindow?: string;
    sourceDomain?: string;
    themeName?: string;
    intentType?: SearchIntentType;
    sourceArchetype?: string;
    queryFamily?: string;
  }>;
  configuredSources: string[];
  exclusions: string[];
  maxCandidates: number;
}

export interface SearchExecutionLog {
  runId?: string;
  queryExecutions: Array<{
    query: string;
    provider: string;
    startedAt: string;
    status: "succeeded" | "failed" | "no_results";
    rawResultCount: number;
    error?: string;
    themeName?: string;
    intentType?: SearchIntentType;
    sourceArchetype?: string;
    queryFamily?: string;
    retryCount?: number;
  }>;
  openedUrls: Array<{
    url: string;
    status: "succeeded" | "partial" | "failed";
    errorType?: string;
    fetchedAt: string;
    title?: string;
    wordCount?: number;
  }>;
}

export interface CandidateAccounting {
  runId?: string;
  rawCount: number;
  deduplicatedCount: number;
  assessedCount: number;
  acceptedCount: number;
  rejectedCount: number;
}

export interface SourceCoverageItem {
  sourceName: string;
  sourceUrl?: string;
  status: SourceCheckStatus;
  resultCount: number;
  error?: string;
}

export interface OpportunityAssessment {
  opportunityId: string;
  radarId?: string;
  runId?: string;
  profileRevisionId?: string;
  kind: OpportunityKind;
  evidenceStatus: EvidenceStatus;
  actionStatus: ActionStatus;
  score: number;
  grade?: "S" | "A" | "B" | "C";
  scoringPolicyVersion: string;
  scoreItems: Array<{
    key: string;
    label: string;
    score: number;
    weight: number;
    basis: ScoreBasis;
    evidenceIds: string[];
    reason: string;
  }>;
  assessedAt: string;
  supersedes?: string;
}
