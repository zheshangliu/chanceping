import { hasEncodingCorruption } from "../ich/aggregation/adapters/common";
import type { OpportunityV2 } from "./types";

export function isOpportunityV2PublicTitleSafe(item: Pick<OpportunityV2, "title"> & Partial<Pick<OpportunityV2, "encoding_error_fields">>): boolean {
  return !item.encoding_error_fields?.includes("title") && !hasEncodingCorruption(item.title);
}

export function isOpportunityV2PublicSummarySafe(item: Pick<OpportunityV2, "summary"> & Partial<Pick<OpportunityV2, "encoding_error_fields">>): boolean {
  return !item.encoding_error_fields?.includes("summary") && !hasEncodingCorruption(item.summary);
}
