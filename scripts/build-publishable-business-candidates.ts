import fs from "node:fs";
import path from "node:path";
import { loadCandidates } from "../src/business/candidate-store";
import { toPublishableGuangdongProcurement } from "../src/business/publishable-candidate";

const output = path.resolve(process.argv[2] ?? "data/business/review/publishable-candidates.json");
const now = new Date("2026-07-24T12:00:00+08:00");
const records = loadCandidates().map((candidate) => toPublishableGuangdongProcurement(candidate, now)).filter((item): item is NonNullable<typeof item> => Boolean(item));
const unique = new Map(records.map((record) => [record.officialUrl, record]));
const selected = [...unique.values()].sort((a, b) => a.deadline.localeCompare(b.deadline));
fs.mkdirSync(path.dirname(output), { recursive: true });
const temporary = `${output}.tmp`;
fs.writeFileSync(temporary, `${JSON.stringify({ generatedAt: now.toISOString(), scope: "guangdong-procurement", records: selected }, null, 2)}\n`);
fs.renameSync(temporary, output);
console.log(JSON.stringify({ output, eligible: selected.length, earliestDeadline: selected[0]?.deadline, latestDeadline: selected.at(-1)?.deadline }, null, 2));
if (selected.length < 100) process.exitCode = 1;
