import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildWelfareFeed,
  collectAllWelfareSources,
  extractWelfareIndexLinks,
  loadRecordedWelfareOpportunities,
  loadPersistedWelfareOpportunities,
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
const expandedContextLinks = extractWelfareIndexLinks(`<li><a href="/x.html" title="职工防暑降温与健康管理服务商征集公告">公告</a><span>2026-07-10</span></li>`, WELFARE_SOURCES[2]);
assert.equal(expandedContextLinks.length, 1, "expanded welfare scenes must be discoverable");
const relayLinks = extractWelfareIndexLinks(`* 2026-07-10[深圳市光明区总工会2026年采购消费帮扶慰问物资项目采购变更公告](https://www.szgm.gov.cn/content/post_1.html "深圳市光明区总工会2026年采购消费帮扶慰问物资项目采购变更公告")`, WELFARE_SOURCES[0]);
assert.equal(relayLinks.length, 1, "Reader Markdown links with a title attribute must be collected");
assert.equal(relayLinks[0].publishedAt, "2026-07-10", "Reader Markdown publication dates must drive current/history classification");
const ccgpDiscovery = extractWelfareIndexLinks(`<li><span>2026-07-10</span><a href="/x.html" title="某单位物业服务采购项目公开招标公告">公告</a></li>`, WELFARE_SOURCES.find((source) => source.code === "OFF-N-001"));
assert.equal(ccgpDiscovery.length, 1, "candidate discovery must retain procurement links whose welfare context is only on the detail page");
const ggzyPolicy = extractWelfareIndexLinks(`<li><a href="/policy.html">政府采购政策解读与管理办法</a><span>2026-07-10</span></li>`, WELFARE_SOURCES.find((source) => source.code === "OFF-N-004"));
assert.equal(ggzyPolicy.length, 0, "generic policy pages must not enter welfare candidate discovery");

const detailHtml = `<html><head><meta name="ArticleTitle" content="光明区总工会采购消费帮扶慰问物资项目变更公告"><meta name="PubDate" content="2026-07-10"></head><body><p>投标时间截至7月15日18时00分。</p><p>采购人名称：深圳市光明区总工会</p><p>联系地址：深圳市光明区测试办公地址</p><p>联系人：某某</p><p>联系电话：0755-12345678</p></body></html>`;
const parsed = parseWelfareDetail({ html: detailHtml, url: links[0].url, publishedAtHint: links[0].publishedAt, retrievedAt: "2026-07-11T00:00:00.000Z" });
assert.ok(parsed);
assert.equal(parsed.currentStage, "CORRECTED");
assert.equal(parsed.buyer, "深圳市光明区总工会");
assert.equal(parsed.deadline, "2026-07-15T18:00:00+08:00");
assert.equal(parsed.contactName, "某某");
assert.equal(parsed.contactPhone, "0755-12345678");
assert.equal(parsed.contactAddress, "深圳市光明区测试办公地址");
const unlabeledBoundary = parseWelfareDetail({ html: `<title>成都市武侯区职工体检服务竞争性磋商公告</title><p>采购单位 成都市武侯区人民政府华兴街道办事处 公告时间 2026年7月20日 响应文件提交截止时间：2026年7月31日10时。联系地址 成都市武侯区测试路。</p>`, url: "https://example.gov.cn/wuhou.html", sourceCode: "OFF-SZ-004", retrievedAt: "2026-07-20T00:00:00.000Z" });
assert.ok(unlabeledBoundary);
assert.equal(unlabeledBoundary.buyer, "成都市武侯区人民政府华兴街道办事处", "buyer extraction must stop at the next unlabeled portal field");
const normalizedFeed = buildWelfareFeed([unlabeledBoundary], { status: "all" });
assert.equal(normalizedFeed.items[0].buyer, "成都市武侯区人民政府华兴街道办事处", "public feed must normalize persisted buyer text");

const merged = mergeWelfareRecords(records, records);
assert.equal(merged.length, records.length, "idempotent merge must not duplicate records");
const feed = buildWelfareFeed(records, { status: "current", now: "2026-07-11T00:00:00+08:00" });
assert.ok(feed.items.length > 0);
assert.ok(feed.items.every((item) => item.salesPriority && typeof item.salesScore === "number" && item.salesAction), "every public opportunity must expose sales triage fields");
assert.ok(feed.items.every((item) => item.lifecycleStatus === "current"));
const afterDeadline = buildWelfareFeed(records, { status: "current", now: "2026-07-16T00:00:00+08:00" });
assert.equal(afterDeadline.items.length, 0, "expired opportunities must not stay current");
const markdown = renderWelfareMarkdown(records, "2026-07-11T00:00:00.000Z");
assert.ok(markdown.includes(records[0].title));
assert.ok(markdown.includes("联系人："));

