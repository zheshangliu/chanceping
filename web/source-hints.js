(function () {
  "use strict";

  function ensureSourceStrategy(spec) {
    const next = JSON.parse(JSON.stringify(spec || {}));
    next.source_strategy = {
      official_sites: [],
      platforms: [],
      search_engines: [],
      social_media: [],
      rss_sources: [],
      manual_sources: [],
      source_priority: [],
      sources_used_in_report: [],
      user_supplied_sources: [],
      source_transparency_enabled: true,
      ...(next.source_strategy || {}),
    };
    return next;
  }

  function parseSourceHintLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (/^https?:\/\//i.test(line)) {
          let sourceName = line;
          try {
            sourceName = new URL(line).hostname.replace(/^www\./, "");
          } catch {
            sourceName = line;
          }
          return { type: "url", sourceName, sourceUrl: line };
        }
        return { type: "name", sourceName: line, sourceUrl: "" };
      });
  }

  function applySourceHintsToSpec(spec, text) {
    const next = ensureSourceStrategy(spec);
    const parsed = parseSourceHintLines(text);
    const now = new Date().toISOString();
    const existingUrls = new Set((next.source_strategy.user_supplied_sources || []).map((item) => item.source_url));
    const existingNames = new Set(next.source_strategy.manual_sources || []);

    for (const item of parsed) {
      if (item.type === "url" && !existingUrls.has(item.sourceUrl)) {
        next.source_strategy.user_supplied_sources.push({
          source_name: item.sourceName,
          source_url: item.sourceUrl,
          added_at: now,
          contributed_by: "user",
        });
        existingUrls.add(item.sourceUrl);
      }
      if (item.type === "name" && !existingNames.has(item.sourceName)) {
        next.source_strategy.manual_sources.push(item.sourceName);
        existingNames.add(item.sourceName);
      }
    }

    next.source_strategy.source_priority = Array.from(new Set([
      ...(next.source_strategy.source_priority || []),
      ...next.source_strategy.user_supplied_sources.map((item) => item.source_name),
      ...next.source_strategy.manual_sources,
    ]));
    return next;
  }

  window.ChancePingSourceHints = {
    parseSourceHintLines,
    applySourceHintsToSpec,
  };
  window.applySourceHintsToSpec = applySourceHintsToSpec;
})();
