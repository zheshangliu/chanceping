import fs from "node:fs";
import path from "node:path";

export type ProcurementSourceStatus = "LIVE_OK" | "LIVE_OK_ZERO_MATCH" | "FIXTURE_OK_LIVE_KEY_MISSING" | "BLOCKED_AUTH_SCOPE" | "BLOCKED_PUBLIC_ENDPOINT" | "BLOCKED_TERMS_OR_ACCESS" | "PARSER_FAIL" | "HTTP_FAIL" | "DISABLED_PENDING_REVIEW";

export interface ProcurementSourceRegistryEntry {
  source_id: string;
  name: string;
  region: "CN" | "GLOBAL";
  priority: "P0" | "P1";
  source_role: "issuer" | "aggregator" | "discovery";
  access_method: "api" | "rss" | "bulk" | "web" | "aggregator";
  official_url: string;
  api_auth: string;
  api_rate_limit: string;
  commercial_reuse: string;
  license: string;
  canonical_source: string;
  official_backlink: boolean;
  buyer_coverage: string;
  supplier_coverage: string;
  award_data_available: boolean;
  budget_available: boolean | null;
  deadline_available: boolean | null;
  attachment_available: boolean | null;
  update_frequency: string;
  adapter_id: string;
  status: ProcurementSourceStatus;
  blocker?: string;
}

export interface ProcurementSourceRegistryFile {
  schema_version: string;
  not_production_seed: true;
  observed_at: string | null;
  sources: ProcurementSourceRegistryEntry[];
}

export const PHASE1_PROCUREMENT_SOURCE_IDS = [
  "proc-cn-ccgp",
  "proc-cn-cib",
  "proc-cn-ggzy",
  "proc-global-ocp",
  "proc-eu-ted",
  "proc-us-sam",
  "proc-kr-koneps",
  "proc-un-ungm",
  "proc-wb",
] as const;

export function readProcurementSourceRegistry(filePath = "config/procurement/phase1-source-registry.json"): ProcurementSourceRegistryFile {
  const file = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(file, "utf8")) as ProcurementSourceRegistryFile;
}

export function validateProcurementSourceRegistry(registry: ProcurementSourceRegistryFile): string[] {
  const errors: string[] = [];
  if (registry.not_production_seed !== true) errors.push("phase1 registry must not be a production seed");
  const ids = registry.sources.map((source) => source.source_id);
  if (new Set(ids).size !== ids.length) errors.push("phase1 registry source ids must be unique");
  for (const id of PHASE1_PROCUREMENT_SOURCE_IDS) {
    const row = registry.sources.find((source) => source.source_id === id);
    if (!row) errors.push(`missing phase1 source ${id}`);
    else if (!/^https?:\/\//u.test(row.official_url)) errors.push(`${id} official_url is not http(s)`);
  }
  return errors;
}
