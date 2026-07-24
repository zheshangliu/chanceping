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
  entries: unknown[];
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
    ["--import", "tsx", "scripts/import-ich-stage5.ts", "--input", singleton, "--output", output, "--batch", "test-dry-run", "--now", "2026-07-24T00:00:00+08:00"],
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
    ["--import", "tsx", "scripts/import-ich-stage5.ts", "--input", singleton, "--output", output, "--batch", "test-write", "--now", "2026-07-24T00:00:00+08:00", "--write"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.notEqual(blocked.status, 0, "write below stage 5 thresholds must fail");
  assert.equal(fs.readFileSync(output, "utf8"), before, "blocked write must not modify output");
  assert.equal(new IchOpportunityStore(output).list().length, 1);
  console.log("ICH stage 5 importer, registry and screening ledger: 18/18 checks passed");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
