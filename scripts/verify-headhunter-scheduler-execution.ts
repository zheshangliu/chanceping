import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeTrigger } from "../src/scheduler/triggers";
import { createHeadHunterStores } from "../src/headhunter/stores";
import type { Company } from "../src/headhunter/model/company";

async function main(): Promise<void> {
const dataDir = await mkdtemp(join(tmpdir(), "chanceping-hh-scheduler-"));
process.env.CHANCEPING_HEADHUNTER_DATA_DIR = dataDir;
const now = new Date().toISOString();
const company: Company = {
  company_id: "scheduler-company",
  canonical_name: "Scheduler Company",
  name_cn: null,
  name_en: "Scheduler Company",
  aliases: [],
  industry: "finance",
  sub_industry: null,
  country: "Hong Kong",
  region: "Hong Kong",
  city: "Hong Kong",
  company_type: "company",
  website: "https://example.com",
  linkedin_company_url: null,
  official_domains: ["example.com"],
  target_segment: "hk_finance",
  parent_company_id: null,
  entity_scope: "legal_entity",
  created_at: now,
  updated_at: now,
  last_verified_at: null,
  status: "active",
};
await writeFile(join(dataDir, "companies.json"), `${JSON.stringify([company])}\n`);

const result = await executeTrigger("report", { vertical: "headhunter", run_kind: "weekly_radar" }, {} as never);
assert.equal(result.status, "success");
assert.equal(result.published, true);
assert.equal(result.company_count, 1);
const stores = createHeadHunterStores(dataDir);
assert.equal((await stores.runs.list()).length, 1);
assert.equal((await stores.weeklySnapshots.list()).length, 1);
assert.equal((await stores.weeklySnapshots.list())[0].published, true);
await rm(dataDir, { recursive: true, force: true });
console.log("headhunter scheduler execution verification: PASS");
}

void main();
