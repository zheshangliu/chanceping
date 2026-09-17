import { TranslationProviderError, type OpportunityTranslationProvider, type OpportunityTranslationResult } from "../translation-provider";

interface GoogleConfig { key: string; endpoint: string; fetchImpl?: typeof fetch; }

export function createGoogleTranslator(config: GoogleConfig): OpportunityTranslationProvider {
  return {
    id: "google",
    free: true,
    async translate(input): Promise<OpportunityTranslationResult> {
      const fetchImpl = config.fetchImpl ?? fetch;
      const url = `${config.endpoint.replace(/\/+$/u, "")}/language/translate/v2?key=${encodeURIComponent(config.key)}`;
      const response = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: [input.title, input.summary], target: "zh-CN", format: "text" }) });
      if (!response.ok) throw new TranslationProviderError("PROVIDER_UNAVAILABLE", `google HTTP ${response.status}`);
      const value = await response.json() as { data?: { translations?: Array<{ translatedText?: string }> } };
      const values = value.data?.translations ?? [];
      const title_zh = String(values[0]?.translatedText ?? "").trim();
      const summary_zh = String(values[1]?.translatedText ?? "").trim();
      if (!title_zh || !summary_zh) throw new TranslationProviderError("PROVIDER_UNAVAILABLE", "google returned empty translation");
      return { title_zh, summary_zh };
    },
  };
}
