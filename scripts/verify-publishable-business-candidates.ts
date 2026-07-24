import fs from "node:fs";
import path from "node:path";
import { toPublishableGuangdongProcurement } from "../src/business/publishable-candidate";
import { loadCandidates } from "../src/business/candidate-store";

let failures = 0;
function check(name: string, condition: boolean): void { console.log(`${condition ? "PASS" : "FAIL"} ${name}`); if (!condition) failures += 1; }
const now = new Date("2026-07-24T12:00:00+08:00");
const records = loadCandidates().map((candidate) => toPublishableGuangdongProcurement(candidate, now)).filter((item): item is NonNullable<typeof item> => Boolean(item));
check("at least 100 Guangdong procurement candidates satisfy publication gates", records.length >= 100);
check("all candidates use direct official HTTPS URLs", records.every((record) => record.officialUrl.startsWith("https://www.ccgp.gov.cn/")));
check("all candidates have organizer, fixed future deadline and evidence", records.every((record) => Boolean(record.organizer) && Date.parse(record.deadline) >= now.getTime() && record.evidence.fieldEvidence.deadline.length > 0));
check("all candidates are mapped to three Business editions", records.every((record) => record.editions.length === 3));
check("no duplicate official URLs", new Set(records.map((record) => record.officialUrl)).size === records.length);
const output = path.resolve("data/business/review/publishable-candidates.json");
check("publishable candidate output exists", fs.existsSync(output));
if (failures > 0) process.exitCode = 1;
