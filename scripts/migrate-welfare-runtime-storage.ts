import fs from "node:fs";
import path from "node:path";
import { loadRecordedWelfareOpportunities, savePersistedWelfareOpportunities } from "../src/public/welfare-opportunities";

const runtimeDir = path.resolve(process.env.CHANCEPING_WELFARE_RUNTIME_DIR ?? "/var/lib/chanceping/welfare");
const opportunitiesPath = path.join(runtimeDir, "opportunities.json");
const candidatesPath = path.join(runtimeDir, "candidates.json");
const summaryPath = path.join(runtimeDir, "run-summary.json");
const evidenceDir = path.join(runtimeDir, "evidence");

function hasValidRecords(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { records?: unknown[] } | unknown[];
    const records = Array.isArray(parsed) ? parsed : parsed.records;
    return Array.isArray(records) && records.length > 0;
  } catch { return false; }
}

fs.mkdirSync(evidenceDir, { recursive: true, mode: 0o755 });
if (!hasValidRecords(opportunitiesPath)) {
  savePersistedWelfareOpportunities(loadRecordedWelfareOpportunities(), opportunitiesPath);
  console.log(JSON.stringify({ action: "initialized", records: loadRecordedWelfareOpportunities().length }));
} else {
  console.log(JSON.stringify({ action: "preserved" }));
}
if (!fs.existsSync(candidatesPath)) fs.writeFileSync(candidatesPath, JSON.stringify({ version: "1.0", updatedAt: new Date().toISOString(), records: [] }, null, 2));
if (!fs.existsSync(summaryPath)) fs.writeFileSync(summaryPath, JSON.stringify({ status: "seeded", retrievedAt: new Date().toISOString() }, null, 2));
