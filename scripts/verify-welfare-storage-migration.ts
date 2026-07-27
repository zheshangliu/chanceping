import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveWelfareRuntimePaths } from "../src/public/welfare-opportunities";

const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
delete process.env.CHANCEPING_WELFARE_STORE_PATH;
delete process.env.CHANCEPING_WELFARE_CANDIDATE_PATH;
delete process.env.CHANCEPING_WELFARE_RUN_SUMMARY_PATH;
const productionPaths = resolveWelfareRuntimePaths();
assert.equal(productionPaths.opportunities, "/var/lib/chanceping/welfare/opportunities.json");
assert.equal(productionPaths.candidates, "/var/lib/chanceping/welfare/candidates.json");
assert.equal(productionPaths.summary, "/var/lib/chanceping/welfare/run-summary.json");
if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-welfare-migration-"));
const runtimeDir = path.join(tempDir, "runtime");
const env = { ...process.env, CHANCEPING_WELFARE_RUNTIME_DIR: runtimeDir };
const run = () => spawnSync("node_modules/.bin/tsx", ["scripts/migrate-welfare-runtime-storage.ts"], { cwd: process.cwd(), env, encoding: "utf8" });

const first = run();
assert.equal(first.status, 0, first.stderr || first.stdout);
const runtimePath = path.join(runtimeDir, "opportunities.json");
assert.ok(fs.existsSync(runtimePath), "migration must initialize the persistent runtime snapshot");
const initialized = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
assert.ok(initialized.records.length >= 80, "migration must initialize from the verified Git seed");

const preserved = { version: "1.0", updatedAt: "2099-01-01T00:00:00.000Z", records: [initialized.records[0]] };
fs.writeFileSync(runtimePath, JSON.stringify(preserved));
const second = run();
assert.equal(second.status, 0, second.stderr || second.stdout);
assert.deepEqual(JSON.parse(fs.readFileSync(runtimePath, "utf8")), preserved, "migration must not overwrite a valid runtime snapshot");

fs.rmSync(tempDir, { recursive: true, force: true });
console.log("PASS verify:welfare:storage-migration");
