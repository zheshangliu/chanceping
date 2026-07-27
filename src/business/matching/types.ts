import fs from "node:fs";
import path from "node:path";
import type { BusinessEditionId } from "../edition-config";
import type { BusinessOpportunity } from "../opportunity";

export type GateStatus = "PASS" | "FAIL" | "UNKNOWN";
export type RelevanceStatus = "DIRECT" | "PROVINCE" | "WEAK";
export type FitLabel = "高度适合" | "可能适合" | "待确认" | "不适合";

export interface BusinessProfile {
  id: string;
  name: string;
  businessType: string;
  regions: BusinessEditionId[];
  targetAudience: string[];
  categories: string[];
  industries: string[];
  keywords: string[];
  constraints: string[];
  excludedKeywords?: string[];
}

export interface EligibilityResult { status: GateStatus; reasons: string[]; unknowns: string[]; }
export interface LocalRelevanceResult { status: RelevanceStatus; reason: string; }
export interface FitResult { score: number; label: FitLabel; reasons: string[]; preparationCost: string[]; }

export function loadDemoProfiles(filePath = path.resolve(process.cwd(), "src/business/matching/demo-profiles.json")): BusinessProfile[] {
  const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(value)) throw new Error("demo profiles must be an array");
  return value as BusinessProfile[];
}

export type MatchableOpportunity = BusinessOpportunity;
