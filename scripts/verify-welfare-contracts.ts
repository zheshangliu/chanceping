import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildWelfareFeed,
  extractWelfareIndexLinks,
  loadRecordedWelfareOpportunities,
  mergeWelfareRecords,
  parseWelfareDetail,
  renderWelfareMarkdown,
  WELFARE_SOURCE_CODE,
} from "../src/public/welfare-opportunities";

const records = loadRecordedWelfareOpportunities();
assert.ok(records.length > 0, "recorded welfare opportunities must not be empty");
assert.ok(records.every((item) => item.sourceCode === WELFARE_SOURCE_CODE));
assert.ok(records.every((item) => /^https:\/\/www\.szgm\.gov\.cn\//.test(item.officialUrl)));
assert.ok(records.every((item) => /^[a-f0-9]{64}$/.test(item.rawSha256)));
assert.ok(records.every((item) => !/\b1[3-9]\d{9}\b|\d{3,4}-\d{7,8}|[\w.+-]+@[\w.-]+/.test(JSON.stringify(item))));

const indexHtml = `<ul><li><span>2026-07-10</span><a href="/xxgk/xqgwhxxgkml/gzgg/content/post_1.html" title="光明区总工会采购消费帮扶慰问物资公告">公告</a></li><li><span>2026-07-10</span><a href="/content/post_2.html" title="无关规划公示">无关</a></li></ul>`;
const links = extractWelfareIndexLinks(indexHtml);
assert.equal(links.length, 1);

const detailHtml = `<html><head><meta name="ArticleTitle" content="光明区总工会采购消费帮扶慰问物资项目变更公告"><meta name="PubDate" content="2026-07-10"></head><body><p>投标时间截至7月15日18时00分。</p><p>采购人名称：深圳市光明区总工会</p><p>联系人：某某</p><p>联系电话：0755-12345678</p></body></html>`;
const parsed = parseWelfareDetail({ html: detailHtml, url: links[0].url, publishedAtHint: links[0].publishedAt, retrievedAt: "2026-07-11T00:00:00.000Z" });
assert.ok(parsed);
assert.equal(parsed.currentStage, "CORRECTED");
assert.equal(parsed.buyer, "深圳市光明区总工会");
assert.equal(parsed.deadline, "2026-07-15T18:00:00+08:00");
assert.ok(!JSON.stringify(parsed).includes("0755-12345678"));

const merged = mergeWelfareRecords(records, records);
assert.equal(merged.length, records.length, "idempotent merge must not duplicate records");
const feed = buildWelfareFeed(records, { status: "current", now: "2026-07-11T00:00:00+08:00" });
assert.ok(feed.items.length > 0);
assert.ok(feed.items.every((item) => item.lifecycleStatus === "current"));
const afterDeadline = buildWelfareFeed(records, { status: "current", now: "2026-07-16T00:00:00+08:00" });
assert.equal(afterDeadline.items.length, 0, "expired opportunities must not stay current");
const markdown = renderWelfareMarkdown(records, "2026-07-11T00:00:00.000Z");
assert.ok(markdown.includes(records[0].title));

const adr = fs.readFileSync(path.resolve("docs/architecture/ADR-0001-welfare-radar-mvp-on-chanceping.md"), "utf8");
assert.ok(adr.includes("重复声明 `country_code`"), "upstream DDL defect must remain documented until migration repair");
console.log("PASS verify:welfare:contracts");
