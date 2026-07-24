import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectWelfareSource, WELFARE_SHADOW_SOURCES } from "../src/public/welfare-opportunities";

const requested = new Set([
  "OFF-N-003", "OFF-N-005", "OFF-N-007", "OFF-N-009", "OFF-N-010", "OFF-N-011",
  "OFF-GD-003", "OFF-GZ-002", "OFF-GZ-003", "OFF-DG-001", "OFF-ZS-001", "OFF-HZ-001",
  "ORG-003", "ORG-004", "ORG-005", "OFF-N-008", "OFF-GD-001", "OFF-FS-001", "OFF-ZH-001", "OFF-GD-002",
]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-welfare-adapter-runtime-"));

async function main(): Promise<void> {
for (const source of WELFARE_SHADOW_SOURCES.filter((item) => requested.has(item.code))) {
  const detailUrl = new URL(`/福利采购-${source.code}.html`, source.url).toString();
  const title = `${source.name} 职工福利采购公告`;
  const fetchHtml = async (url: string): Promise<string> => {
    if (url === detailUrl) return `<html><head><title>${title}</title><meta name="PubDate" content="2026-07-20"></head><body>采购单位：${source.name}；联系人：张先生；联系电话：0755-12345678；联系地址：${source.region}采购服务中心；预算金额：10万元；响应文件提交截止时间：2026年8月20日。</body></html>`;
    return `<html><body><ul><li><a href="${detailUrl}" title="${title}">公告</a><span>2026-07-20</span></li></ul></body></html>`;
  };
  const result = await collectWelfareSource(source.code, { fetchHtml, evidenceDir: path.join(root, source.code), persist: false, now: new Date("2026-07-21T08:00:00+08:00") });
  assert.ok(result.publishedCount > 0, `${source.code} adapter must produce a fixture record`);
  assert.equal(result.status, "succeeded", `${source.code} fixture adapter status`);
  assert.ok(fs.existsSync(path.join(root, source.code, "adapter.json")), `${source.code} adapter manifest must be retained`);
}
console.log(`PASS verify:welfare:adapter-runtime (${requested.size} adapters parsed official-list/detail fixtures with evidence)`);
}

main().catch((error) => { console.error(error); process.exit(1); });
