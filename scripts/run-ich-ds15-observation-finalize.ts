import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type Check = { name: string; ok: boolean; detail: string };
const baseUrl = (process.argv.find((arg) => arg.startsWith("--base-url="))?.split("=").slice(1).join("=") ?? "https://ich.chanceping.com").replace(/\/$/u, "");
const timerEvidencePath = process.argv.find((arg) => arg.startsWith("--timer-evidence="))?.split("=").slice(1).join("=") ?? null;
const ds6EvidencePath = process.argv.find((arg) => arg.startsWith("--ds6-evidence="))?.split("=").slice(1).join("=") ?? null;
const ds15Path = path.resolve("docs/ich/DS15-三日观察启动记录_V1.0.json");
const storePath = path.resolve("data/ich-opportunities.json");
const outputPath = path.resolve("docs/ich/DS15-三日观察收口审计_V1.0.json");
const start = JSON.parse(fs.readFileSync(ds15Path, "utf8")) as { observation_window_start: string; planned_observation_end: string; baseline: { formal_store_sha256: string } };
type Ds6Run = { run_id: string; ran_at: string; gate: string; readonly: boolean; formal_store_write: boolean; formal_store_unchanged: boolean; steps: Array<{ exit_code: number }> };
const checks: Check[] = [];
const now = new Date();
const observedEnd = new Date(start.planned_observation_end);
const rawStore = fs.readFileSync(storePath);
const storeHash = crypto.createHash("sha256").update(rawStore).digest("hex");

async function get(pathname: string): Promise<{ status: number; text: string; json: any | null }> {
  try {
    const response = await fetch(`${baseUrl}${pathname}`, { redirect: "follow", headers: { "user-agent": "ChancePing-DS15-observation-finalizer/1.0" } });
    const text = await response.text();
    let json: any | null = null;
    try { json = JSON.parse(text); } catch { /* HTML */ }
    return { status: response.status, text, json };
  } catch (error) {
    return { status: 0, text: error instanceof Error ? error.message : String(error), json: null };
  }
}

