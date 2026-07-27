import fs from "node:fs";
import path from "node:path";
import { queryIchOpportunities, type IchQuery } from "../src/ich/query";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { ICH_PRIMARY_CATEGORIES, type IchOpportunityFile } from "../src/ich/types";

const file = JSON.parse(fs.readFileSync(path.resolve("data/ich-opportunities.json"), "utf8")) as IchOpportunityFile;
const now = new Date("2026-07-27T00:00:00+08:00");
const errors: string[] = [];
const run = (patch: Partial<IchQuery>) => queryIchOpportunities(file.entries, { q: "", category: "all", region: "all", status: "current", sort: "default", page: 1, page_size: 60, ...patch }, now, file.updated_at);

const guangzhou = run({ region: "guangzhou" });
if (guangzhou.items.some((item) => item.location.city !== "广州" || !item.location.region_groups.includes("guangzhou"))) errors.push("Guangzhou filter returned non-Guangzhou item");
const overseas = run({ region: "overseas" });
if (overseas.items.some((item) => item.location.country_code === "CN" || !item.location.region_groups.includes("overseas"))) errors.push("overseas filter returned domestic item");
for (const category of ICH_PRIMARY_CATEGORIES) {
  const result = run({ category });
  if (result.items.some((item) => item.primary_category !== category)) errors.push(`${category} filter returned another category`);
}
for (const status of ["closing_soon", "long_term"] as const) {
  const result = run({ status });
  if (result.items.some((item) => computeIchOpportunityStatus(file.entries.find((entry) => entry.slug === item.slug)!, now) !== status)) errors.push(`${status} filter returned another status`);
}
const first = run({ page: 1, page_size: 8 });
const second = run({ page: 2, page_size: 8 });
if (first.items.length && second.items.length && first.items[0]?.slug === second.items[0]?.slug) errors.push("pagination did not advance");
console.log(JSON.stringify({ guangzhou: guangzhou.total, overseas: overseas.total, categories: Object.fromEntries(ICH_PRIMARY_CATEGORIES.map((category) => [category, run({ category }).total])), closing_soon: run({ status: "closing_soon" }).total, long_term: run({ status: "long_term" }).total, page_2: second.page, errors }, null, 2));
if (errors.length) process.exitCode = 1;
