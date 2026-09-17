import assert from "node:assert/strict";
import { decodeOpportunityResponseBody } from "../src/opportunity-v2/pipeline";
import { buildOpportunityV2Display } from "../src/opportunity-v2/display";
import { buildOpportunityV2MemoSnapshot } from "../src/opportunity-v2/memo";
import { mergeOpportunityV2 } from "../src/opportunity-v2/opportunity-pool";
import { filterOpportunityV2Radar } from "../src/opportunity-v2/radar-view";
import { hasEncodingCorruption } from "../src/ich/aggregation/adapters/common";
import type { OpportunityV2, OpportunityV2Source } from "../src/opportunity-v2/types";

const source: OpportunityV2Source = {
  id: "fixture-source",
  name: "Fixture Source",
  url: "https://example.com/list",
  region: "CN",
  priority: "P0",
  types: ["competition"],
  radars: ["ich"],
  enabled: true,
  status: "ACTIVE",
  last_fetch_at: null,
};

function opportunity(overrides: Partial<OpportunityV2>): OpportunityV2 {
  return {
    id: "oppv2_fixture",
    title: "2026 LOGO设计大赛",
    summary: "正常摘要",
    source_id: source.id,
    source_item_id: "fixture-item",
    source_name: source.name,
    source_url: source.url,
    detail_url: "https://example.com/item/1",
    category: "competition",
    region: "CN",
    tags: [],
    deadline: null,
    status: "UNKNOWN_DEADLINE",
    first_seen_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: "2026-01-01T00:00:00.000Z",
    discovered_by_sources: [source.id],
    radar_relevance: "RELEVANT",
    ...overrides,
  };
}

const gb18030Title = Buffer.from("1tDOxMj8ysKx6szi", "base64");
assert.equal(decodeOpportunityResponseBody(gb18030Title, "text/html; charset=gb18030", "www.1zj.com"), "中文赛事标题");
assert.match(decodeOpportunityResponseBody(Buffer.from("<meta charset=\"utf-8\">UTF-8中文页面", "utf8"), "", "www.1zj.com"), /UTF-8中文页面/u);
assert.equal(decodeOpportunityResponseBody(Buffer.from("中文赛事标题", "utf8"), "", "www.1zj.com"), "中文赛事标题");
assert.equal(decodeOpportunityResponseBody(gb18030Title, "", "www.1zj.com"), "中文赛事标题");
assert.equal(hasEncodingCorruption("����logo"), true);
assert.equal(hasEncodingCorruption("2026 LOGO设计大赛"), false);

const corrupted = opportunity({ title: "����logo", summary: "坏摘要" });
const normal = opportunity({ id: "oppv2_fixture_normal", title: "2026 LOGO设计大赛", summary: "正常摘要" });
const reconciled = mergeOpportunityV2([corrupted], [normal]);
assert.equal(reconciled.length, 1);
assert.equal(reconciled[0]?.title, "2026 LOGO设计大赛");
assert.equal(reconciled[0]?.encoding_error, false);
const urlPrior = opportunity({ id: "oppv2_fixture_url_old", source_item_id: undefined, title: "����logo", detail_url: "https://example.com/item/2?utm_source=old" });
const urlIncoming = opportunity({ id: "oppv2_fixture_url_new", source_item_id: undefined, title: "2026 LOGO设计大赛 2", detail_url: "https://example.com/item/2#detail" });
const urlReconciled = mergeOpportunityV2([urlPrior], [urlIncoming]);
assert.equal(urlReconciled.length, 1);
assert.equal(urlReconciled[0]?.title, "2026 LOGO设计大赛 2");

const summaryCorrupted = opportunity({ id: "oppv2_fixture_summary", summary: "����summary" });
assert.equal(filterOpportunityV2Radar([summaryCorrupted], [source]).length, 1);
assert.equal(buildOpportunityV2Display(summaryCorrupted).summary, "");
assert.equal(buildOpportunityV2MemoSnapshot({ opportunities: [corrupted, summaryCorrupted], sources: [source], health: [], alreadyFiltered: false }).items.length, 1);

const outputs = [
  JSON.stringify({ title: normal.title, summary: normal.summary }),
  `<h1>${normal.title}</h1><p>${normal.summary}</p>`,
  `| ${normal.id} | ${normal.title} |`,
];
assert.equal(outputs.some((output) => hasEncodingCorruption(output)), false);
console.log(JSON.stringify({ explicit_gb18030: "PASS", meta_utf8: "PASS", utf8_no_charset_legacy_host: "PASS", gb18030_no_charset_legacy_host: "PASS", replacement_detection: "PASS", normal_text: "PASS", source_identity_reconciliation: "PASS", summary_error_kept_but_hidden: "PASS", outputs_clean: "PASS" }, null, 2));
