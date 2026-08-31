import fs from "node:fs";
import path from "node:path";
import { loadCandidates } from "../src/business/candidate-store";
import { toPublishableGuangdongProcurement, toPublishableOfficialOpportunity, type PublishableCandidate, type PublishableOfficialCandidate } from "../src/business/publishable-candidate";

const output = path.resolve(process.argv[2] ?? "data/business/review/publishable-candidates.json");
const now = new Date(process.env.CHANCEPING_NOW ?? new Date().toISOString());
type PublishableRecord = PublishableCandidate | PublishableOfficialCandidate;
const records: PublishableRecord[] = loadCandidates().flatMap<PublishableRecord>((candidate) => {
  const procurement = toPublishableGuangdongProcurement(candidate, now);
  if (procurement) return [procurement];
  const diversified = toPublishableOfficialOpportunity(candidate, now);
  return diversified ? [diversified] : [];
});
const unique = new Map(records.map((record) => [record.officialUrl, record]));
const selected = [...unique.values()].sort((a, b) => a.deadline.localeCompare(b.deadline));
fs.mkdirSync(path.dirname(output), { recursive: true });
const temporary = `${output}.tmp`;
fs.writeFileSync(temporary, `${JSON.stringify({ generatedAt: now.toISOString(), scope: "guangdong-official-opportunities", records: selected }, null, 2)}\n`);
fs.renameSync(temporary, output);
console.log(JSON.stringify({ output, eligible: selected.length, categories: Object.fromEntries([...new Set(selected.map((item) => item.category))].map((category) => [category, selected.filter((item) => item.category === category).length])), earliestDeadline: selected[0]?.deadline, latestDeadline: selected.at(-1)?.deadline }, null, 2));
if (selected.length < 100) process.exitCode = 1;
