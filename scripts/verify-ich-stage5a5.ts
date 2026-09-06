import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseCompetitionsArchiListing } from "../src/ich/aggregation/adapters/competitions-archi";
import { isAggregatorHost, scoreOfficialCandidate } from "../src/ich/aggregation/official-backtrace";

const root = process.cwd();
const read = (file: string) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8")) as any;
const report = read("docs/ich/stage5a5-report.json");
const required = [
  "docs/ich/stage5a5-fetch-reliability-report.md",
  "docs/ich/stage5a5-official-backtrace-report.md",
  "docs/ich/stage5a5-provider-contribution.md",
  "docs/ich/stage5a5-qualified-candidates.md",
  "data/ich/aggregation-qualified-candidates.json",
];
for (const file of required) assert.ok(fs.existsSync(path.resolve(root, file)), `${file} missing`);
assert.equal(report.schema_version, "ich-stage5a5.v1");
assert.equal(report.readonly, true);
assert.equal(report.formal_store_write, false);
assert.equal(report.formal_store_unchanged, true);
assert.equal(report.backtrace.candidates_selected, 20);
assert.ok(report.backtrace.domestic_shejijingsai >= 5);
assert.ok(report.backtrace.domestic_chuangsaiyun >= 5);
assert.ok(report.backtrace.overseas >= 10);
assert.deepEqual(new Set(report.provider_contribution.map((row: any) => row.provider)), new Set(["serper", "bocha", "brave", "doubao_search"]));
assert.equal(read("data/ich/aggregation-qualified-candidates.json").formal_store_unchanged, true);
assert.ok(!JSON.stringify(report).match(/example\.(com|net|cn)|mock\.chanceping\.local/i));

const archiFixture = `<div class="competition competition-item"><a href="https://competitions.archi/competition/demo/"><h2 class="title">Demo Competition</h2><span class="data"><span class="el submission">Submission: <span>4th December 2026</span></span><span class="el type">Type: <span>Open</span></span></span><p>Traditional craft design open call</p></a></div>`;
const archi = parseCompetitionsArchiListing(archiFixture, "https://competitions.archi/registration-ending-latest/");
assert.equal(archi.length, 1);
assert.equal(archi[0].deadline_at, "2026-12-04T23:59:00.000Z");
assert.equal(isAggregatorHost("www.chuangsaiyun.com"), true);
assert.equal(isAggregatorHost("official.example.org"), false);
const scored = scoreOfficialCandidate({ url: "https://organizer.example.org/open-call", pageTitle: "Demo Competition 2026", pageText: "Demo Competition 2026 apply before 2026-12-04", itemTitle: "Demo Competition", organizer: "Organizer", deadline: "2026-12-04", sourceOwnerHost: "organizer.example.org" });
assert.equal(scored.status, "OFFICIAL_FOUND");
assert.ok(scored.score >= 80);
const storeHash = crypto.createHash("sha256").update(fs.readFileSync(path.resolve(root, "data/ich-opportunities.json"))).digest("hex");
assert.equal(storeHash, report.formal_store_before_sha256);
console.log(JSON.stringify({ gate: "pass", selected: report.backtrace.candidates_selected, qualified: report.qualified_candidates, formal_store_unchanged: report.formal_store_unchanged, provider_rows: report.provider_contribution.length }, null, 2));
