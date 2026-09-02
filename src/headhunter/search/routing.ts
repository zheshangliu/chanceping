import type { HeadhunterSearchIntent } from "./intents";

export interface RoutingDecision {
  providers: string[];
  exa_reason: string | null;
}

export function resolveProviders(intent: HeadhunterSearchIntent): RoutingDecision {
  if (intent.intent_type === "DISCOVER_PERSON" || intent.scope === "people") {
    const exaAllowed = intent.serper_found_relevant_people === false
      || (intent.relationship_confidence ?? 1) < 0.6
      || (intent.lead_value === "high" && intent.has_public_contact === false)
      || intent.manual_contact_request === true;
    return exaAllowed ? { providers: ["serper", "exa"], exa_reason: exaReason(intent) } : { providers: ["serper"], exa_reason: null };
  }
  if (intent.scope === "mainland") return { providers: ["doubao", "serper"], exa_reason: null };
  return { providers: ["serper", "doubao"], exa_reason: null };
}

function exaReason(intent: HeadhunterSearchIntent): string {
  if (intent.manual_contact_request) return "manual contact enrichment request";
  if (intent.serper_found_relevant_people === false) return "Serper found no relevant person";
  if ((intent.relationship_confidence ?? 1) < 0.6) return "low person/company relationship confidence";
  return "high-value lead missing public contact";
}
