import { loadCandidates, saveCandidates } from "../src/business/candidate-store";
import { contentFingerprint } from "../src/business/data-quality";

const limit = Number(process.argv.find((item) => item.startsWith("--limit="))?.slice("--limit=".length) ?? 30);
const sourceOption = process.argv.find((item) => item.startsWith("--sources="))?.slice("--sources=".length);
const selectedSources = sourceOption?.split(",").filter(Boolean);
const candidates = loadCandidates();
const targets = candidates.filter((item) => item.state === "DISCOVERED" && (!selectedSources || selectedSources.includes(item.sourceId))).slice(0, limit);

function publishedAtFrom(content: string): string | undefined {
  const match = content.match(/(?:发布时间|发布(?:日期|时间)?|时间)\s*[：:]?\s*(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T00:00:00+08:00`;
}

async function fetchOne(index: number): Promise<{ index: number; contentHash?: string; publishedAt?: string; error?: string }> {
  const candidate = targets[index];
  try {
    const response = await fetch(candidate.discoveryUrl, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "ChancePing-BusinessRadar/1.0 detail-verification" } });
    if (!response.ok) return { index, error: `HTTP ${response.status}` };
    const content = await response.text();
    return { index, contentHash: contentFingerprint(content), publishedAt: publishedAtFrom(content) };
  } catch (error) { return { index, error: error instanceof Error ? error.message : String(error) }; }
}

async function main(): Promise<void> {
  const outcomes: Array<Awaited<ReturnType<typeof fetchOne>>> = [];
  for (let offset = 0; offset < targets.length; offset += 4) outcomes.push(...await Promise.all(targets.slice(offset, offset + 4).map((_, index) => fetchOne(offset + index))));
  const updated = new Map(outcomes.map((outcome) => [targets[outcome.index].candidateId, outcome]));
  const now = new Date().toISOString();
  const next = candidates.map((candidate) => {
    const outcome = updated.get(candidate.candidateId);
    if (!outcome) return candidate;
    return outcome.error ? { ...candidate, state: "FETCH_FAILED" as const, updatedAt: now } : { ...candidate, state: "FETCHED" as const, contentHash: outcome.contentHash, rawPublishedAt: outcome.publishedAt ?? candidate.rawPublishedAt, updatedAt: now };
  });
  saveCandidates(next);
  console.log(JSON.stringify({ requested: targets.length, fetched: outcomes.filter((outcome) => !outcome.error).length, failed: outcomes.filter((outcome) => outcome.error).length, failures: outcomes.filter((outcome) => outcome.error).map((outcome) => ({ candidateId: targets[outcome.index].candidateId, error: outcome.error })) }, null, 2));
}
main();
