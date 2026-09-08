import { TranslationProviderError, type OpportunityTranslationProvider, type OpportunityTranslationResult } from "../translation-provider";

interface LibreConfig { url: string; apiKey?: string; fetchImpl?: typeof fetch; }

export function createLibreTranslate(config: LibreConfig): OpportunityTranslationProvider {
  return {
    id: "libretranslate",
    free: true,
    async translate(input): Promise<OpportunityTranslationResult> {
      const fetchImpl = config.fetchImpl ?? fetch;
      const body = { q: `${input.title}\n\n---CHANCEPING-SUMMARY---\n\n${input.summary}`, source: "auto", target: "zh", format: "text", ...(config.apiKey ? { api_key: config.apiKey } : {}) };
      const response = await fetchImpl(config.url.replace(/\/+$/u, "/translate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new TranslationProviderError("PROVIDER_UNAVAILABLE", `libretranslate HTTP ${response.status}`);
      const value = await response.json() as { translatedText?: string };
      const combined = String(value.translatedText ?? "");
      const split = combined.split(/\s*---CHANCEPING-SUMMARY---\s*/u);
      const title_zh = split[0]?.trim() ?? "";
      const summary_zh = split.slice(1).join(" ---CHANCEPING-SUMMARY--- ").trim();
      if (!title_zh || !summary_zh) throw new TranslationProviderError("PROVIDER_UNAVAILABLE", "libretranslate returned an unsplittable translation");
      return { title_zh, summary_zh };
    },
  };
}
