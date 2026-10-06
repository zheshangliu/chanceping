import { filterOpportunityV2Radar, opportunityV2LiveStatus } from "./radar-view";
import { isRealCompetitionMemoItem } from "./memo";
import { buildWeeklyOpportunityActions } from "./procurement-workbench";
import type { OpportunityV2, OpportunityV2Source } from "./types";

export type OpportunityV2TranslationSurface =
  | "main"
  | "overseas"
  | "procurement"
  | "comprehensive"
  | "memo"
  | "weekly"
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

  const currentFor = (items: OpportunityV2[]) => items.filter((item) => opportunityV2LiveStatus(item, now) === "CURRENT");
  const allBrowse = filterOpportunityV2Radar(opportunities, sources, { now, status: "browse", include_irrelevant: true });
  const main = filterOpportunityV2Radar(opportunities, sources, { now, status: "browse" });
  const overseas = filterOpportunityV2Radar(opportunities, sources, { now, status: "browse", region: "GLOBAL", include_irrelevant: true });
  const procurement = filterOpportunityV2Radar(opportunities, sources, { now, status: "browse", category: "procurement_project", include_irrelevant: true });
  // Expiring/current public actions get first access to the bounded translation
  // budget. Unknown-deadline browse records remain visible, but follow them.
  add(currentFor(main), "main", 0);
  add(main.filter((item) => opportunityV2LiveStatus(item, now) !== "CURRENT"), "main", 1);
  add(currentFor(overseas), "overseas", 0);
  add(overseas.filter((item) => opportunityV2LiveStatus(item, now) !== "CURRENT"), "overseas", 1);
  add(currentFor(procurement), "procurement", 0);
  add(procurement.filter((item) => opportunityV2LiveStatus(item, now) !== "CURRENT"), "procurement", 1);
  add(allBrowse, "comprehensive", 2);
  const memo = allBrowse.filter((item) => isRealCompetitionMemoItem(item));
  add(currentFor(memo), "memo", 0);
  add(memo.filter((item) => opportunityV2LiveStatus(item, now) !== "CURRENT"), "memo", 1);
  // Weekly actions are selected from current/long-term competitions and
  // current/early coverage/procurement. Mark those candidates P0 before the
  // queue applies its cap so they cannot be starved by historical rows.
  const weeklyIds = new Set(buildWeeklyOpportunityActions({ opportunities, sources, now })
    .flatMap((action) => [action.opportunity_id, ...action.alias_ids]));
  for (const id of weeklyIds) {
    const target = byId.get(id);
    if (target) {
      if (!target.surfaces.includes("weekly")) target.surfaces.push("weekly");
      target.priority = 0;
    }
  }
  // Details and exports are rendered from the same item projection. Marking
  // them here prevents a route-specific title from falling outside coverage.
  add(allBrowse, "detail", 2);
  add(allBrowse, "export", 2);

  return [...byId.values()].sort((a, b) => a.priority - b.priority || a.item.id.localeCompare(b.item.id));
}
