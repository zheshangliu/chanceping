import { loadCandidates, saveCandidates } from "../src/business/candidate-store";
import { contentFingerprint } from "../src/business/data-quality";

const limit = Number(process.argv.find((item) => item.startsWith("--limit="))?.slice("--limit=".length) ?? 30);
const sourceOption = process.argv.find((item) => item.startsWith("--sources="))?.slice("--sources=".length);
const selectedSources = sourceOption?.split(",").filter(Boolean);
const refresh = process.argv.includes("--refresh");
const candidates = loadCandidates();
const targets = candidates.filter((item) => (refresh ? ["DISCOVERED", "FETCHED", "EXTRACTED"].includes(item.state) : item.state === "DISCOVERED") && (!selectedSources || selectedSources.includes(item.sourceId))).slice(0, limit);

function publishedAtFrom(content: string): string | undefined {
  const match = content.match(/(?:发布时间|发布(?:日期|时间)?|时间)?\s*[：:]?\s*(20\d{2})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T00:00:00+08:00`;
}
function textFromHtml(content: string): string { return content.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
function deadlineFrom(text: string): string | undefined {
  // Official notices use several equivalent forms: 截至、截止至、请在…前、
  // 于…前提交.  Keep this intentionally date-only: a missing time is the end
  // of the announced local calendar day, never an invented clock time.
  const matches = [...text.matchAll(/(?:报名(?:截止|截至)|参展报名截止|申报截止|申请截止|截止(?:时间|日期|至)?|截至)[^。；，,]{0,60}?(?:(20\d{2})\s*年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日[^。；，,]{0,12}?(?:前|止|截止|之前|前提交|前报送)?/g)];
  const match = matches.at(-1);
  return match ? `${match[1] ?? "2026"}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T23:59:59+08:00` : undefined;
}
function signalsFrom(text: string): string[] { return ["申报", "报名", "投标", "响应", "采购", "招标", "征集", "遴选", "参展", "提交材料", "申请"].filter((signal) => text.includes(signal)); }
function categoryFrom(signals: string[], text: string, title: string): string | undefined {
  if (/参展|展览|展会|展位|企业展/.test(title)) return "exhibition";
  if (signals.some((signal) => ["投标", "响应", "采购", "招标"].includes(signal))) return "procurement";
  if (signals.includes("参展")) return "exhibition";
  if (/外贸|出口|国际市场|跨境|境外展贸|信用保险/.test(text)) return "international";
  if (signals.includes("报名")) return "competition";
  if (signals.some((signal) => ["申报", "征集", "遴选", "申请"].includes(signal))) return "policy";
  return undefined;
}

async function fetchOne(index: number): Promise<{ index: number; contentHash?: string; publishedAt?: string; deadline?: string; excerpt?: string; signals?: string[]; category?: string; error?: string }> {
  const candidate = targets[index];
  try {
    const response = await fetch(candidate.discoveryUrl, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "ChancePing-BusinessRadar/1.0 detail-verification" } });
    if (!response.ok) return { index, error: `HTTP ${response.status}` };
    const content = await response.text();
    const text = textFromHtml(content);
    const signals = signalsFrom(text);
    // Later sections and attachments commonly contain the only deadline and
    // eligibility wording, so preserve enough text for a human-auditable gate.
    return { index, contentHash: contentFingerprint(content), publishedAt: publishedAtFrom(text), deadline: deadlineFrom(text), excerpt: text.slice(0, 8_000), signals, category: categoryFrom(signals, text, candidate.rawTitle) };
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
    return outcome.error ? { ...candidate, state: "FETCH_FAILED" as const, updatedAt: now } : { ...candidate, state: "EXTRACTED" as const, contentHash: outcome.contentHash, rawPublishedAt: outcome.publishedAt ?? candidate.rawPublishedAt, rawDeadlineText: outcome.deadline, rawBodyExcerpt: outcome.excerpt, actionSignals: outcome.signals, categoryHint: outcome.category, updatedAt: now };
  });
  saveCandidates(next);
  console.log(JSON.stringify({ requested: targets.length, fetched: outcomes.filter((outcome) => !outcome.error).length, failed: outcomes.filter((outcome) => outcome.error).length, failures: outcomes.filter((outcome) => outcome.error).map((outcome) => ({ candidateId: targets[outcome.index].candidateId, error: outcome.error })) }, null, 2));
}
main();
