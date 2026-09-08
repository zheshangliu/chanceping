import { loadLocalApiEnv } from "../src/config/local-env";
import { resolveLiveLlmProfile, type LiveLlmApiProfile } from "../src/config/live-llm-profile";
import { DeepSeekAdapter } from "../src/agents/deepseek-adapter";
import { QwenAdapter } from "../src/agents/qwen-adapter";
import type { LLMAdapter } from "../src/agents/llm-adapter";
import {
  buildOpportunityV2Display,
  createFailedOpportunityV2Translation,
  createOpportunityV2Translation,
  createTranslatedOpportunityV2Translation,
  filterOpportunityV2Radar,
  isForeignLanguageOpportunity,
  opportunityV2SourceHash,
  readOpportunityV2Pool,
  readOpportunityV2Sources,
  readOpportunityV2Translations,
  writeOpportunityV2Translations,
  OPPORTUNITY_V2_DISPLAY_STRATEGY,
  type OpportunityV2,
  type OpportunityV2Translation,
} from "../src/opportunity-v2";

function makeAdapter(): { adapter: LLMAdapter | null; config_error: string | null; provider: string | null } {
  const env = { ...process.env, CHANCEPING_ENABLE_LOCAL_LIVE_LLM: "true", CHANCEPING_LLM_PROFILE: process.env.CHANCEPING_LLM_PROFILE || "contest" };
  loadLocalApiEnv({ enabled: true, env });
  try {
    const profile = resolveLiveLlmProfile({ env }) as LiveLlmApiProfile;
    if (profile.provider === "qwen") return { adapter: new QwenAdapter({ apiKey: profile.apiKey, model: profile.model, baseUrl: profile.baseUrl, mockMode: false, maxTokens: 500 }), config_error: null, provider: `${profile.provider}:${profile.model}` };
    return { adapter: new DeepSeekAdapter({ apiKey: profile.apiKey, model: profile.model, baseUrl: profile.baseUrl, mockMode: false, maxTokens: 500 }), config_error: null, provider: `${profile.provider}:${profile.model}` };
  } catch (error) {
    return { adapter: null, config_error: error instanceof Error ? error.message : String(error), provider: null };
  }
}

function promptFor(item: OpportunityV2): { system: string; user: string } {
  return {
    system: "你是严格的中文赛事信息编辑。只根据给定来源原文，将标题和摘要翻译成简体中文。标题只保留赛事/征集名称，不要加入来源导航、Full details、Closing date或整张卡片内容。摘要只保留原文明确支持的主题、征集内容、提交形式、金额、年份和限制条件。保留专有名词、年份、金额、币种和否定条件；没有原文支持的信息不要补写。只返回JSON：{\"title_zh\":\"...\",\"summary_zh\":\"...\"}。",
    user: `来源：${item.source_name}\n原始标题：${item.title}\n原始摘要：${item.summary}`,
  };
}

async function translateOne(item: OpportunityV2, adapter: LLMAdapter | null, now: Date): Promise<OpportunityV2Translation> {
  if (!adapter) return createOpportunityV2Translation(item, now);
  try {
    const prompt = promptFor(item);
    const response = await adapter.chat({ response_format: "json", temperature: 0, messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }] });
    const parsed = response.parsed && typeof response.parsed === "object" ? response.parsed as Record<string, unknown> : {};
    return createTranslatedOpportunityV2Translation(item, { title_zh: String(parsed.title_zh ?? ""), summary_zh: String(parsed.summary_zh ?? "") }, now);
  } catch (error) {
    return createFailedOpportunityV2Translation(item, error, now);
  }
}

async function mapWithConcurrency(items: OpportunityV2[], workerCount: number, worker: (item: OpportunityV2) => Promise<OpportunityV2Translation>): Promise<OpportunityV2Translation[]> {
  const result: OpportunityV2Translation[] = [];
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workerCount, items.length || 1) }, () => run()));
  return result;
}

async function main(): Promise<void> {
  const now = new Date();
  const pool = readOpportunityV2Pool();
  const sources = readOpportunityV2Sources();
  const current = new Set(filterOpportunityV2Radar(pool.opportunities, sources, { now }).map((item) => item.id));
  const candidates = pool.opportunities.filter(isForeignLanguageOpportunity);
  const currentCandidates = candidates.filter((item) => current.has(item.id));
  const previous = new Map(readOpportunityV2Translations().map((entry) => [entry.opportunity_id, entry]));
  const { adapter, config_error, provider } = makeAdapter();
  let reused = 0;
  const pendingWork: OpportunityV2[] = [];
  const cached: OpportunityV2Translation[] = [];
  for (const item of candidates) {
    const existing = previous.get(item.id);
    if (existing?.source_hash === opportunityV2SourceHash(item) && existing.strategy_version === OPPORTUNITY_V2_DISPLAY_STRATEGY && existing.status === "translated" && existing.title_zh && existing.summary_zh) {
      cached.push(existing);
      reused += 1;
    } else pendingWork.push(item);
  }
  const processed = await mapWithConcurrency(pendingWork, 3, (item) => translateOne(item, adapter, now));
  const translations = [...cached, ...processed].sort((a, b) => a.opportunity_id.localeCompare(b.opportunity_id));
  writeOpportunityV2Translations(translations);
  const currentStatus = currentCandidates.map((item) => translations.find((entry) => entry.opportunity_id === item.id)?.status ?? "pending");
  const counts = (values: string[]) => values.reduce((out, value) => { out[value] = (out[value] ?? 0) + 1; return out; }, {} as Record<string, number>);
  const currentDisplay = currentCandidates.filter((item) => buildOpportunityV2Display(item, translations).translated).length;
  console.log(JSON.stringify({
    pool: pool.opportunities.length,
    sources: sources.length,
    foreign_records: candidates.length,
    current_foreign_records: currentCandidates.length,
    translated: translations.filter((entry) => entry.status === "translated").length,
    reused,
    pending: translations.filter((entry) => entry.status === "pending").length,
    failed: translations.filter((entry) => entry.status === "failed").length,
    current_status: counts(currentStatus),
    current_with_chinese_display: currentDisplay,
    provider: provider ?? "none",
    config_blocked: config_error ? true : false,
  }, null, 2));
}

void main();
