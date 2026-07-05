import type { OpportunityKind, SearchIntentType, SearchQueryVariant } from "./radar-mvp-contracts";
import type { RadarRequirementSpec } from "./radar-requirement-spec";

export type RadarVersionId = `V${number}.${number}`;

export type RadarVersionRevisionType =
  | "added"
  | "removed"
  | "upweighted"
  | "downweighted"
  | "assumption_changed"
  | "query_shift"
  | "source_shift";

export interface RadarVersionRevisionNote {
  type: RadarVersionRevisionType;
  detail: string;
}

export interface RadarVersionQueryFamily {
  familyName: string;
  intentType: SearchIntentType | "retail_customer_lead";
  sourceArchetype: string;
  queries: string[];
  queryVariants?: Array<{
    query: string;
    variant: SearchQueryVariant;
  }>;
  whyThisFamily: string;
  resultBucket?: OpportunityKind | "retail_customer_lead";
}

export interface RadarVersionScoringRule {
  key: string;
  label: string;
  weight: number;
  highScoreRule: string;
}

export interface RadarVersionSpec {
  version: RadarVersionId;
  oneSentencePositioning: string;
  targetUser: string;
  businessContext: string;
  opportunityIntents: string[];
  highValueCriteria: string[];
  exclusionRules: string[];
  prioritySourceArchetypes: string[];
  queryFamilies: RadarVersionQueryFamily[];
  scoringRules: RadarVersionScoringRule[];
  reportTemplate: string[];
  missingConfig: string[];
  defaultAssumptions: string[];
  revisionNotes: RadarVersionRevisionNote[];
  resultBuckets: string[];
}

export type RadarRevisionTrigger =
  | "requirement_correction"
  | "strategy_adjustment"
  | "result_feedback"
  | "source_feedback";

export interface RadarVersionDiff {
  fromVersion: RadarVersionId;
  toVersion: RadarVersionId;
  summary: string;
  added: string[];
  removed: string[];
  upweighted: string[];
  downweighted: string[];
  assumptionChanges: string[];
  queryShifts: string[];
  sourceShifts: string[];
  highValueCriteriaChanges: string[];
  exclusionChanges: string[];
}

export interface RadarResultFeedback {
  rejectedCardTitles?: string[];
  expectedOpportunityType?: string;
  rejectedReason?: string;
  freeText?: string;
}

export interface RadarRevisionChatContextMessage {
  role: "user" | "assistant" | "system_event";
  content: string;
  linkedRadarVersion?: string;
  linkedRunId?: string;
  linkedReportId?: string;
  artifactType?: "radar" | "report" | "progress";
  createdAt?: string;
}

export interface RadarRevisionMemorySummary {
  summary: string;
  targetUser?: string;
  watchingFor: string[];
  exclusions: string[];
  confirmedRules: string[];
  rejectedPatterns: string[];
  lastFeedback?: string;
  updatedAt?: string;
}

export interface RadarRevisionChatContext {
  chatWindowId?: string;
  radarId?: string;
  title?: string;
  currentConfirmedRadarVersion?: string;
  draftRadarVersion?: string;
  memorySummary?: RadarRevisionMemorySummary;
  recentMessages?: RadarRevisionChatContextMessage[];
}

export interface RadarRevisionRequest {
  description?: string;
  userMessage: string;
  trigger: RadarRevisionTrigger;
  previousSpec: RadarRequirementSpec;
  previousRadarVersion: RadarVersionSpec;
  resultFeedback?: RadarResultFeedback;
  /** Q.7-J: one chat window = one radar; optional context id used by API to hydrate memory. */
  chatWindowId?: string;
  chat_window_id?: string;
  /** Q.7-J: bounded chat memory for LLM radar revision. */
  chatContext?: RadarRevisionChatContext;
  /** Q.7-C: explicit opt-in for LLM assisted revision. Default remains deterministic. */
  revisionMode?: "deterministic" | "llm" | "auto";
}

export interface RadarRevisionResult {
  spec: RadarRequirementSpec;
  radarVersion: RadarVersionSpec;
  radarDiff: RadarVersionDiff;
  suggestedName: string;
  confirmationPrompt: string;
  shouldSearchAfterConfirm: boolean;
  /** Q.7-C: tells tests/UI whether the strategy draft came from deterministic or LLM-assisted revision. */
  revisionSource?: "deterministic" | "llm" | "llm_fallback";
  /** Q.7-C: safe diagnostics, never includes prompts or API keys. */
  llmValidation?: {
    attempted: boolean;
    used: boolean;
    fallbackUsed: boolean;
    errors: string[];
    provider?: string;
    model?: string;
  };
  /** Q.7-J: safe diagnostics that context was used, never includes raw prompts or secrets. */
  chatContextUsed?: boolean;
  chatContext?: {
    chatWindowId?: string;
    memorySummaryUsed: boolean;
    messageCount: number;
  };
}