const adr = fs.readFileSync(path.resolve("docs/architecture/ADR-0001-welfare-radar-mvp-on-chanceping.md"), "utf8");
assert.ok(adr.includes("重复声明 `country_code`"), "upstream DDL defect must remain documented until migration repair");
const sourceModule = fs.readFileSync(path.resolve("src/public/welfare-opportunities.ts"), "utf8");
assert.match(sourceModule, /--tls-max", "1\.2"/, "SWAS TLS 1.3 EC failures must retry with certificate-verified TLS 1.2");
assert.match(sourceModule, /gnutls-cli/, "SWAS OpenSSL EC failures must fall back to GnuTLS with trusted certificate validation");
assert.ok(!sourceModule.includes('"--quiet"'), "Ubuntu 22.04 gnutls-cli must use portable options");
assert.ok(!sourceModule.includes('"--crlf"'), "GnuTLS transport must match the verified default Ubuntu client handshake");
assert.ok(sourceModule.includes("Handshake was completed"), "GnuTLS transport must wait for handshake completion before sending HTTP");
assert.ok(sourceModule.includes("r.jina.ai/http://"), "public official pages need an approved compatibility relay after direct TLS failures");
const relayMarkdown = `Title: 光明区总工会采购消费帮扶慰问物资项目\n\n采购人名称：深圳市光明区总工会\n联系人：张小姐\n联系电话：0755-12345678`;
const relayParsed = parseWelfareDetail({ html: relayMarkdown, url: "https://www.szgm.gov.cn/example.html", sourceCode: "OFF-SZ-004", retrievedAt: "2026-07-11T00:00:00.000Z" });
assert.ok(relayParsed && relayParsed.title.includes("消费帮扶"), "Reader Markdown detail must retain the official title");
async function verifyPublicSources(): Promise<void> {
// Release directories are intentionally root-owned on SWAS. Verification must
// remain runnable by the Workbench admin user, so never create test fixtures
// below process.cwd().
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-welfare-contracts-"));
process.env.CHANCEPING_WELFARE_STORE_PATH = path.join(tempDir, "opportunities.json");
process.env.CHANCEPING_WELFARE_RUN_SUMMARY_PATH = path.join(tempDir, "summary.json");
const fixtureIndex: Record<string, string> = {
  [WELFARE_SOURCES[0].url]: `<li><span>2026-07-10</span><a href="/a.html" title="光明区总工会消费帮扶慰问物资采购公告">公告</a></li>`,
  [WELFARE_SOURCES[1].url]: `<li><a href="/b.html" title="龙华区总工会职工慰问物资采购公告">公告<i>2026-07-10</i></a></li>`,
  [WELFARE_SOURCES[2].url]: `<li><a href="/c.html" title="福田区总工会送清凉慰问项目采购公告">公告</a><span>2026-07-10</span></li>`,
};
const ccgp = WELFARE_SOURCES.find((source) => source.code === "OFF-N-001")!;
const ggzy = WELFARE_SOURCES.find((source) => source.code === "OFF-N-004")!;
const gdftu = WELFARE_SOURCES.find((source) => source.code === "OFF-GD-004")!;
const guanai = WELFARE_SOURCES.find((source) => source.code === "WEL-001")!;
const szGgzy = WELFARE_SOURCES.find((source) => source.code === "OFF-SZ-002")!;
const sysu = WELFARE_SOURCES.find((source) => source.code === "ORG-001")!;
const scut = WELFARE_SOURCES.find((source) => source.code === "ORG-002")!;
const gzGpc = WELFARE_SOURCES.find((source) => source.code === "OFF-GZ-001")!;
for (const url of ccgp.indexUrls ?? []) fixtureIndex[url] = `<li><a href="https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202607/example.html" title="2026年职工疗休养服务采购项目公开招标公告">公告</a> 发布时间：<em>2026-07-10 09:00</em></li>`;
fixtureIndex[ggzy.url] = `<li><a href="/information/deal/html/a/440000/0201/20260710/wrapper.html">广东省职工餐厅餐饮服务采购项目</a><span>2026-07-10</span></li>`;
fixtureIndex[gdftu.url] = `<li><span>[2026-07-10]</span><a href="/xwzx/tzgg/content/post_1.html">广东工会大厦关于公开招募粤港澳职工之家项目合作单位的公告</a></li>`;
fixtureIndex[guanai.url] = `<title>供应商招募_员工福利积分_企业福利平台</title><p>实物类商家入驻申请发送邮件至 sourcing@guanaitong.com</p>`;
fixtureIndex["https://www.szggzy.com/cms/api/v1/trade/content/page"] = JSON.stringify({ data: { content: [{
  noticeTitle: "深圳市总工会职工疗休养服务采购公告",
  linkTo: "http://zfcg.szggzy.com:8081/gsgg/example.html",
  releaseTime: "2026-07-10 09:00:00",
  projectCode: "SZCG20260001",
  purchaseCom: "深圳市总工会",
  purchaseMan: "李女士",
  noticeCloseTime: "2026年7月15日18时",
}] } });
fixtureIndex[sysu.url] = `<li class="list-item list-item-line"><p><a href="/node/1">中山大学工会职工体检服务采购项目</a></p></li>`;
fixtureIndex[scut.url] = `<li><a href="/houqin/2026/0703/c1/page.htm" title="2026年中秋月饼及月饼馅料采购公告">公告</a><span>2026-07-03</span></li>`;
fixtureIndex["https://www.guangzhougpc.cn/frontend/content/articles?channel=purchase-intention&limit=12"] = JSON.stringify({ content: [{ id: "intent-1", title: "广州市总工会职工疗休养服务采购意向", publishDate: "2026-07-10T09:00:00+08:00", description: "采购人：广州市总工会；联系人：王女士；联系电话：020-12345678。" }] });
fixtureIndex["https://www.guangzhougpc.cn/frontend/content/articles?channel=demand-collection&limit=12"] = JSON.stringify({ content: [{ id: "demand-1", title: "职工中秋慰问品采购需求供应商征集公告", publishDate: "2026-07-10T09:00:00+08:00", description: "采购人：广州市总工会；联系人：李女士；联系电话：020-87654321。" }] });
const fixtureDetail = (title: string) => `<meta name="ArticleTitle" content="${title}"><p>采购单位：测试总工会。采购单位地址：深圳市测试路1号。项目联系人：张三。项目联系电话：0755-12345678。提交投标文件截止时间：2026年7月15日18时。预算金额：10万元。</p>`;
const detailFor = (url: string) => url.includes("wrapper.html") ? `<title>交易公开页面</title><script>var firstLastUrl = '/information/deal/html/b/440000/0201/20260710/body.html';</script>` : url.includes("gdftu.org.cn") ? `<meta name="ArticleTitle" content="广东工会大厦关于公开招募粤港澳职工之家项目合作单位的公告"><p>联系人：张三。联系电话：020-12345678。联系地址：广州市测试路1号。</p>` : url.includes("bidding.sysu.edu.cn") ? `<title>中山大学工会职工体检服务采购项目</title><div>项目联系人电话 020-84115089 投标响应文件截止时间 2026-07-15</div>` : url.includes("scut.edu.cn/houqin") ? `<title>2026年中秋月饼及月饼馅料采购公告</title><p>预估年度采购总金额：14.78万元。报名、资料递交截止时间：2026年7月8日。联系人及电话：邝老师、郭老师：020-87111386。</p>` : fixtureDetail(url.includes("ccgp.gov.cn") ? "2026年职工疗休养服务采购项目公开招标公告" : url.includes("ggzy.gov.cn") ? "广东省职工餐厅餐饮服务采购项目" : url.includes("a.html") ? "光明区总工会消费帮扶慰问物资采购公告" : url.includes("b.html") ? "龙华区总工会职工慰问物资采购公告" : "福田区总工会送清凉慰问项目采购公告");
const allRun = await collectAllWelfareSources({ now: new Date("2026-07-11T00:00:00Z"), evidenceDir: tempDir, fetchHtml: async (url) => fixtureIndex[url] ?? detailFor(url) });
assert.ok(allRun.sources.length >= 31, "promoted public sources must be part of the collection run");
assert.ok(allRun.sources.filter((item) => item.status === "succeeded").length >= 9, "sources with current welfare matches must succeed");
assert.ok(allRun.sources.filter((item) => item.status === "empty").length >= 2, "sources without a current welfare match must remain honest empty results");
assert.ok(allRun.sources.every((item) => item.status === "succeeded" || item.status === "empty"), "fixtures must not hide a failed public source");
assert.ok(allRun.totalCount >= 10, "public-source fixtures must yield real cards without inventing a fixed cross-source count");
const persisted = loadPersistedWelfareOpportunities();
assert.ok(persisted.every((item) => item.officialUrl && /^[a-f0-9]{64}$/.test(item.rawSha256)), "every public fixture card must retain an official URL and raw-content hash");
assert.equal(loadPersistedWelfareOpportunities().find((item) => item.sourceCode === "OFF-GD-004")?.opportunityType, "CHANNEL_PARTNERSHIP");
assert.equal(loadPersistedWelfareOpportunities().find((item) => item.sourceCode === "WEL-001")?.opportunityType, "SUPPLIER_RECRUITMENT");
assert.ok(loadPersistedWelfareOpportunities().some((item) => item.sourceCode === "OFF-SZ-002" && item.buyer === "深圳市总工会" && item.contactName === "李女士"), "public JSON notices must retain official buyer and contact evidence");
assert.ok(loadPersistedWelfareOpportunities().some((item) => item.sourceCode === "ORG-001" && item.contactPhone === "020-84115089" && item.deadline === "2026-07-15T23:59:00+08:00"), "SYSU Drupal procurement detail must retain public deadline and contact evidence");
assert.ok(loadPersistedWelfareOpportunities().some((item) => item.sourceCode === "ORG-002" && item.budgetDisplay === "14.78万元" && item.contactPhone.includes("020-87111386")), "SCUT public procurement detail must retain published budget and contact evidence");
assert.equal(loadPersistedWelfareOpportunities().find((item) => item.sourceCode === "ORG-002")?.lifecycleStatus, "historical", "expired official deadlines must be persisted as historical for reports and source summaries");
assert.ok(loadPersistedWelfareOpportunities().some((item) => item.sourceCode === "OFF-GZ-001" && item.opportunityType === "PROCUREMENT_INTENT"), "Guangzhou procurement intentions must remain demand-signal cards");
assert.ok(loadPersistedWelfareOpportunities().some((item) => item.sourceCode === "OFF-GZ-001" && item.opportunityType === "SUPPLIER_RECRUITMENT"), "Guangzhou supplier collections must remain supplier-recruitment cards");
const repeatedRun = await collectAllWelfareSources({ now: new Date("2026-07-11T01:00:00Z"), evidenceDir: tempDir, fetchHtml: async (url) => fixtureIndex[url] ?? detailFor(url) });
assert.equal(repeatedRun.totalCount, allRun.totalCount, "repeating the same official notices must not duplicate public cards");
const failedSourceRun = await collectAllWelfareSources({ now: new Date("2026-07-11T02:00:00Z"), evidenceDir: tempDir, fetchHtml: async (url) => {
  if (url === WELFARE_SOURCES[1].url) throw new Error("simulated network failure");
  return fixtureIndex[url] ?? (url.includes("a.html") ? fixtureDetail("光明区总工会消费帮扶慰问物资采购公告（字段更新）") : detailFor(url));
} });
assert.equal(failedSourceRun.sources.find((item) => item.sourceCode === "OFF-SZ-005")?.status, "failed");
assert.equal(failedSourceRun.totalCount, allRun.totalCount, "a failed source must retain its last successful public card");
const stagedFeed = buildWelfareFeed(JSON.parse(fs.readFileSync(process.env.CHANCEPING_WELFARE_STORE_PATH!, "utf8")).records, { status: "all", now: "2026-07-11T03:00:00Z" });
assert.equal(stagedFeed.sources.length, WELFARE_SOURCES.length);
assert.ok(stagedFeed.items.every((item) => item.officialUrl && item.rawSha256 && item.sourceCode));
const noLeak = JSON.stringify(buildWelfareFeed(loadRecordedWelfareOpportunities()));
assert.ok(!/radarId|runId|welfare-evidence|stack/i.test(noLeak));
fs.rmSync(tempDir, { recursive: true, force: true });
}
verifyPublicSources().then(() => console.log("PASS verify:welfare:contracts")).catch((error) => { console.error(error); process.exit(1); });
