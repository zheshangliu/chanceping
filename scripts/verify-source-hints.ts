import {
  buildSourceHintSearches,
  extractSourceDomain,
  getManualSourceNames,
  getUserSuppliedUrlSources,
} from "../src/search/source-hints";
import type { RadarRequirementSpec } from "../src/schema/radar-requirement-spec";

const spec = {
  source_strategy: {
    official_sites: [],
    platforms: [],
    search_engines: [],
    social_media: [],
    rss_sources: [],
    manual_sources: ["中国乒协官网"],
    source_priority: [],
    sources_used_in_report: [],
    user_supplied_sources: [
      {
        source_name: "ITTF",
        source_url: "https://www.ittf.com/",
        added_at: "2026-06-30T00:00:00.000Z",
        contributed_by: "user",
      },
      {
        source_name: "WTT",
        source_url: "https://worldtabletennis.com/",
        added_at: "2026-06-30T00:00:00.000Z",
        contributed_by: "user",
      },
    ],
    source_transparency_enabled: true,
  },
} as unknown as RadarRequirementSpec;

let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

check("extractSourceDomain removes www", extractSourceDomain("https://www.ittf.com/") === "ittf.com");

const urlSources = getUserSuppliedUrlSources(spec);
check("reads url sources", urlSources.length === 2, `len=${urlSources.length}`);

const manualNames = getManualSourceNames(spec);
check("reads manual source names", manualNames.includes("中国乒协官网"));

const searches = buildSourceHintSearches(spec, "乒乓球 比赛 报名");
check("builds one site search per URL source", searches.length === 2, `len=${searches.length}`);
check("sets site filter", searches[0]?.siteFilter === "ittf.com", `site=${searches[0]?.siteFilter}`);
check("keeps base query", searches[0]?.query.includes("乒乓球 比赛 报名") === true);

process.exit(failed > 0 ? 1 : 0);
