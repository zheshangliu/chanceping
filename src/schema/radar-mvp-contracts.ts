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

export type EvidenceStatus =
  | "confirmed"
  | "partially_verified"
  | "needs_review"
  | "unverified";

export type ActionStatus = "act_now" | "prepare" | "monitor" | "drop";

export type ScoreBasis = "fact" | "model_judgment" | "mixed";

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
  queries: Array<{
    query: string;
    language: string;
    region?: string;
    timeWindow?: string;
    sourceDomain?: string;
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
    status: "succeeded" | "failed";
    rawResultCount: number;
    error?: string;
  }>;
  openedUrls: Array<{
    url: string;
    status: "succeeded" | "partial" | "failed";
    errorType?: string;
    fetchedAt: string;
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
