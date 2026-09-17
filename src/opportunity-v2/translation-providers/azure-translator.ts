import { TranslationProviderError, type OpportunityTranslationProvider, type OpportunityTranslationResult } from "../translation-provider";

interface AzureConfig { key: string; region: string; endpoint: string; fetchImpl?: typeof fetch; }

export function createAzureTranslator(config: AzureConfig): OpportunityTranslationProvider {
  return {
    id: "azure",
    free: true,
    async translate(input): Promise<OpportunityTranslationResult> {
      const fetchImpl = config.fetchImpl ?? fetch;
      const endpoint = `${config.endpoint.replace(/\/+$/u, "")}/translate?api-version=3.0&to=zh-Hans`;
      const response = await fetchImpl(endpoint, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": config.key, "Ocp-Apim-Subscription-Region": config.region, "Content-Type": "application/json" }, body: JSON.stringify([{ Text: input.title }, { Text: input.summary }]) });
      if (!response.ok) throw new TranslationProviderError("PROVIDER_UNAVAILABLE", `azure HTTP ${response.status}`);
      const value = await response.json() as Array<{ translations?: Array<{ text?: string }> }>;
      const title_zh = String(value[0]?.translations?.[0]?.text ?? "").trim();
      const summary_zh = String(value[1]?.translations?.[0]?.text ?? "").trim();
      if (!title_zh || !summary_zh) throw new TranslationProviderError("PROVIDER_UNAVAILABLE", "azure returned empty translation");
      return { title_zh, summary_zh };
    },
  };
}
