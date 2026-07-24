import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectWelfareShadowSources, WELFARE_SHADOW_SOURCES, WELFARE_SOURCES } from "../src/public/welfare-opportunities";

async function main(): Promise<void> {
  assert.ok(WELFARE_SHADOW_SOURCES.length >= 23, "the original restricted POCs and expansion candidates must stay isolated from the public feed");
  assert.equal(new Set(WELFARE_SHADOW_SOURCES.map((source) => source.code)).size, WELFARE_SHADOW_SOURCES.length, "shadow source codes must be unique");
  assert.ok(WELFARE_SOURCES.some((source) => source.code === "OFF-N-001" && source.rollout === "public"), "CCGP procurement announcements must use the public adapter");
  assert.ok(WELFARE_SOURCES.some((source) => source.code === "OFF-N-004" && source.rollout === "public"), "national public-resource announcements must use the public adapter");
  assert.ok(WELFARE_SOURCES.some((source) => source.code === "OFF-GD-004" && source.opportunityType === "CHANNEL_PARTNERSHIP"), "Guangdong federation opportunities must remain channel partnerships");
  assert.ok(WELFARE_SOURCES.some((source) => source.code === "WEL-001" && source.opportunityType === "SUPPLIER_RECRUITMENT"), "Guanaitong must remain supplier recruitment");
  assert.ok(WELFARE_SOURCES.some((source) => source.code === "OFF-SZ-002" && source.publicApi === "szggzy-government-procurement"), "Shenzhen public-resource procurement must use its official public JSON list");
  assert.ok(WELFARE_SHADOW_SOURCES.every((source) => source.rollout === "shadow" && source.enabled), "candidates must remain enabled only for shadow collection");
  assert.ok(WELFARE_SHADOW_SOURCES.some((source) => source.code === "OFF-N-002" && source.shadowAccess === "restricted"), "procurement intent must retain its restricted POC policy");
  assert.ok(WELFARE_SHADOW_SOURCES.some((source) => source.code === "OFF-ZJ-001" && source.shadowAccess === "restricted"), "SessionVerify portals must remain restricted POCs without bypasses");
  for (const code of ["OFF-N-003", "OFF-N-005", "OFF-N-006", "OFF-N-007", "OFF-N-008", "OFF-N-009", "OFF-N-010", "OFF-N-011", "OFF-GD-001", "OFF-GD-003", "OFF-GZ-002", "OFF-GZ-003", "OFF-FS-001", "OFF-DG-001", "OFF-ZH-001", "OFF-ZS-001", "OFF-HZ-001", "ORG-003", "ORG-004", "ORG-005"]) {
    assert.ok(WELFARE_SHADOW_SOURCES.some((source) => source.code === code && source.shadowAccess !== "restricted"), `${code} must begin as a direct, isolated POC`);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-welfare-shadow-"));
  const now = new Date("2026-07-16T08:35:00+08:00");
  const summary = await collectWelfareShadowSources({
    now,
    evidenceDir: path.join(root, "evidence"),
    summaryPath: path.join(root, "summary.json"),
    historyPath: path.join(root, "history.jsonl"),
    fetchHtml: async (url) => url.includes("cgyx.ccgp.gov.cn") ? "<html>安全验证 captcha</html>" : "<html><title>Official source</title></html>",
  });
  assert.equal(summary.sources.length, WELFARE_SHADOW_SOURCES.length);
  assert.equal(summary.sources.find((source) => source.sourceCode === "OFF-N-002")?.status, "restricted");
  assert.equal(summary.sources.filter((source) => source.status === "succeeded").length + summary.sources.filter((source) => source.status === "empty").length + summary.sources.filter((source) => source.status === "restricted").length + summary.sources.filter((source) => source.status === "failed").length, WELFARE_SHADOW_SOURCES.length);
  assert.ok(summary.sources.filter((source) => source.status === "restricted").length >= 2);
  assert.ok(summary.sources.every((source) => source.status === "restricted" || Boolean(source.rawSha256)), "every fetched page must retain a hash");
  assert.ok(fs.existsSync(path.join(root, "summary.json")), "latest run summary must be persisted");
  assert.equal(fs.readFileSync(path.join(root, "history.jsonl"), "utf8").trim().split("\n").length, 1, "run history must append a durable line");
  console.log("PASS verify:welfare:shadow-sources");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
