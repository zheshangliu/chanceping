import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync("web/business.js", "utf8");
assert.ok(!js.includes("85, 78, 62"), "fixed fit percentages must not remain");
assert.ok(js.includes("item.fitScore == null"), "ordinary cards must not pretend a personalized score");
assert.ok(js.includes("/api/business/matches"), "profile matching endpoint must be consumed");
assert.ok(js.includes("business-profile-form"), "demo profile entry must exist");
assert.ok(js.includes("opportunityId") || js.includes("source: \"business-radar\""), "AI context CTA must be present");
console.log("Business P0 page verifier passed: no fixed fit score, profile match entry and AI context contract present");
