import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CandidateRecord } from "./data-pipeline";

export const DEFAULT_CANDIDATE_PATH = path.resolve(process.cwd(), "data/business/candidates/candidates.ndjson");
function candidatePath(): string { return path.resolve(process.cwd(), process.env.CHANCEPING_BUSINESS_CANDIDATES_PATH ?? "data/business/candidates/candidates.ndjson"); }

export function loadCandidates(file = candidatePath()): CandidateRecord[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as CandidateRecord);
}

export function candidateKey(sourceId: string, discoveryUrl: string): string {
  return `cand_${crypto.createHash("sha256").update(`${sourceId}|${discoveryUrl}`).digest("hex").slice(0, 20)}`;
}

/** Writes through a temporary file so a failed collection never leaves a partial pool. */
export function saveCandidates(items: CandidateRecord[], file = candidatePath()): void {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp`;
  fs.writeFileSync(temporary, items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : ""));
  fs.renameSync(temporary, absolute);
}

export function upsertCandidates(existing: CandidateRecord[], incoming: CandidateRecord[]): CandidateRecord[] {
  const map = new Map(existing.map((item) => [item.candidateId, item]));
  for (const item of incoming) map.set(item.candidateId, { ...map.get(item.candidateId), ...item });
  return [...map.values()];
}