async function main(): Promise<void> {
  checks.push({ name: "observation_end_reached", ok: now >= observedEnd, detail: `now=${now.toISOString()} end=${observedEnd.toISOString()}` });
  checks.push({ name: "formal_store_hash_unchanged_since_DS15_baseline", ok: storeHash === start.baseline.formal_store_sha256, detail: `current=${storeHash} baseline=${start.baseline.formal_store_sha256}` });
  let evidenceRuns: Ds6Run[] = [];
  if (ds6EvidencePath && fs.existsSync(path.resolve(ds6EvidencePath))) {
    const evidence = JSON.parse(fs.readFileSync(path.resolve(ds6EvidencePath), "utf8")) as { runs?: Ds6Run[] } | Ds6Run[];
    evidenceRuns = Array.isArray(evidence) ? evidence : evidence.runs ?? [];
  }
  // The checked-in ledger contains historical dry-run records, including future-dated
  // rehearsals. Only an explicitly supplied remote evidence file may satisfy the
  // post-window scheduler check; never promote a local rehearsal to real evidence.
  const uniqueRuns = [...new Map(evidenceRuns.map((run) => [run.run_id, run])).values()];
  const actualRuns = uniqueRuns.filter((run) => new Date(run.ran_at) <= now && new Date(run.ran_at) >= observedEnd && run.gate === "pass" && run.readonly === true && run.formal_store_write === false && run.formal_store_unchanged === true && Array.isArray(run.steps) && run.steps.every((step) => step.exit_code === 0));
  checks.push({ name: "real_DS6_run_after_observation_end", ok: actualRuns.length >= 1, detail: actualRuns.map((run) => run.run_id).join(",") || "none" });
  let timerEvidence = "";
  if (timerEvidencePath && fs.existsSync(path.resolve(timerEvidencePath))) timerEvidence = fs.readFileSync(path.resolve(timerEvidencePath), "utf8");
  checks.push({ name: "remote_timer_evidence_after_observation_end", ok: /chanceping-ich-ds6\.timer[\s\S]*(?:Success|success)[\s\S]*(?:Finished ChancePing ICH DS6|Deactivated successfully)/u.test(timerEvidence) && /2026-08-27|2026-08-28|2026-08-29|2026-08-30/u.test(timerEvidence), detail: timerEvidence ? `evidence_sha256=${crypto.createHash("sha256").update(timerEvidence).digest("hex")}` : "missing --timer-evidence" });

  const home = await get("/ich");
  checks.push({ name: "public_home", ok: home.status === 200 && /<title>非遗机会雷达/u.test(home.text), detail: `status=${home.status}` });
  const guangzhou = await get("/api/public/ich/opportunities?region=guangzhou&status=current&page=1&page_size=60");
  checks.push({ name: "guangzhou_filter", ok: guangzhou.status === 200 && Array.isArray(guangzhou.json?.items) && guangzhou.json.items.every((item: any) => item.location?.region_groups?.includes("guangzhou")), detail: `status=${guangzhou.status} total=${guangzhou.json?.total ?? "unknown"}` });
  const international = await get("/api/public/ich/opportunities?category=international&status=current&page=1&page_size=60");
  checks.push({ name: "international_category_filter", ok: international.status === 200 && Array.isArray(international.json?.items) && international.json.items.every((item: any) => item.primary_category === "international"), detail: `status=${international.status} total=${international.json?.total ?? "unknown"}` });
  const closing = await get("/api/public/ich/opportunities?status=closing_soon&page=1&page_size=60");
  checks.push({ name: "closing_soon_status_filter", ok: closing.status === 200 && Array.isArray(closing.json?.items) && closing.json.items.every((item: any) => item.status === "closing_soon"), detail: `status=${closing.status} total=${closing.json?.total ?? "unknown"}` });
  const pageOne = await get("/api/public/ich/opportunities?status=current&page=1&page_size=8");
  const pageTwo = await get("/api/public/ich/opportunities?status=current&page=2&page_size=8");
  checks.push({ name: "pagination", ok: pageOne.status === 200 && pageTwo.status === 200 && pageOne.json?.items?.[0]?.slug !== pageTwo.json?.items?.[0]?.slug, detail: `page1=${pageOne.json?.items?.[0]?.slug ?? "none"} page2=${pageTwo.json?.items?.[0]?.slug ?? "none"}` });
  const detailSlug = pageOne.json?.items?.[0]?.slug;
  const detail = detailSlug ? await get(`/ich/opportunities/${encodeURIComponent(detailSlug)}`) : { status: 0, text: "no slug", json: null };
  checks.push({ name: "SSR_detail", ok: detail.status === 200 && detail.text.includes(String(pageOne.json?.items?.[0]?.title ?? "")) && detail.text.includes("官方来源"), detail: `status=${detail.status} slug=${detailSlug ?? "none"}` });
  const admin = await get("/ich/admin");
  checks.push({ name: "admin_quality_metrics", ok: admin.status === 200 && admin.text.includes("字段未确认率") && admin.text.includes("deadline_unconfirmed_rate") && admin.text.includes("来源健康与采集质量"), detail: `status=${admin.status}` });
  const internal = await get("/api/internal/ich/operations");
  checks.push({ name: "internal_api_protected", ok: internal.status === 401, detail: `status=${internal.status}` });

  const complete = checks.every((check) => check.ok);
  const audit = { schema_version: "ich-ds15-observation-finalize.v1", stage: "DS15", finalized_at: now.toISOString(), base_url: baseUrl, observation_window_start: start.observation_window_start, planned_observation_end: start.planned_observation_end, actual_DS6_runs: actualRuns.map((run) => run.run_id), timer_evidence_path: timerEvidencePath, formal_store_path: "data/ich-opportunities.json", formal_store_sha256: storeHash, formal_store_write: false, checks, gate: complete ? "complete" : now < observedEnd ? "observation_in_progress" : "blocked", half_automatic_update_decision: complete ? "allow_readonly_candidate_refresh_keep_manual_formal_import" : "pending_until_all_checks_pass" };
  fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify({ stage: audit.stage, gate: audit.gate, passed: checks.filter((check) => check.ok).length, total: checks.length, half_automatic_update_decision: audit.half_automatic_update_decision }, null, 2));
  if (audit.gate === "blocked") process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
