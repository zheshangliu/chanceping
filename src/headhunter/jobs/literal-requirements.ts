import type { RequirementClarity } from "../model/lead";

const RA1_REQUIRED = /(?:sfc\s*type\s*1|type\s*1\s*licen[cs]e|ra\s*1|regulated\s*activity\s*1).*(?:required|must|need|essential)|(?:required|must|need|essential).*(?:sfc\s*type\s*1|type\s*1\s*licen[cs]e|ra\s*1|regulated\s*activity\s*1)/i;
const RA1_PREFERRED = /(?:sfc\s*type\s*1|type\s*1\s*licen[cs]e|ra\s*1|regulated\s*activity\s*1).*(?:preferred|ideally|advantage)|(?:preferred|ideally|advantage).*(?:sfc\s*type\s*1|type\s*1\s*licen[cs]e|ra\s*1|regulated\s*activity\s*1)/i;
const CANTONESE_REQUIRED = /(?:cantonese|廣東話|粤语|粵語).*(?:required|must|need|essential|fluent)|(?:required|must|need|essential|fluent).*(?:cantonese|廣東話|粤语|粵語)/i;
const CANTONESE_PREFERRED = /(?:cantonese|廣東話|粤语|粵語).*(?:preferred|ideally|advantage)|(?:preferred|ideally|advantage).*(?:cantonese|廣東話|粤语|粵語)/i;

export function classifyRa1Clarity(text: string): RequirementClarity {
  if (RA1_REQUIRED.test(text)) return "explicit_required";
  if (RA1_PREFERRED.test(text)) return "explicit_preferred";
  return "not_mentioned";
}

export function classifyCantoneseClarity(text: string): RequirementClarity {
  if (CANTONESE_REQUIRED.test(text)) return "explicit_required";
  if (CANTONESE_PREFERRED.test(text)) return "explicit_preferred";
  return "not_mentioned";
}
