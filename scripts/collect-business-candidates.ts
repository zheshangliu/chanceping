import { candidateKey, loadCandidates, saveCandidates, upsertCandidates } from "../src/business/candidate-store";
import { canonicalizeOfficialUrl } from "../src/business/data-quality";
import { loadSourceRegistry, type CandidateRecord, type SourceDefinition } from "../src/business/data-pipeline";

const sourceOption = process.argv.find((item) => item.startsWith("--sources="))?.slice("--sources=".length);
const requested = sourceOption?.split(",").filter(Boolean);
const priorityOption = process.argv.find((item) => item.startsWith("--priority="))?.slice("--priority=".length);
const replace = process.argv.includes("--replace");
const maxPerSource = Number(process.argv.find((item) => item.startsWith("--max-per-source="))?.slice("--max-per-source=".length) ?? 50);

function decode(value: string): string { return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function isCandidateTitle(value: string): boolean {
  return value.length >= 8 && /申报|征集|招标|采购|磋商|询价|遴选|报名|参展|大赛|比赛|项目|合作|招聘会|补贴|资金|认定|更新/.test(value) && !/中标|成交|结果公告|公示名单|拟支持|拨付|表彰|终止/.test(value);
}
function discoveredFromHtml(source: SourceDefinition, html: string): CandidateRecord[] {
  const records: CandidateRecord[] = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const now = new Date().toISOString();
  for (const match of html.matchAll(pattern)) {
    const title = decode(match[2]);
    if (!isCandidateTitle(title)) continue;
    let discoveryUrl: string;
    try {
      discoveryUrl = canonicalizeOfficialUrl(new URL(match[1], source.entryUrl).toString());
      const hostname = new URL(discoveryUrl).hostname;
      if (hostname !== source.officialDomain && !hostname.endsWith(`.${source.officialDomain}`)) continue;
    } catch { continue; }
    if (records.some((item) => item.discoveryUrl === discoveryUrl)) continue;
    records.push({ candidateId: candidateKey(source.sourceId, discoveryUrl), sourceId: source.sourceId, discoveryUrl, canonicalUrl: discoveryUrl, rawTitle: title, state: "DISCOVERED", duplicateStatus: "NONE", createdAt: now, updatedAt: now });
    if (records.length >= maxPerSource) break;
  }
  return records;
}

async function collect(source: SourceDefinition): Promise<{ sourceId: string; candidates: CandidateRecord[]; error?: string }> {
  try {
    const response = await fetch(source.entryUrl, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "ChancePing-BusinessRadar/1.0 candidate-discovery" } });
    if (!response.ok) return { sourceId: source.sourceId, candidates: [], error: `HTTP ${response.status}` };
    return { sourceId: source.sourceId, candidates: discoveredFromHtml(source, await response.text()) };
  } catch (error) { return { sourceId: source.sourceId, candidates: [], error: error instanceof Error ? error.message : String(error) }; }
}

async function main(): Promise<void> {
  const registry = loadSourceRegistry();
  const selected = registry.sources.filter((source) => source.role === "official_fact" && (!requested || requested.includes(source.sourceId)) && (!priorityOption || source.priority === priorityOption));
  if (!selected.length) throw new Error("No official fact sources selected");
  const results = await Promise.all(selected.map(collect));
  const incoming = results.flatMap((result) => result.candidates);
  const all = upsertCandidates(replace ? [] : loadCandidates(), incoming);
  saveCandidates(all);
  console.log(JSON.stringify({ selected: selected.length, discovered: incoming.length, totalCandidates: all.length, failures: results.filter((result) => result.error).map(({ sourceId, error }) => ({ sourceId, error })) }, null, 2));
}
main();
