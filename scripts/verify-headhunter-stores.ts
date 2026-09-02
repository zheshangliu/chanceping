import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTestWeeklyLeadSnapshot } from "../src/headhunter/model";
import { JsonEvidenceStore, JsonLeadStore, StoreError } from "../src/headhunter/stores";
import type { RawEvidence } from "../src/headhunter/model/evidence";

async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "chanceping-headhunter-stores-"));
  try {
  const leadStore = new JsonLeadStore(dataDir);
  const leadA = createTestWeeklyLeadSnapshot();
  await leadStore.upsertWeekly(leadA);
  await leadStore.upsertWeekly({ ...leadA, business_score: 90 });
  const rows = (await leadStore.listByCompany(leadA.company_id)).filter((row) => row.week_key === leadA.week_key);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.business_score, 90);

  const evidenceStore = new JsonEvidenceStore(dataDir);
  const rawEvidence: RawEvidence = {
    evidence_id: "evidence-test-1",
    source_url: "https://example.com/announcement",
    source_name: "Example",
    source_type: "official",
    title: "Announcement",
    excerpt: "Original excerpt",
    published_at: "2026-09-01T00:00:00Z",
    observed_at: "2026-09-02T00:00:00Z",
    content_hash: "hash-1",
    immutable: true,
  };
  await evidenceStore.insert(rawEvidence);
  await assert.rejects(
    () => evidenceStore.replaceRaw(rawEvidence.evidence_id, { source_title: "changed" }),
    (error: unknown) => error instanceof StoreError && /immutable/i.test(error.message),
  );

  const persisted = await new JsonLeadStore(dataDir).getByCompanyWeek(leadA.company_id, leadA.week_key);
  assert.equal(persisted?.business_score, 90);
  console.log("headhunter persistent stores verification: PASS");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

void main();
