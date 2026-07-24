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
      const url = new URL(match[1], source.entryUrl);
      const hostname = url.hostname;
      if (hostname !== source.officialDomain && !hostname.endsWith(`.${source.officialDomain}`)) continue;
      url.protocol = "https:";
      discoveryUrl = canonicalizeOfficialUrl(url.toString());
    } catch { continue; }
    if (records.some((item) => item.discoveryUrl === discoveryUrl)) continue;
    records.push({ candidateId: candidateKey(source.sourceId, discoveryUrl), sourceId: source.sourceId, discoveryUrl, canonicalUrl: discoveryUrl, rawTitle: title, state: "DISCOVERED", duplicateStatus: "NONE", createdAt: now, updatedAt: now });
    if (records.length >= maxPerSource) break;
  }
  return records;
}
function ccgpSearchUrls(): string[] {
  const end = new Date();
  const start = new Date(end.getTime() - 21 * 86_400_000);
  const date = (value: Date) => `${value.getFullYear()}%3A${String(value.getMonth() + 1).padStart(2, "0")}%3A${String(value.getDate()).padStart(2, "0")}`;
  return Array.from({ length: 10 }, (_, index) => `https://search.ccgp.gov.cn/bxsearch?searchtype=1&page_index=${index + 1}&bidSort=0&buyerName=&projectId=&pinMu=&bidType=1&dbselect=bidx&kw=&start_time=${date(start)}&end_time=${date(end)}&timeType=6&displayZone=440000&zoneId=440000&pppStatus=0&agentName=`);
}
function listUrls(source: SourceDefinition): string[] { return source.sourceId === "src_ccgp_national" ? ccgpSearchUrls() : [source.entryUrl]; }

async function collect(source: SourceDefinition): Promise<{ sourceId: string; candidates: CandidateRecord[]; error?: string }> {
  try {
    const settled = await Promise.allSettled(listUrls(source).map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "ChancePing-BusinessRadar/1.0 candidate-discovery" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return discoveredFromHtml(source, await response.text());
    }));
    const results = settled.filter((result): result is PromiseFulfilledResult<CandidateRecord[]> => result.status === "fulfilled").flatMap((result) => result.value);
    if (!results.length) throw new Error(settled.filter((result) => result.status === "rejected").map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason)).join("; ") || "No list results");
    const unique = new Map(results.map((candidate) => [candidate.candidateId, candidate]));
    const failures = settled.filter((result) => result.status === "rejected").length;
    return { sourceId: source.sourceId, candidates: [...unique.values()], error: failures ? `${failures} list pages failed` : undefined };
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
