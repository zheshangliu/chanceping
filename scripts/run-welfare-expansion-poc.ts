import fs from "node:fs";
import path from "node:path";

type Candidate = { code: string; name: string; url: string; kind: string };
type Result = Candidate & { status: "reachable" | "restricted" | "failed" | "manual"; httpStatus?: number; finalUrl?: string; title?: string; contentLength?: number; error?: string };

const registryPath = path.resolve("docs/welfare-expansion-candidates.json");
const outputPath = process.env.WELFARE_EXPANSION_POC_PATH ?? "data/welfare-expansion-poc.json";
const timeoutMs = Number(process.env.WELFARE_POC_TIMEOUT_MS ?? 15000);
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as { candidates: Candidate[] };

function titleFromHtml(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || undefined;
}

async function probe(candidate: Candidate): Promise<Result> {
  if (!/^https?:\/\//i.test(candidate.url)) return { ...candidate, status: "manual", error: "non-http source requires manual or licensed access" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(candidate.url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "ChancePing-WelfareRadar-Poc/0.1" } });
    const body = await response.text();
    const result: Result = { ...candidate, status: response.ok ? "reachable" : "restricted", httpStatus: response.status, finalUrl: response.url, title: titleFromHtml(body), contentLength: body.length };
    return result;
  } catch (error) {
    return { ...candidate, status: "failed", error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const results: Result[] = [];
  for (const candidate of registry.candidates) {
    const result = await probe(candidate);
    results.push(result);
    console.log(JSON.stringify({ code: result.code, status: result.status, httpStatus: result.httpStatus, title: result.title, error: result.error }));
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ probedAt: new Date().toISOString(), results }, null, 2) + "\n");
  const counts = results.reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ outputPath, counts }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
