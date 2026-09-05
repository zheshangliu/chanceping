import registry from "./source-registry.v2.json";
import { ICH_PRIMARY_CATEGORIES, type IchPrimaryCategory } from "./types";

export const ICH_SOURCE_REGISTRY_V2_SCHEMA = "2.0" as const;
export const ICH_SOURCE_REGISTRY_V2_STATUSES = ["planned", "discovery_only", "adapter_ready", "disabled"] as const;
export const ICH_SOURCE_REGISTRY_V2_ROLES = ["primary", "secondary", "discovery"] as const;
export const ICH_SOURCE_REGISTRY_V2_SOURCE_ROLES = ["opportunity_source", "information_source", "discovery_source"] as const;
export const ICH_SOURCE_REGISTRY_V2_ACCESS_MODES = ["listing", "search", "rss", "sitemap", "manual"] as const;

export type IchSourceRegistryV2Status = typeof ICH_SOURCE_REGISTRY_V2_STATUSES[number];
export type IchSourceRegistryV2Role = typeof ICH_SOURCE_REGISTRY_V2_ROLES[number];
export type IchSourceRegistryV2SourceRole = typeof ICH_SOURCE_REGISTRY_V2_SOURCE_ROLES[number];
export type IchSourceRegistryV2AccessMode = typeof ICH_SOURCE_REGISTRY_V2_ACCESS_MODES[number];

export interface IchSourceRegistryV2Entry {
  id: string;
  name: string;
  canonical_url: string;
  family: string;
  role: IchSourceRegistryV2Role;
  source_role: IchSourceRegistryV2SourceRole;
  evidence_level: "L1" | "L2" | "L3";
  geography: string[];
  categories: IchPrimaryCategory[];
  query_packs: string[];
  access_mode: IchSourceRegistryV2AccessMode;
  scan_frequency: "daily" | "every_3_days" | "weekly";
  recheck_frequency: "daily_near_deadline" | "every_3_days" | "weekly";
  operational_status: IchSourceRegistryV2Status;
  url_verification: "registered" | "endpoint_pending" | "blocked";
  last_health_check: string | null;
  eligibility_note?: string;
}

export interface IchSourceQueryPack {
  id: string;
  language: "zh-CN" | "en";
  purpose: string;
  terms: string[];
  negative_terms: string[];
  categories: IchPrimaryCategory[];
}

export interface IchSourceRegistryV2File {
  schema_version: typeof ICH_SOURCE_REGISTRY_V2_SCHEMA;
  updated_at: string;
  purpose: string;
  default_policy: {
    discovery_only_until_adapter_passes: boolean;
    primary_detail_page_required_for_formal_publish: boolean;
    homepage_only_is_lead: boolean;
    unconfirmed_fields_must_remain_unknown: boolean;
    semantic_integrity_check_required: boolean;
  };
  query_packs: IchSourceQueryPack[];
  sources: IchSourceRegistryV2Entry[];
}

export function getIchSourceRegistryV2(): IchSourceRegistryV2File {
  return registry as IchSourceRegistryV2File;
}

export function listIchSourceRegistryV2(): IchSourceRegistryV2Entry[] {
  return [...getIchSourceRegistryV2().sources];
}

export function listIchSourceRegistryV2ByCategory(category: IchPrimaryCategory): IchSourceRegistryV2Entry[] {
  return listIchSourceRegistryV2().filter((source) => source.categories.includes(category));
}

export function listIchSourceRegistryV2ByGeography(geography: string): IchSourceRegistryV2Entry[] {
  return listIchSourceRegistryV2().filter((source) => source.geography.includes(geography));
}

export function validateIchSourceRegistryV2(value: IchSourceRegistryV2File): string[] {
  const errors: string[] = [];
  if (value.schema_version !== ICH_SOURCE_REGISTRY_V2_SCHEMA) errors.push("unsupported schema_version");
  if (!value.default_policy.discovery_only_until_adapter_passes) errors.push("discovery-only policy must be enabled");
  if (!value.default_policy.primary_detail_page_required_for_formal_publish) errors.push("primary detail page policy must be enabled");
  if (!value.default_policy.semantic_integrity_check_required) errors.push("semantic integrity policy must be enabled");
  if (new Set(value.sources.map((source) => source.id)).size !== value.sources.length) errors.push("source ids must be unique");
  if (new Set(value.query_packs.map((pack) => pack.id)).size !== value.query_packs.length) errors.push("query pack ids must be unique");
  const queryPackIds = new Set(value.query_packs.map((pack) => pack.id));
  for (const source of value.sources) {
    if (!/^https:\/\//.test(source.canonical_url)) errors.push(`${source.id}: canonical_url must use https`);
    if (!ICH_SOURCE_REGISTRY_V2_SOURCE_ROLES.includes(source.source_role)) errors.push(`${source.id}: invalid source_role`);
    if (!source.categories.every((category) => ICH_PRIMARY_CATEGORIES.includes(category))) errors.push(`${source.id}: invalid category`);
    if (!source.query_packs.every((id) => queryPackIds.has(id))) errors.push(`${source.id}: unknown query pack`);
    if (source.role === "discovery" && source.evidence_level !== "L3") errors.push(`${source.id}: discovery role must be L3`);
    if (source.role === "discovery" && source.source_role !== "discovery_source") errors.push(`${source.id}: discovery role must use discovery_source`);
    if (source.source_role === "discovery_source" && source.role !== "discovery") errors.push(`${source.id}: discovery_source must use registry discovery role`);
    if (source.url_verification === "blocked" && source.operational_status !== "disabled") errors.push(`${source.id}: blocked source must be disabled`);
  }
  for (const category of ICH_PRIMARY_CATEGORIES) {
    if (!value.sources.some((source) => source.categories.includes(category))) errors.push(`no source covers ${category}`);
  }
  return errors;
}
