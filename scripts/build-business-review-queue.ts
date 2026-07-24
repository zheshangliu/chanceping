import fs from "node:fs";
import path from "node:path";
import { loadCandidates } from "../src/business/candidate-store";
import { loadSourceRegistry } from "../src/business/data-pipeline";

const output = path.resolve(process.argv[2] ?? "data/business/review/review-queue.csv");
const escape = (value: string | undefined) => `"${(value ?? "").replace(/"/g, '""')}"`;
const headers = ["candidateId", "sourceId", "title", "officialUrl", "discoveryUrl", "organizer", "regions", "editions", "category", "publishedAt", "deadline", "deadlineType", "status", "verificationStatus", "duplicateStatus", "actionabilityScore", "evidenceRef", "reviewer", "decision", "reviewNotes", "reviewedAt"];
const sources = new Map(loadSourceRegistry().sources.map((source) => [source.sourceId, source]));
const lines = [headers.join(",")];
for (const candidate of loadCandidates().filter((item) => ["EXTRACTED", "PENDING_VERIFICATION", "MANUAL_DEDUPE", "NEEDS_MANUAL_PARSE"].includes(item.state))) {
  const source = sources.get(candidate.sourceId);
  lines.push([candidate.candidateId, candidate.sourceId, candidate.rawTitle, candidate.canonicalUrl, candidate.discoveryUrl, source?.authority, source?.regions, "", candidate.categoryHint ?? source?.categories, candidate.rawPublishedAt, candidate.rawDeadlineText, candidate.rawDeadlineText ? "fixed" : "unknown", candidate.state, "pending_verification", candidate.duplicateStatus, "", candidate.evidenceRef, "", "", "", ""].map(escape).join(","));
}
fs.mkdirSync(path.dirname(output), { recursive: true });
const temporary = `${output}.tmp`;
fs.writeFileSync(temporary, `${lines.join("\n")}\n`);
fs.renameSync(temporary, output);
console.log(`Wrote ${lines.length - 1} review candidates to ${output}`);
