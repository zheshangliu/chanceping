import assert from "assert";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { IchOpportunityStore } from "../src/ich/store";
import { ICH_PRIMARY_CATEGORIES } from "../src/ich/types";

const fixture = path.resolve("src/ich/opportunities.verified.json");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-ich-stage5-"));
const output = path.join(tempDir, "opportunities.json");
const verifiedFile = JSON.parse(fs.readFileSync(fixture, "utf8")) as {
  schema_version: string;
  updated_at: string;
  entries: Array<{ id: string; slug: string }>;
};
assert.ok(verifiedFile.entries.length >= 35, "formal seed must retain the stage 5 launch dataset");
const before = `${JSON.stringify({ ...verifiedFile, entries: verifiedFile.entries.slice(0, 1) }, null, 2)}\n`;
fs.writeFileSync(output, before);
const singleton = path.join(tempDir, "singleton.json");
fs.writeFileSync(singleton, before);

try {
  const registry = JSON.parse(fs.readFileSync(path.resolve("src/ich/stage5-source-registry.json"), "utf8")) as {
    sources: Array<{ id: string; url: string; categories: string[]; mode: string }>;
  };
  assert.ok(registry.sources.length >= 30, "source registry must contain at least 30 discovery sources");
  assert.equal(new Set(registry.sources.map((source) => source.id)).size, registry.sources.length, "source ids must be unique");
  assert.ok(registry.sources.every((source) => source.url.startsWith("https://")), "registry URLs must use HTTPS");
  assert.ok(registry.sources.every((source) => source.mode === "manual"), "stage 5 source discovery must remain manual");
  for (const category of ICH_PRIMARY_CATEGORIES) {
    assert.ok(registry.sources.some((source) => source.categories.includes(category)), `registry must cover ${category}`);
  }
  const ledger = JSON.parse(fs.readFileSync(path.resolve("src/ich/stage5-candidate-ledger.json"), "utf8")) as {
    total_screened: number;
    screened_out: Array<{ decision: string; duplicate_group?: string }>;
  };
  assert.ok(ledger.total_screened >= 50 && ledger.total_screened <= 70, "candidate screening ledger must contain 50-70 records");
  assert.ok(
    new Set(ledger.screened_out.filter((item) => item.decision === "duplicate").map((item) => item.duplicate_group)).size >= 2,
    "screening ledger must preserve at least two duplicate groups",
  );

  const dryRun = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/import-ich-stage5.ts", "--input", singleton, "--base", singleton, "--output", output, "--batch", "test-dry-run", "--now", "2026-07-24T00:00:00+08:00"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(fs.readFileSync(output, "utf8"), before, "dry-run must not modify output");
  const summary = JSON.parse(dryRun.stdout) as { mode: string; input: number; current: number };
  assert.equal(summary.mode, "dry-run");
  assert.equal(summary.input, 1);
  assert.equal(summary.current, 1);

  const blocked = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/import-ich-stage5.ts", "--input", singleton, "--base", singleton, "--output", output, "--batch", "test-write", "--now", "2026-07-24T00:00:00+08:00", "--write"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.notEqual(blocked.status, 0, "write below stage 5 thresholds must fail");
  assert.equal(fs.readFileSync(output, "utf8"), before, "blocked write must not modify output");
  assert.equal(new IchOpportunityStore(output).list().length, 1);

  const incrementalOutput = path.join(tempDir, "incremental.json");
  fs.writeFileSync(incrementalOutput, before);
  const incremental = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/import-ich-stage5.ts",
      "--input",
      singleton,
      "--base",
      singleton,
      "--output",
      incrementalOutput,
      "--batch",
      "test-incremental",
      "--now",
      "2026-07-24T00:00:00+08:00",
      "--incremental",
      "--write",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(incremental.status, 0, incremental.stderr || incremental.stdout);
  assert.equal(new IchOpportunityStore(incrementalOutput).list().length, 1, "incremental write must preserve its base");

  const staleCandidate = path.join(tempDir, "stale-candidate.json");
  const staleFile = structuredClone({ ...verifiedFile, entries: verifiedFile.entries.slice(0, 1) }) as any;
  staleFile.entries[0].sources.find((source: any) => source.is_primary).last_checked_at = "2026-07-01T00:00:00+08:00";
  fs.writeFileSync(staleCandidate, `${JSON.stringify(staleFile, null, 2)}\n`);
  const staleOutput = path.join(tempDir, "stale-output.json");
  fs.writeFileSync(staleOutput, before);
  const staleIncremental = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/import-ich-stage5.ts",
      "--input",
      staleCandidate,
      "--base",
      singleton,
      "--output",
      staleOutput,
      "--batch",
      "test-stale-incremental",
      "--now",
      "2026-07-24T00:00:00+08:00",
      "--incremental",
      "--write",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.notEqual(staleIncremental.status, 0, "incremental writes must reject stale source checks");
  assert.equal(fs.readFileSync(staleOutput, "utf8"), before, "rejected incremental write must not modify output");

  const seedPreservationOutput = path.join(tempDir, "seed-preservation.json");
  fs.writeFileSync(seedPreservationOutput, before);
  const seedPreservation = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/import-ich-stage5.ts",
      "--input",
      singleton,
      "--base",
      fixture,
      "--output",
      seedPreservationOutput,
      "--batch",
      "test-seed-preservation",
      "--now",
      "2026-07-24T00:00:00+08:00",
      "--write",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(seedPreservation.status, 0, seedPreservation.stderr || seedPreservation.stdout);
  const preservedEntries = new IchOpportunityStore(seedPreservationOutput).list();
  assert.equal(preservedEntries.length, verifiedFile.entries.length, "a controlled import must preserve the verified seed size");
  for (const seedEntry of verifiedFile.entries) {
    assert.ok(
      preservedEntries.some((entry) => entry.id === seedEntry.id && entry.slug === seedEntry.slug),
      `a controlled import must preserve verified seed entry ${seedEntry.slug}`,
    );
  }

  const formalFile = JSON.parse(fs.readFileSync(path.resolve("data/ich-opportunities.json"), "utf8")) as {
    schema_version: string;
    updated_at: string;
    entries: Array<Record<string, any>>;
  };
  const publishedMismatch = formalFile.entries.find((entry) => entry.slug === "expansion-batch-03-007");
  assert.ok(publishedMismatch, "source-mismatch fixture must exist");
  const withdrawnFile = structuredClone(formalFile);
  const withdrawnMismatch = withdrawnFile.entries.find((entry) => entry.slug === "expansion-batch-03-007")!;
  withdrawnMismatch.is_published = false;
  withdrawnMismatch.workflow.state = "withdrawn";
  withdrawnMismatch.workflow.revision += 1;
  withdrawnMismatch.workflow.withdrawn_at = "2026-07-27T15:30:00+08:00";
  withdrawnMismatch.workflow.history.push({
    action: "withdrawn",
    from: "published",
    to: "withdrawn",
    actor: "test-source-auditor",
    at: "2026-07-27T15:30:00+08:00",
    reason: "source does not belong to the claimed organizer",
    revision: withdrawnMismatch.workflow.revision,
  });
  withdrawnMismatch.verification.verification_status = "pending_verification";
  withdrawnMismatch.verification.needs_recheck = true;
  const withdrawnOutput = path.join(tempDir, "withdrawn-preservation.json");
  fs.writeFileSync(withdrawnOutput, `${JSON.stringify(withdrawnFile, null, 2)}\n`);
  const mismatchCandidate = path.join(tempDir, "source-mismatch-candidate.json");
  fs.writeFileSync(mismatchCandidate, `${JSON.stringify({ ...formalFile, entries: [publishedMismatch] }, null, 2)}\n`);
  const withdrawnPreservation = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/import-ich-stage5.ts",
      "--input",
      mismatchCandidate,
      "--base",
      fixture,
      "--output",
      withdrawnOutput,
      "--batch",
      "test-withdrawn-preservation",
      "--now",
      "2026-07-27T15:30:00+08:00",
      "--write",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(withdrawnPreservation.status, 0, withdrawnPreservation.stderr || withdrawnPreservation.stdout);
  const preservedWithdrawal = new IchOpportunityStore(withdrawnOutput).getBySlug("expansion-batch-03-007");
  assert.equal(preservedWithdrawal?.workflow.state, "withdrawn", "a routine import must not republish a withdrawn opportunity");
  assert.equal(preservedWithdrawal?.is_published, false, "a routine import must keep a withdrawn opportunity private");
  console.log("ICH stage 5 importer, registry and screening ledger: all checks passed");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
