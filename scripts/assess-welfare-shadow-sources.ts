import fs from "node:fs";
import path from "node:path";
import { WELFARE_SHADOW_SOURCES, type WelfareShadowRunSummary } from "../src/public/welfare-opportunities";

const historyPath = path.resolve(process.cwd(), "data/welfare-shadow-run-history.jsonl");
if (!fs.existsSync(historyPath)) throw new Error("WELFARE_SHADOW_HISTORY_MISSING");

const runs = fs.readFileSync(historyPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as WelfareShadowRunSummary);
const dayKey = (date: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
const results = WELFARE_SHADOW_SOURCES.map((source) => {
  const sourceRuns = runs.flatMap((run) => run.sources.filter((item) => item.sourceCode === source.code));
  const days = new Set(sourceRuns.map((item) => dayKey(item.retrievedAt)));
  const succeeded = sourceRuns.filter((item) => item.status === "succeeded").length;
  // A source pre-classified as restricted stays that way even if its first
  // network response is a failure rather than a rendered access challenge.
  // This prevents a captcha-protected POC from being mistaken for an ordinary
  // source that merely needs more observation.
  const restricted = source.shadowAccess === "restricted" || sourceRuns.some((item) => item.status === "restricted");
  // A first manual run may begin after the morning timer. Five successful
  // reads still cover the three-day observation window without reducing the
  // requirement for three distinct China-time calendar days.
  return { sourceCode: source.code, days: days.size, runs: sourceRuns.length, succeeded, decision: restricted ? "RETAIN_RESTRICTED_POC" : days.size >= 3 && succeeded >= 5 ? "ELIGIBLE_FOR_ADAPTER_REVIEW" : "CONTINUE_SHADOW" };
});
console.log(JSON.stringify({ evaluatedAt: new Date().toISOString(), results }, null, 2));
