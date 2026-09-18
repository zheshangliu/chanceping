import { filterOpportunityV2Radar } from "./radar-view";
import { isRealCompetitionMemoItem } from "./memo";
import type { OpportunityV2, OpportunityV2Source } from "./types";

export type OpportunityV2TranslationSurface =
  | "main"
  | "overseas"
  | "procurement"
  | "comprehensive"
  | "memo"
  | "detail"
  | "export";

export interface OpportunityV2VisibleTarget {
  item: OpportunityV2;
  surfaces: OpportunityV2TranslationSurface[];
  priority: number;
}

/**
 * Translation targets are the union of public, non-expired views. UI page
 * size is deliberately not involved: a page is a projection of this set,
 * not the translation dataset.
 */
export function collectOpportunityV2TranslationTargets(
  opportunities: OpportunityV2[],
  sources: OpportunityV2Source[],
  now = new Date(),
): OpportunityV2VisibleTarget[] {
  const byId = new Map<string, OpportunityV2VisibleTarget>();
  const add = (items: OpportunityV2[], surface: OpportunityV2TranslationSurface, priority: number): void => {
    for (const item of items) {
      const current = byId.get(item.id);
      if (current) {
        if (!current.surfaces.includes(surface)) current.surfaces.push(surface);
        current.priority = Math.min(current.priority, priority);
      } else {
        byId.set(item.id, { item, surfaces: [surface], priority });
      }
    }
  };

  const allBrowse = filterOpportunityV2Radar(opportunities, sources, { now, status: "browse", include_irrelevant: true });
  add(filterOpportunityV2Radar(opportunities, sources, { now, status: "browse" }), "main", 0);
  add(filterOpportunityV2Radar(opportunities, sources, { now, status: "browse", region: "GLOBAL", include_irrelevant: true }), "overseas", 0);
  add(filterOpportunityV2Radar(opportunities, sources, { now, status: "browse", category: "procurement_project", include_irrelevant: true }), "procurement", 0);
  add(allBrowse, "comprehensive", 1);
  add(allBrowse.filter((item) => isRealCompetitionMemoItem(item)), "memo", 0);
  // Details and exports are rendered from the same item projection. Marking
  // them here prevents a route-specific title from falling outside coverage.
  add(allBrowse, "detail", 2);
  add(allBrowse, "export", 2);

  return [...byId.values()].sort((a, b) => a.priority - b.priority || a.item.id.localeCompare(b.item.id));
}
