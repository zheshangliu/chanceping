import assert from "node:assert/strict";
import { evaluateTriggerQuality } from "../src/headhunter/pipeline/trigger-quality";

const now = new Date("2026-09-03T00:00:00Z");
const target = { target_company_name: "Yokogawa", target_company_aliases: ["Yokogawa Electric"], target_region: "Hong Kong", target_website: "https://www.yokogawa.com" };
const check = (name: string, expected: string, input: Parameters<typeof evaluateTriggerQuality>[0], options = target): void => {
  const result = evaluateTriggerQuality(input, { ...options, now });
  assert.equal(result.status, expected, `${name}: ${result.status}`);
  console.log(`PASS ${name}: ${result.status}`);
};

check("dated HR requisition", "valid_recent_trigger", { title: "Yokogawa HR Director requisition posted", snippet: "New Hong Kong role posted 2026-09-01", url: "https://www.yokogawa.com/hk/careers/hr-director", source_type: "official" });
check("Yokogawa evergreen careers", "evergreen_reference", { title: "Careers at Yokogawa", snippet: "Explore current opportunities", url: "https://www.yokogawa.com/careers", source_type: "official" });
check("Corporate History", "generic_page", { title: "Corporate History | Yokogawa", snippet: "Our history", url: "https://www.yokogawa.com/about/history", source_type: "official" });
check("Treasury product page", "generic_page", { title: "Treasury Services", snippet: "Treasury solutions for clients", url: "https://www.examplebank.com/treasury", source_type: "official" });
check("Reuters 2009", "stale", { title: "Yokogawa expansion announced", snippet: "Reuters 2009-04-01", url: "https://reuters.example/yokogawa", published_at: "2009-04-01", source_type: "reliable_media" });
check("other-company expansion", "entity_mismatch", { title: "OtherCo expansion in Hong Kong", snippet: "OtherCo announced a new facility 2026-09-01", url: "https://news.example/otherco", published_at: "2026-09-01", source_type: "reliable_media", entity_name: "OtherCo" });

console.log("headhunter V1.2.1 trigger quality verification: PASS");
