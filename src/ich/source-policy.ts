import { getIchSourceRegistryV2, type IchSourceRegistryV2Entry } from "./source-registry-v2";
import { ICH_DS7_SOURCE_WORKFLOWS } from "./source-workflows-v1";

export type IchSourcePolicyDecision = "publishable_primary" | "candidate_secondary" | "discovery_only" | "blocked";

export interface IchSourcePolicyResult {
  sourceId: string | null;
  role: "primary" | "secondary" | "discovery" | "unknown";
  evidenceLevel: "L1" | "L2" | "L3" | null;
  decision: IchSourcePolicyDecision;
  isOfficial: boolean;
  isDetailPage: boolean;
  normalizedUrl: string;
  reasons: string[];
}

export interface IchWorkflowDrift {
  registeredSourceIds: string[];
  workflowSourceIds: string[];
  missingWorkflowSourceIds: string[];
  orphanWorkflowSourceIds: string[];
}

export function normalizeIchSourceUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|spm$|from$|source$)/i.test(key)) url.searchParams.delete(key);
    url.pathname = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim();
  }
}

function registryEntry(sourceId: string | undefined, normalizedUrl: string): IchSourceRegistryV2Entry | undefined {
  const registry = getIchSourceRegistryV2().sources;
  if (sourceId) return registry.find((source) => source.id === sourceId);
  let hostname = "";
  try { hostname = new URL(normalizedUrl).hostname.replace(/^www\./, ""); } catch { return undefined; }
  return registry.find((source) => {
    try { return new URL(source.canonical_url).hostname.replace(/^www\./, "") === hostname; } catch { return false; }
  });
}

/** A listing, home page, or search index is a lead; it is not a formal detail page. */
export function isIchConcreteDetailUrl(url: string, discoveryUrl?: string): boolean {
  const normalized = normalizeIchSourceUrl(url);
  if (!/^https:\/\//i.test(normalized)) return false;
  try {
    const current = new URL(normalized);
    const discovery = discoveryUrl ? new URL(normalizeIchSourceUrl(discoveryUrl)) : undefined;
    if (discovery && current.hostname === discovery.hostname && current.pathname === discovery.pathname) return false;
    if (["/", "/index", "/home", "/news", "/events", "/opportunities", "/sector-support/opportunities"].includes(current.pathname.toLowerCase())) return false;
    return current.pathname.split("/").filter(Boolean).length >= 2 || /(?:post|article|detail|notice|announcement|call|apply|register|competition|prize|residency)/i.test(current.pathname);
  } catch {
    return false;
  }
}

export function evaluateIchSourcePolicy(input: { sourceId?: string; url: string; discoveryUrl?: string }): IchSourcePolicyResult {
  const normalizedUrl = normalizeIchSourceUrl(input.url);
  const entry = registryEntry(input.sourceId, normalizedUrl);
  const reasons: string[] = [];
  if (!/^https:\/\//i.test(normalizedUrl)) reasons.push("formal source URL must use HTTPS");
  if (!entry) reasons.push("source is not registered");
  const role = entry?.role ?? "unknown";
  const evidenceLevel = entry?.evidence_level ?? null;
  const isOfficial = Boolean(entry && role !== "discovery");
  const isDetailPage = isIchConcreteDetailUrl(normalizedUrl, input.discoveryUrl ?? entry?.canonical_url);
  if (!isDetailPage) reasons.push("URL is a discovery/listing page, not a concrete detail page");
  if (entry?.operational_status === "disabled" || entry?.url_verification === "blocked") reasons.push("source is disabled or blocked");
  let decision: IchSourcePolicyDecision = "blocked";
  if (entry && entry.operational_status !== "disabled" && entry.url_verification !== "blocked" && /^https:\/\//i.test(normalizedUrl)) {
    if (role === "discovery") decision = "discovery_only";
    else if (isDetailPage && role === "primary") decision = "publishable_primary";
    else if (isDetailPage && role === "secondary") decision = "candidate_secondary";
    else decision = "discovery_only";
  }
  return { sourceId: entry?.id ?? input.sourceId ?? null, role, evidenceLevel, decision, isOfficial, isDetailPage, normalizedUrl, reasons };
}

export function isFormalIchSourceEligible(result: IchSourcePolicyResult): boolean {
  return result.decision === "publishable_primary" || result.decision === "candidate_secondary";
}

export function findIchWorkflowDrift(): IchWorkflowDrift {
  const registeredSourceIds = getIchSourceRegistryV2().sources.map((source) => source.id);
  const workflowSourceIds = ICH_DS7_SOURCE_WORKFLOWS.map((workflow) => workflow.source_id);
  const workflowSet = new Set(workflowSourceIds);
  const registeredSet = new Set(registeredSourceIds);
  return {
    registeredSourceIds,
    workflowSourceIds,
    missingWorkflowSourceIds: registeredSourceIds.filter((id) => !workflowSet.has(id)),
    orphanWorkflowSourceIds: workflowSourceIds.filter((id) => !registeredSet.has(id)),
  };
}
