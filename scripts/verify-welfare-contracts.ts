import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildWelfareFeed,
  collectAllWelfareSources,
  extractWelfareIndexLinks,
  loadRecordedWelfareOpportunities,
  mergeWelfareRecords,
  parseWelfareDetail,
  renderWelfareMarkdown,
  WELFARE_SOURCE_CODE,
  WELFARE_SOURCES,
} from "../src/public/welfare-opportunities";

const records = loadRecordedWelfareOpportunities();
assert.ok(records.length > 0, "recorded welfare opportunities must not be empty");
assert.ok(records.every((item) => item.sourceCode === WELFARE_SOURCE_CODE));
assert.ok(records.every((item) => /^https:\/\/www\.szgm\.gov\.cn\//.test(item.officialUrl)));
assert.ok(records.every((item) => /^[a-f0-9]{64}$/.test(item.rawSha256)));
assert.ok(records.every((item) => item.contactName && item.contactPhone && item.contactAddress));

const indexHtml = `<ul><li><span>2026-07-10</span><a href="/xxgk/xqgwhxxgkml/gzgg/content/post_1.html" title="光明区总工会采购消费帮扶慰问物资公告">公告</a></li><li><span>2026-07-10</span><a href="/content/post_2.html" title="无关规划公示">无关</a></li></ul>`;
const links = extractWelfareIndexLinks(indexHtml);
assert.equal(links.length, 1);
const longhuaLinks = extractWelfareIndexLinks(`<li><a href="/x.html" title="龙华区总工会职工慰问物资采购公告">公告<i>2026-07-10</i></a></li>`, WELFARE_SOURCES[1]);
assert.equal(longhuaLinks.length, 1);
const futianLinks = extractWelfareIndexLinks(`<li><a href="/x.html" title="福田区总工会送清凉慰问项目采购公告">公告</a><span>2026-07-10</span></li>`, WELFARE_SOURCES[2]);
assert.equal(futianLinks.length, 1);

const detailHtml = `<html><head><meta name="ArticleTitle" content="光明区总工会采购消费帮扶慰问物资项目变更公告"><meta name="PubDate" content="2026-07-10"></head><body><p>投标时间截至7月15日18时00分。</p><p>采购人名称：深圳市光明区总工会</p><p>联系地址：深圳市光明区测试办公地址</p><p>联系人：某某</p><p>联系电话：0755-12345678</p></body></html>`;
const parsed = parseWelfareDetail({ html: detailHtml, url: links[0].url, publishedAtHint: links[0].publishedAt, retrievedAt: "2026-07-11T00:00:00.000Z" });
assert.ok(parsed);
assert.equal(parsed.currentStage, "CORRECTED");
assert.equal(parsed.buyer, "深圳市光明区总工会");
assert.equal(parsed.deadline, "2026-07-15T18:00:00+08:00");
assert.equal(parsed.contactName, "某某");
assert.equal(parsed.contactPhone, "0755-12345678");
assert.equal(parsed.contactAddress, "深圳市光明区测试办公地址");

const merged = mergeWelfareRecords(records, records);
assert.equal(merged.length, records.length, "idempotent merge must not duplicate records");
const feed = buildWelfareFeed(records, { status: "current", now: "2026-07-11T00:00:00+08:00" });
assert.ok(feed.items.length > 0);
assert.ok(feed.items.every((item) => item.lifecycleStatus === "current"));
const afterDeadline = buildWelfareFeed(records, { status: "current", now: "2026-07-16T00:00:00+08:00" });
assert.equal(afterDeadline.items.length, 0, "expired opportunities must not stay current");
const markdown = renderWelfareMarkdown(records, "2026-07-11T00:00:00.000Z");
assert.ok(markdown.includes(records[0].title));
assert.ok(markdown.includes("联系人："));

const adr = fs.readFileSync(path.resolve("docs/architecture/ADR-0001-welfare-radar-mvp-on-chanceping.md"), "utf8");
assert.ok(adr.includes("重复声明 `country_code`"), "upstream DDL defect must remain documented until migration repair");
async function verifyThreeSources(): Promise<void> {
const tempDir = fs.mkdtempSync(path.resolve("data/verify-welfare-contracts-"));
process.env.CHANCEPING_WELFARE_STORE_PATH = path.join(tempDir, "opportunities.json");
process.env.CHANCEPING_WELFARE_RUN_SUMMARY_PATH = path.join(tempDir, "summary.json");
const fixtureIndex: Record<string, string> = {
  [WELFARE_SOURCES[0].url]: `<li><span>2026-07-10</span><a href="/a.html" title="光明区总工会消费帮扶慰问物资采购公告">公告</a></li>`,
  [WELFARE_SOURCES[1].url]: `<li><a href="/b.html" title="龙华区总工会职工慰问物资采购公告">公告<i>2026-07-10</i></a></li>`,
  [WELFARE_SOURCES[2].url]: `<li><a href="/c.html" title="福田区总工会送清凉慰问项目采购公告">公告</a><span>2026-07-10</span></li>`,
};
const fixtureDetail = (title: string) => `<meta name="ArticleTitle" content="${title}"><p>采购人名称：测试总工会</p><p>联系人：张三</p><p>联系电话：0755-12345678</p><p>联系地址：深圳市测试路1号</p><p>报名截至7月15日18时。</p>`;
const allRun = await collectAllWelfareSources({ now: new Date("2026-07-11T00:00:00Z"), evidenceDir: tempDir, fetchHtml: async (url) => fixtureIndex[url] ?? fixtureDetail(url.includes("a.html") ? "光明区总工会消费帮扶慰问物资采购公告" : url.includes("b.html") ? "龙华区总工会职工慰问物资采购公告" : "福田区总工会送清凉慰问项目采购公告") });
assert.equal(allRun.sources.length, 3);
assert.equal(allRun.sources.filter((item) => item.status === "succeeded").length, 3);
assert.equal(allRun.totalCount, 3);
const repeatedRun = await collectAllWelfareSources({ now: new Date("2026-07-11T01:00:00Z"), evidenceDir: tempDir, fetchHtml: async (url) => fixtureIndex[url] ?? fixtureDetail(url.includes("a.html") ? "光明区总工会消费帮扶慰问物资采购公告" : url.includes("b.html") ? "龙华区总工会职工慰问物资采购公告" : "福田区总工会送清凉慰问项目采购公告") });
assert.equal(repeatedRun.totalCount, 3, "repeating the same official notices must not duplicate public cards");
const failedSourceRun = await collectAllWelfareSources({ now: new Date("2026-07-11T02:00:00Z"), evidenceDir: tempDir, fetchHtml: async (url) => {
  if (url === WELFARE_SOURCES[1].url) throw new Error("simulated network failure");
  return fixtureIndex[url] ?? fixtureDetail(url.includes("a.html") ? "光明区总工会消费帮扶慰问物资采购公告（字段更新）" : "福田区总工会送清凉慰问项目采购公告");
} });
assert.equal(failedSourceRun.sources.find((item) => item.sourceCode === "OFF-SZ-005")?.status, "failed");
assert.equal(failedSourceRun.totalCount, 3, "a failed source must retain its last successful public card");
const stagedFeed = buildWelfareFeed(JSON.parse(fs.readFileSync(process.env.CHANCEPING_WELFARE_STORE_PATH!, "utf8")).records, { status: "all", now: "2026-07-11T03:00:00Z" });
assert.equal(stagedFeed.sources.length, 3);
assert.ok(stagedFeed.items.every((item) => item.officialUrl && item.rawSha256 && item.sourceCode));
const noLeak = JSON.stringify(buildWelfareFeed(loadRecordedWelfareOpportunities()));
assert.ok(!/radarId|runId|welfare-evidence|stack/i.test(noLeak));
fs.rmSync(tempDir, { recursive: true, force: true });
}
verifyThreeSources().then(() => console.log("PASS verify:welfare:contracts")).catch((error) => { console.error(error); process.exit(1); });
