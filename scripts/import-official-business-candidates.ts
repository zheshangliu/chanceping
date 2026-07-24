import { candidateKey, loadCandidates, saveCandidates, upsertCandidates } from "../src/business/candidate-store";
import { canonicalizeOfficialUrl } from "../src/business/data-quality";
import { loadSourceRegistry, type CandidateRecord } from "../src/business/data-pipeline";
import fs from "node:fs";

type Input = { sourceId: string; title: string; url: string };
const inputFile = process.argv[2];
if (!inputFile) throw new Error("Usage: tsx scripts/import-official-business-candidates.ts <json-file>");
const registry = loadSourceRegistry();
const inputs = JSON.parse(fs.readFileSync(inputFile, "utf8")) as Input[];
const now = new Date().toISOString();
const imported: CandidateRecord[] = inputs.map((item) => {
  const source = registry.sources.find((entry) => entry.sourceId === item.sourceId);
  if (!source || source.role !== "official_fact" || source.finalAllowed !== "是") throw new Error(`Source ${item.sourceId} is not an eligible official fact source`);
  const url = new URL(item.url);
  url.protocol = "https:";
  if (url.hostname !== source.officialDomain && !url.hostname.endsWith(`.${source.officialDomain}`)) throw new Error(`URL domain is not registered for ${item.sourceId}`);
  const canonicalUrl = canonicalizeOfficialUrl(url.toString());
  return { candidateId: candidateKey(item.sourceId, canonicalUrl), sourceId: item.sourceId, discoveryUrl: canonicalUrl, canonicalUrl, rawTitle: item.title.trim(), state: "DISCOVERED", duplicateStatus: "NONE", createdAt: now, updatedAt: now };
});
const next = upsertCandidates(loadCandidates(), imported);
saveCandidates(next);
console.log(JSON.stringify({ imported: imported.length, totalCandidates: next.length }, null, 2));
