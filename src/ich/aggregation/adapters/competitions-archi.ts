import { enrichGenericItem, parseGenericListing } from "./generic-listing";

export const COMPETITIONS_ARCHI = "https://competitions.archi/";
export const parseCompetitionsArchiListing = (html: string, url: string) => parseGenericListing(html, url, [/competitions\.archi/i]);
export const enrichCompetitionsArchiItem = enrichGenericItem;
