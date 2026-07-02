import type { OpportunityKind, SearchIntentType, SearchQueryVariant } from "./radar-mvp-contracts";

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
