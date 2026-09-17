import crypto from "node:crypto";
import type { IchCandidateSample } from "./source-adapters-v1";

export const ICH_DS2_DISCOVERY_SCHEMA = "ich-ds2-readonly-discovery.v1" as const;

export type IchDs2SourceRunStatus = "completed" | "partial" | "failed";

export interface IchDs2SourceRun {
  source_id: string;
  adapter_id: string;
  discovery_url: string;
  access_mode: "listing" | "search" | "rss" | "sitemap" | "manual";
  started_at: string;
  finished_at: string;
  status: IchDs2SourceRunStatus;
  http_status: number | null;
  final_url: string | null;
  raw_snapshot_hash: string | null;
  candidate_count: number;
  candidates: IchCandidateSample[];
  errors: string[];
}

export interface IchDs2ReadonlyDiscoveryRun {
  schema_version: typeof ICH_DS2_DISCOVERY_SCHEMA;
  run_id: string;
  started_at: string;
  finished_at: string;
  readonly: true;
  formal_store_write: false;
  formal_store_path: string;
  formal_store_before_sha256: string;
  source_count: number;
  candidate_count: number;
  source_runs: IchDs2SourceRun[];
  gate: "pass" | "pass_with_followups" | "failed";
}

export function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
