import assert from "node:assert/strict";
import fs from "node:fs";
import { findIchSemanticIssues, sanitizeIchTemplateContamination } from "../src/ich/semantic-validation";
import type { IchOpportunity } from "../src/ich/types";

const store = JSON.parse(fs.readFileSync("data/ich-opportunities.json", "utf8")) as { entries: IchOpportunity[] };
const repairedFindings = store.entries.flatMap((entry) => findIchSemanticIssues(entry, store.entries));
assert.equal(repairedFindings.length, 0, "DS0 repaired store must not retain semantic contamination findings");

const canonical = JSON.parse(fs.readFileSync("src/ich/opportunities.verified.json", "utf8")) as { entries: IchOpportunity[] };
const contaminated = structuredClone(canonical.entries[0]!);
contaminated.slug = "semantic-contamination-fixture";
contaminated.title = "Unrelated opportunity fixture";
contaminated.sources[0] = { ...contaminated.sources[0]!, url: "https://example.org/unrelated", name: "Unrelated organizer" };
contaminated.application.application_url = "https://example.org/unrelated";
assert.ok(findIchSemanticIssues(contaminated, [contaminated]).length > 0, "known template fields must be rejected for unrelated sources");

const sanitized = sanitizeIchTemplateContamination(contaminated, "2026-08-24T12:00:00+08:00");
assert.equal(sanitized.description, null);
assert.equal(sanitized.application.application_email, null);
assert.equal(sanitized.seo, null);
assert.equal(sanitized.verification.verification_status, "partially_verified");
assert.equal(findIchSemanticIssues(sanitized, [sanitized]).length, 0, "sanitized clue must be semantically clean");
console.log("ICH DS0 semantic integrity checks passed");
