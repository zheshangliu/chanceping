import {
  buildOpportunityV2Display,
  cleanOpportunityDisplayText,
  createTranslatedOpportunityV2Translation,
  isForeignLanguageOpportunity,
  opportunityV2SourceHash,
} from "../src/opportunity-v2/display";
import { translationPrompt } from "../src/opportunity-v2/translation-provider";
import type { OpportunityV2 } from "../src/opportunity-v2/types";

const failures: string[] = [];

function check(name: string, condition: boolean, details: string): void {
  if (!condition) failures.push(`${name}: ${details}`);
}

function item(overrides: Partial<OpportunityV2> = {}): OpportunityV2 {
  return {
    id: "v13-fixture",
    title: "年度征集 – Ferry Building Gallery",
    summary: "Council founded in 1973 supports craft; no project-specific details.",
    source_id: "fixture-source",
    source_item_id: "fixture-item",
    source_name: "Fixture Source",
    source_url: "https://example.test/list",
    detail_url: "https://example.test/opportunity",
    category: "exhibition_market",
    region: "GLOBAL",
    tags: ["craft"],
    deadline: null,
    deadline_text: null,
    deadline_source_url: null,
    deadline_raw_text: null,
    deadline_resolution: "source_has_no_date",
    deadline_conflicts: [],
    deadline_conflict_unsafe: false,
    encoding_error: false,
    encoding_error_fields: [],
    status: "UNKNOWN_DEADLINE",
    first_seen_at: "2026-09-01T00:00:00.000Z",
    last_seen_at: "2026-09-17T00:00:00.000Z",
    discovered_by_sources: ["fixture-source"],
    radar_relevance: "RELEVANT",
    ...overrides,
  };
}

const translatedTitleOnly = createTranslatedOpportunityV2Translation(
  item(),
  { title_zh: "年度征集｜渡轮大厦画廊", summary_zh: "" },
  new Date("2026-09-17T00:00:00.000Z"),
);
check(
  "title-only translation is accepted",
  translatedTitleOnly.status === "translated",
  JSON.stringify(translatedTitleOnly),
);
const titleOnlyDisplay = buildOpportunityV2Display(item(), [translatedTitleOnly]);
check(
  "title-only translation is displayed",
  titleOnlyDisplay.title === "年度征集｜渡轮大厦画廊" && titleOnlyDisplay.summary === "",
  JSON.stringify(titleOnlyDisplay),
);

const noisy = item({
  id: "noise",
  title: "“小鲤”文创作品 & 展览",
  summary: "首页 热门推荐 联系客服 广告投放 浏览量6132 &nbsp; 来源页面未提供可直接使用的赛事简介，请打开来源原文查看完整要求。",
});
const noisyDisplay = buildOpportunityV2Display(noisy);
check(
  "display text cleaner removes navigation and entities",
  cleanOpportunityDisplayText(noisy.summary) === "",
  cleanOpportunityDisplayText(noisy.summary),
);
check(
  "noisy summary is omitted",
  noisyDisplay.summary === "" && !noisyDisplay.summary.includes("6132") && !noisyDisplay.summary.includes("&nbsp;"),
  JSON.stringify(noisyDisplay),
);
check(
  "html entities are decoded or removed",
  !noisyDisplay.title.includes("&") && !noisyDisplay.summary.includes("&"),
  JSON.stringify(noisyDisplay),
);

const realProject = item({
  id: "real-project",
  title: "AURA: Open Call",
  summary: "Submit a multimedia project for the online zine. Applications close 30 September 2026.",
});
const realTranslation = createTranslatedOpportunityV2Translation(
  realProject,
  { title_zh: "AURA：开放征集", summary_zh: "面向多媒体创作者的线上杂志项目征集。" },
);
check("real translated title remains usable", realTranslation.status === "translated", JSON.stringify(realTranslation));
check("foreign title is detected", isForeignLanguageOpportunity(realProject), "foreign title was not detected");

const properName = item({ id: "loewe", title: "LOEWE FOUNDATION Craft Prize 2027", summary: "Open call for craft artists." });
check("proper name remains foreign for translation", isForeignLanguageOpportunity(properName), "LOEWE was not selected");

const mixed = item({ id: "mixed", title: "年度征集 – Ferry Building Gallery", summary: "开放提交作品。" });
check("mixed title is not treated as already Chinese", isForeignLanguageOpportunity(mixed), "mixed title was treated as Chinese");

const prompt = translationPrompt({ title: "Open Grant", summary: "A cultural partnership commission for craft makers.", targetLanguage: "zh-CN" });
check("prompt covers non-competition opportunities", /采购|资助|展览|驻留|合作/u.test(prompt.system), prompt.system);
check("prompt protects structured facts", /deadline|金额|资格|结构化/u.test(prompt.system), prompt.system);

const unchanged = item({ id: "cache", title: "Annual Call – Ferry Building Gallery", summary: "Submit work." });
const changedSeen = { ...unchanged, last_seen_at: "2026-09-18T00:00:00.000Z" };
check(
  "cache hash ignores observation timestamp",
  opportunityV2SourceHash(unchanged) === opportunityV2SourceHash(changedSeen),
  "last_seen_at changed the display cache hash",
);

if (failures.length) {
  console.error(`V1.3 display checks: ${failures.length} FAIL`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("V1.3 display checks: PASS");
