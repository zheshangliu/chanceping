import assert from "node:assert/strict";
import { createAzureTranslator } from "../src/opportunity-v2/translation-providers/azure-translator";
import { createGoogleTranslator } from "../src/opportunity-v2/translation-providers/google-translator";
import { createLibreTranslate } from "../src/opportunity-v2/translation-providers/libretranslate";
import { configuredTranslationProviders, createLlmTranslationProvider, translateWithProviderChain, type OpportunityTranslationProvider } from "../src/opportunity-v2/translation-provider";
import { createTranslatedOpportunityV2Translation, isForeignLanguageOpportunity, validateOpportunityV2Translation, type OpportunityV2 } from "../src/opportunity-v2";

const fixture = (title: string, summary: string): OpportunityV2 => ({
  id: `fixture-${title.slice(0, 8)}`, title, summary, source_id: "fixture", source_name: "Fixture", source_url: "https://example.com", detail_url: "https://example.com/detail", category: "competition", region: "GLOBAL", tags: [], deadline: null, status: "CURRENT", first_seen_at: "2026-09-08T00:00:00.000Z", last_seen_at: "2026-09-08T00:00:00.000Z", discovered_by_sources: ["fixture"], radar_relevance: "RELEVANT",
});

function response(value: unknown): Response { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }

async function main(): Promise<void> {
  const loewe = fixture("LOEWE FOUNDATION Craft Prize 2027", "Submit one original work. Prize amount €100,000.");
  const craftforms = fixture("CraftForms 2026", "Applications close on 15 October 2026. Entry fee £45.");
  const homo = fixture("Homo Faber Fellowship", "The fellowship supports makers and includes a $2,000 stipend.");
  const jp = fixture("東京工芸コンペティション 2026", "応募締切は2026年10月20日です。");
  const ko = fixture("2026 공예 공모", "신청 마감은 2026-10-20입니다.");
  const cnMixedPunctuation = fixture("未蓝奖・全国数字文创大赛（2026・5S）作品征集公告", "2026年11月10日");
  assert.equal(isForeignLanguageOpportunity(cnMixedPunctuation), false);
  const listingDeadline = { ...fixture("Full details &rarr; Project Open Call: Made of Fife Made of Fife: A Call for Material Makers, Researchers and Practitioners Closing date: 12 Oct 2026", "来源页面未提供更详细摘要。"), deadline: "2026-10-12T23:59:00.000Z" };
  assert.equal(
    createTranslatedOpportunityV2Translation(listingDeadline, { title_zh: "Made of Fife：面向材料制造者、研究人员和实践者的征集", summary_zh: "来源页面未提供更详细摘要。" }).status,
    "translated",
  );
  const properBrand = fixture("CraftForms 2026", "来源页面未提供更详细摘要。");
  assert.equal(createTranslatedOpportunityV2Translation(properBrand, { title_zh: "CraftForms 2026", summary_zh: properBrand.summary }).status, "translated");
  const fee = fixture("Off Center 2027 - An International Ceramics Competition Application fee: $35", "来源页面未提供更详细摘要。");
  assert.equal(createTranslatedOpportunityV2Translation(fee, { title_zh: "Off Center 2027 国际陶瓷竞赛", summary_zh: "申请费：35美元。" }).status, "translated");
  for (const item of [loewe, craftforms, homo, jp, ko]) {
    assert.equal(createTranslatedOpportunityV2Translation(item, { title_zh: `中文 ${item.title.slice(-4)}`, summary_zh: `中文摘要 ${item.summary}` }).status, "translated");
  }
  assert.ok(validateOpportunityV2Translation(loewe, loewe.title, "中文摘要 €100,000").includes("translated title is unchanged"));
  assert.ok(validateOpportunityV2Translation(loewe, "洛伊威基金会工艺奖 2027", "The original English application remains in this long residual sentence for review").includes("long non-proper English residue"));
  assert.equal(configuredTranslationProviders({}).status, "CREDENTIAL_NOT_CONFIGURED");
  assert.equal(configuredTranslationProviders({}).providers.length, 0);

  const placeholderProvider = createLlmTranslationProvider("deepseek", {
    chat: async () => ({ content: "{}", parsed: { title_zh: "Maker支持", summary_zh: "" } }),
  });
  const placeholderResult = await placeholderProvider.translate({ title: "Maker support", summary: "来源页面未提供更详细摘要。", targetLanguage: "zh-CN" });
  assert.equal(placeholderResult.summary_zh, "来源页面未提供更详细摘要。");
  const currencyProvider = createLlmTranslationProvider("deepseek", {
    chat: async () => ({ content: "{}", parsed: { title_zh: "Off Center 2027 国际陶瓷竞赛", summary_zh: "来源页面未提供更详细摘要。" } }),
  });
  const currencyResult = await currencyProvider.translate({ title: "Off Center 2027 - Application fee: $35", summary: "来源页面未提供更详细摘要。", targetLanguage: "zh-CN" });
  assert.match(currencyResult.summary_zh, /\$35/);

  let calls = 0;
  const azure = createAzureTranslator({ key: "test-key", region: "eastasia", endpoint: "https://azure.test", fetchImpl: async (_url, init) => { calls += 1; assert.equal(init?.method, "POST"); return response([{ translations: [{ text: "洛伊威基金会工艺奖 2027" }] }, { translations: [{ text: "提交原创作品，奖金 €100,000。" }] }]); } });
  const google = createGoogleTranslator({ key: "test-key", endpoint: "https://google.test", fetchImpl: async () => response({ data: { translations: [{ translatedText: "洛伊威基金会工艺奖 2027" }, { translatedText: "提交原创作品，奖金 €100,000。" }] } }) });
  const libre = createLibreTranslate({ url: "https://libre.test", fetchImpl: async () => response({ translatedText: "洛伊威基金会工艺奖 2027 ---CHANCEPING-SUMMARY--- 提交原创作品，奖金 €100,000。" }) });
  const providers: OpportunityTranslationProvider[] = [azure, google, libre];
  const chain = await translateWithProviderChain(loewe, providers);
  assert.equal(chain.translation.status, "translated");
  assert.equal(chain.provider_id, "azure");
  assert.equal(calls, 1);
  assert.ok(chain.characters_sent_to_free_provider > 0);
  console.log(JSON.stringify({ fixtures: 9, provider_chain: "PASS", no_credentials: "CREDENTIAL_NOT_CONFIGURED", one_request_for_title_summary: "PASS", placeholder_summary_fallback: "PASS", currency_fact_preserved: "PASS" }, null, 2));
}

void main();
