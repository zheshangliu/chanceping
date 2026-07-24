import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { candidateKey, loadCandidates, saveCandidates, upsertCandidates } from "../src/business/candidate-store";
import type { CandidateRecord } from "../src/business/data-pipeline";

let failures = 0;
function check(name: string, condition: boolean): void { console.log(`${condition ? "PASS" : "FAIL"} ${name}`); if (!condition) failures += 1; }
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-business-candidates-")), "candidates.ndjson");
const first: CandidateRecord = { candidateId: candidateKey("src_gz_science", "https://kjj.gz.gov.cn/a"), sourceId: "src_gz_science", discoveryUrl: "https://kjj.gz.gov.cn/a", rawTitle: "科技项目申报", state: "DISCOVERED", createdAt: "2026-07-24T00:00:00.000Z", updatedAt: "2026-07-24T00:00:00.000Z" };
saveCandidates([first], file);
check("candidate store persists NDJSON", loadCandidates(file).length === 1);
check("candidate key is deterministic", first.candidateId === candidateKey("src_gz_science", "https://kjj.gz.gov.cn/a"));
const merged = upsertCandidates([first], [{ ...first, state: "FETCHED", updatedAt: "2026-07-24T01:00:00.000Z" }]);
check("candidate upsert is idempotent", merged.length === 1 && merged[0].state === "FETCHED");
if (failures > 0) process.exitCode = 1;
