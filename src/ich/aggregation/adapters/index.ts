import { parseGenericListing, enrichGenericItem } from "./generic-listing";
import { parseRssItems } from "./rss";
import { parseShejijingsaiListing } from "./shejijingsai";
import type { ParsedAggregationItem } from "./common";

export interface AggregationAdapter {
  adapter_id: string;
  source_id: string;
  parseListing(html: string, listingUrl: string): ParsedAggregationItem[];
  enrichItem?: (item: ParsedAggregationItem, detailHtml: string, detailUrl: string) => ParsedAggregationItem;
}

export const AGGREGATION_ADAPTERS: AggregationAdapter[] = [
  { adapter_id: "shejijingsai-list-v1", source_id: "shejijingsai-list", parseListing: parseShejijingsaiListing },
  { adapter_id: "contest-watchers-rss-v1", source_id: "contest-watchers-open", parseListing: parseRssItems },
  {
    adapter_id: "crafts-council-opportunities-v1", source_id: "crafts-council-opportunities",
    parseListing: (html, url) => parseGenericListing(html, url, [/craftscouncil\.org\.uk/i]), enrichItem: enrichGenericItem,
  },
  {
    adapter_id: "artconnect-opportunities-v1", source_id: "artconnect-opportunities",
    parseListing: (html, url) => parseGenericListing(html, url, [/artconnect\.com\/opportunities\//i]), enrichItem: enrichGenericItem,
  },
  {
    adapter_id: "competitions-archi-v1", source_id: "competitions-archi",
    parseListing: (html, url) => parseGenericListing(html, url, [/competitions\.archi/i]), enrichItem: enrichGenericItem,
  },
];

export function getAggregationAdapter(sourceId: string): AggregationAdapter {
  const adapter = AGGREGATION_ADAPTERS.find((item) => item.source_id === sourceId);
  if (!adapter) throw new Error(`Unknown aggregation adapter: ${sourceId}`);
  return adapter;
}
