import { parseContestWatchersFeed } from "./contest-watchers";
import { parseCraftsCouncilListing, enrichCraftsCouncilItem } from "./crafts-council";
import { parseArtConnectListing, enrichArtConnectItem } from "./artconnect";
import { parseCompetitionsArchiListing, enrichCompetitionsArchiItem } from "./competitions-archi";
import { parseShejijingsaiListing } from "./shejijingsai";
import { parseChuangsaiyunListing } from "./chuangsaiyun";
import { parseLoeweCraftPrize } from "./loewe";
import type { ParsedAggregationItem } from "./common";
import { parseCnyisaiListing, parse1zjListing, parseChuangyisaiListing, parseZjmtListing } from "./round2-domestic";
import { parseCuratorSpaceListing, enrichCuratorSpaceItem } from "./curatorspace";

export interface AggregationAdapter {
  adapter_id: string;
  source_id: string;
  parseListing(html: string, listingUrl: string): ParsedAggregationItem[];
  enrichItem?: (item: ParsedAggregationItem, detailHtml: string, detailUrl: string) => ParsedAggregationItem;
}

export const AGGREGATION_ADAPTERS: AggregationAdapter[] = [
  { adapter_id: "shejijingsai-list-v1", source_id: "shejijingsai-list", parseListing: parseShejijingsaiListing },
  { adapter_id: "chuangsaiyun-competition-list-v1", source_id: "chuangsaiyun-competition-list", parseListing: parseChuangsaiyunListing },
  { adapter_id: "contest-watchers-rss-v1", source_id: "contest-watchers-open", parseListing: parseContestWatchersFeed },
  {
    adapter_id: "crafts-council-opportunities-v1", source_id: "crafts-council-opportunities",
    parseListing: parseCraftsCouncilListing, enrichItem: enrichCraftsCouncilItem,
  },
  {
    adapter_id: "artconnect-opportunities-v1", source_id: "artconnect-opportunities",
    parseListing: parseArtConnectListing, enrichItem: enrichArtConnectItem,
  },
  {
    adapter_id: "competitions-archi-v2", source_id: "competitions-archi",
    parseListing: parseCompetitionsArchiListing, enrichItem: enrichCompetitionsArchiItem,
  },
  { adapter_id: "loewe-craft-prize-v1", source_id: "loewe-craft-prize", parseListing: parseLoeweCraftPrize },
  { adapter_id: "cnyisai-competition-v1", source_id: "cnyisai-competition", parseListing: parseCnyisaiListing },
  { adapter_id: "1zj-cultural-competition-v1", source_id: "1zj-cultural-competition", parseListing: parse1zjListing },
  { adapter_id: "chuangyisai-cultural-v1", source_id: "chuangyisai-cultural", parseListing: parseChuangyisaiListing },
  { adapter_id: "zjmtcn-product-competition-v1", source_id: "zjmtcn-product-competition", parseListing: parseZjmtListing },
  { adapter_id: "curatorspace-opportunities-v1", source_id: "curatorspace-opportunities", parseListing: parseCuratorSpaceListing, enrichItem: enrichCuratorSpaceItem },
];

export function getAggregationAdapter(sourceId: string): AggregationAdapter {
  const adapter = AGGREGATION_ADAPTERS.find((item) => item.source_id === sourceId);
  if (!adapter) throw new Error(`Unknown aggregation adapter: ${sourceId}`);
  return adapter;
}
