import { enrichGenericItem, parseGenericListing } from "./generic-listing";

export const CRAFTS_COUNCIL_OPPORTUNITIES = "https://www.craftscouncil.org.uk/sector-support/opportunities";
export const parseCraftsCouncilListing = (html: string, url: string) => parseGenericListing(html, url, [/craftscouncil\.org\.uk/i]);
export const enrichCraftsCouncilItem = enrichGenericItem;
