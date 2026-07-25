import fs from "node:fs";
import path from "node:path";
import type { IchOpportunityFile } from "../src/ich/types";

const current = JSON.parse(fs.readFileSync(path.resolve("data/ich/release-candidate.json"), "utf8")) as IchOpportunityFile;
const historical = JSON.parse(fs.readFileSync(path.resolve("data/ich/non-current-leads.json"), "utf8")) as IchOpportunityFile;
const errors: string[] = [];
if (historical.entries.some((entry) => entry.status !== "ended" || !entry.is_published)) errors.push("historical leads must be published with status ended");
if (historical.entries.some((entry) => entry.dates.deadline_at && entry.dates.deadline_at >= "2026-07-25")) errors.push("historical lead has a non-past deadline");
const urls = [...current.entries, ...historical.entries].map((entry) => entry.sources[0]?.url).filter(Boolean) as string[];
if (new Set(urls).size !== urls.length) errors.push("current and historical sets share duplicate primary URLs");
const total = current.entries.length + historical.entries.length;
if (total < 80) errors.push(`total ${total} < 80`);
console.log(JSON.stringify({ current: current.entries.length, historical: historical.entries.length, total, errors }, null, 2));
if (errors.length) process.exitCode = 1;
