import fs from "fs";
import path from "path";
import { compareIchOpportunities } from "../src/ich/dedup";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { IchOpportunityStore } from "../src/ich/store";
import {
  ICH_PRIMARY_CATEGORIES,
  type IchOpportunity,
  type IchOpportunityFile,
  type IchPrimaryCategory,
} from "../src/ich/types";
import { validateIchOpportunity, validateIchOpportunityFile } from "../src/ich/validation";

interface Options {
  input: string;
  base: string;
  output: string;
  batch: string;
  now: Date;
  write: boolean;
  incremental: boolean;
}

interface ImportSummary {
  batch: string;
  mode: "dry-run" | "write";
  input: number;
  accepted: number;
  added: number;
  updated: number;
  duplicates: number;
  invalid: number;
  current: number;
  historical: number;
  level12Ratio: number;
  regionGroups: string[];
  categories: Record<IchPrimaryCategory, number>;
  errors: string[];
}

const CURRENT_STATUSES = new Set(["active", "closing_soon", "long_term"]);
const INCREMENTAL_SOURCE_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
const MINIMUMS: Record<IchPrimaryCategory, number> = {
  competition: 5,
  exhibition_market: 5,
  procurement_project: 5,
  channel_collaboration: 3,
  policy_funding: 3,
  international: 3,
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseOptions(): Options {
  const input = path.resolve(argument("--input") ?? "src/ich/opportunities.stage5-candidates.json");
  const base = path.resolve(argument("--base") ?? "data/ich-opportunities.json");
  const output = path.resolve(argument("--output") ?? "data/ich-opportunities.json");
  const batch = argument("--batch") ?? `ich-stage5-${new Date().toISOString().slice(0, 10)}`;
  const nowRaw = argument("--now") ?? new Date().toISOString();
  const now = new Date(nowRaw);
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowRaw}`);
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(batch)) throw new Error("Invalid --batch value");
  return {
    input,
    base,
    output,
    batch,
    now,
    write: process.argv.includes("--write"),
    incremental: process.argv.includes("--incremental"),
  };
}

function readFile(filePath: string): IchOpportunityFile {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const result = validateIchOpportunityFile(parsed);
  if (!result.valid || !result.value) throw new Error(`${filePath}: ${result.errors.join("; ")}`);
  return result.value;
}

function main(): void {
  const options = parseOptions();
  if (!fs.existsSync(options.input)) throw new Error(`Candidate file not found: ${options.input}`);
  if (!fs.existsSync(options.base)) throw new Error(`Verified seed file not found: ${options.base}`);
  const candidateFile = readFile(options.input);
  const baseFile = readFile(options.base);
  const existingStore = new IchOpportunityStore(options.output);
  const existing = fs.existsSync(options.output) ? existingStore.list() : [];
  const merged = [...baseFile.entries];
  for (const entry of existing) {
    const sameIndex = merged.findIndex((seed) => seed.id === entry.id || seed.slug === entry.slug);
    if (sameIndex >= 0) merged[sameIndex] = entry;
    else merged.push(entry);
  }
  const errors: string[] = [];
  let invalid = 0;
  let duplicates = 0;
  let added = 0;
  let updated = 0;

  for (const [index, raw] of candidateFile.entries.entries()) {
    const candidate = structuredClone(raw) as IchOpportunity;
    candidate.status = computeIchOpportunityStatus(candidate, options.now);
    candidate.metadata.source_import_batch = options.batch;
    if (options.incremental) {
      const primarySource = candidate.sources.find((source) => source.is_primary);
      const checkedAt = primarySource ? new Date(primarySource.last_checked_at) : null;
      const sourceAge = checkedAt && !Number.isNaN(checkedAt.getTime())
        ? options.now.getTime() - checkedAt.getTime()
        : Number.POSITIVE_INFINITY;
      const incrementalErrors: string[] = [];
      if (!CURRENT_STATUSES.has(candidate.status)) incrementalErrors.push(`status=${candidate.status}, required=current`);
      if (!primarySource) incrementalErrors.push("primary source is required");
      else {
        if (primarySource.level !== "L1" && primarySource.level !== "L2") {
          incrementalErrors.push(`primary source level=${primarySource.level}, required=L1/L2`);
        }
        if (!primarySource.is_accessible) incrementalErrors.push("primary source must be accessible");
        if (sourceAge < -24 * 60 * 60 * 1000 || sourceAge > INCREMENTAL_SOURCE_MAX_AGE_MS) {
          incrementalErrors.push("primary source must have been checked within the last 4 days");
        }
      }
      if (candidate.verification.verification_status !== "verified") {
        incrementalErrors.push(`verification=${candidate.verification.verification_status}, required=verified`);
      }
      if (incrementalErrors.length > 0) {
        invalid += 1;
        errors.push(`candidate[${index}] ${candidate.slug || "(no slug)"}: ${incrementalErrors.join("; ")}`);
        continue;
      }
    }
    const validation = validateIchOpportunity(candidate);
    if (!validation.valid) {
      invalid += 1;
      errors.push(`candidate[${index}] ${candidate.slug || "(no slug)"}: ${validation.errors.join("; ")}`);
      continue;
    }
    const sameIndex = merged.findIndex((entry) => entry.id === candidate.id || entry.slug === candidate.slug);
    if (sameIndex >= 0) {
      const existingEntry = merged[sameIndex]!;
      if (existingEntry.workflow.state === "withdrawn" || existingEntry.workflow.state === "archived") continue;
      merged[sameIndex] = candidate;
      updated += 1;
      continue;
    }
    const duplicate = merged
      .map((entry) => ({ entry, result: compareIchOpportunities(entry, candidate) }))
      .find(({ result }) => result.decision === "duplicate");
    if (duplicate) {
      duplicates += 1;
      errors.push(`${candidate.slug}: duplicate of ${duplicate.entry.slug} (${duplicate.result.reason})`);
      continue;
    }
    merged.push(candidate);
    added += 1;
  }

  const publicEntries = merged.filter((entry) => entry.is_published && entry.workflow.state === "published");
  const current = publicEntries.filter((entry) => CURRENT_STATUSES.has(computeIchOpportunityStatus(entry, options.now)));
  const historical = publicEntries.length - current.length;
  const categories = Object.fromEntries(ICH_PRIMARY_CATEGORIES.map((category) => [
    category,
    current.filter((entry) => entry.primary_category === category).length,
  ])) as Record<IchPrimaryCategory, number>;
  const level12 = current.filter((entry) => {
    const level = entry.sources.find((source) => source.is_primary)?.level;
    return level === "L1" || level === "L2";
  }).length;
  const level12Ratio = current.length === 0 ? 0 : level12 / current.length;

  if (options.write) {
    if (invalid > 0 || duplicates > 0) errors.push("write blocked: invalid or duplicate candidates remain");
    if (options.incremental) {
      if (candidateFile.entries.length === 0) errors.push("write blocked: incremental input is empty");
    } else {
      if (current.length < 30) errors.push(`write blocked: current=${current.length}, required>=30`);
      if (historical < 5) errors.push(`write blocked: historical=${historical}, required>=5`);
      for (const category of ICH_PRIMARY_CATEGORIES) {
        if (categories[category] < MINIMUMS[category]) {
          errors.push(`write blocked: ${category}=${categories[category]}, required>=${MINIMUMS[category]}`);
        }
      }
      if (level12Ratio < 0.8) errors.push(`write blocked: L1/L2 ratio=${level12Ratio.toFixed(3)}, required>=0.800`);
      const regionGroups = [...new Set(current.flatMap((entry) => entry.location.region_groups))];
      if (regionGroups.length < 3) errors.push(`write blocked: region groups=${regionGroups.length}, required>=3`);
    }
    if (errors.length === 0) existingStore.replaceAll(merged, options.now.toISOString());
  }

  const regionGroups = [...new Set(current.flatMap((entry) => entry.location.region_groups))].sort();
  const summary: ImportSummary = {
    batch: options.batch,
    mode: options.write ? "write" : "dry-run",
    input: candidateFile.entries.length,
    accepted: candidateFile.entries.length - invalid - duplicates,
    added,
    updated,
    duplicates,
    invalid,
    current: current.length,
    historical,
    level12Ratio: Number(level12Ratio.toFixed(4)),
    regionGroups,
    categories,
    errors,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (options.write && errors.length > 0) process.exitCode = 1;
}

main();
