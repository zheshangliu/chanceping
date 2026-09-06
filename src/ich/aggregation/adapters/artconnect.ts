import { enrichGenericItem, parseGenericListing } from "./generic-listing";

export const ARTCONNECT_OPPORTUNITIES = "https://www.artconnect.com/opportunities";
export const parseArtConnectListing = (html: string, url: string) => parseGenericListing(html, url, [/artconnect\.com\/opportunities\//i]);
export const enrichArtConnectItem = enrichGenericItem;
