import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import type { IchOpportunityFile } from "../src/ich/types";

const filePath = path.resolve(process.argv[2] ?? "src/ich/opportunities.verified.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as IchOpportunityFile;
const now = new Date(process.env.ICH_AUDIT_NOW ?? new Date().toISOString());
const currentStatuses = new Set(["active", "closing_soon", "long_term"]);
const published = data.entries.filter((entry) => entry.is_published && entry.workflow.state === "published");
const current = published.filter((entry) => currentStatuses.has(computeIchOpportunityStatus(entry, now)) && entry.sources.some((source) => source.is_accessible === true) && entry.verification.source_conflict !== true);
const categories = ["competition", "exhibition_market", "procurement_project", "channel_collaboration", "policy_funding", "international"] as const;
const minimums = { competition: 18, exhibition_market: 14, procurement_project: 14, channel_collaboration: 10, policy_funding: 10, international: 14 };
const byCategory = Object.fromEntries(categories.map((category) => [category, current.filter((entry) => entry.primary_category === category).length]));
const levels = Object.fromEntries(["L1", "L2", "L3"].map((level) => [level, current.filter((entry) => entry.sources.some((source) => source.level === level)).length]));
const report = { file: filePath, audited_at: now.toISOString(), published_total: published.length, current_total: current.length, target: 80, gap_to_target: Math.max(0, 80 - current.length), categories: byCategory, category_gaps: Object.fromEntries(categories.map((category) => [category, Math.max(0, minimums[category] - (byCategory[category] ?? 0))])), source_levels: levels, source_level_gaps: { l1_to_48: Math.max(0, 48 - (levels.L1 ?? 0)), l1_l2_to_68: Math.max(0, 68 - (levels.L1 ?? 0) - (levels.L2 ?? 0)), l3_over_12: Math.max(0, (levels.L3 ?? 0) - 12) } };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
