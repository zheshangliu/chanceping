import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectWelfareShadowSources, WELFARE_SHADOW_SOURCES } from "../src/public/welfare-opportunities";

async function main(): Promise<void> {
  assert.equal(WELFARE_SHADOW_SOURCES.length, 12, "the rollout must begin with exactly 12 shadow candidates");
  assert.equal(new Set(WELFARE_SHADOW_SOURCES.map((source) => source.code)).size, 12, "shadow source codes must be unique");
  assert.ok(WELFARE_SHADOW_SOURCES.every((source) => source.rollout === "shadow" && source.enabled), "candidates must remain enabled only for shadow collection");
  assert.ok(WELFARE_SHADOW_SOURCES.some((source) => source.code === "OFF-N-002" && source.shadowAccess === "restricted"), "procurement intent must retain its restricted POC policy");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-welfare-shadow-"));
  const now = new Date("2026-07-16T08:35:00+08:00");
  const summary = await collectWelfareShadowSources({
    now,
    evidenceDir: path.join(root, "evidence"),
    summaryPath: path.join(root, "summary.json"),
    historyPath: path.join(root, "history.jsonl"),
    fetchHtml: async (url) => url.includes("cgyx.ccgp.gov.cn") ? "<html>安全验证 captcha</html>" : "<html><title>Official source</title></html>",
  });
  assert.equal(summary.sources.length, 12);
  assert.equal(summary.sources.find((source) => source.sourceCode === "OFF-N-002")?.status, "restricted");
  assert.equal(summary.sources.filter((source) => source.status === "succeeded").length, 11);
  assert.ok(summary.sources.every((source) => source.status === "restricted" || Boolean(source.rawSha256)), "every fetched page must retain a hash");
  assert.ok(fs.existsSync(path.join(root, "summary.json")), "latest run summary must be persisted");
  assert.equal(fs.readFileSync(path.join(root, "history.jsonl"), "utf8").trim().split("\n").length, 1, "run history must append a durable line");
  console.log("PASS verify:welfare:shadow-sources");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
