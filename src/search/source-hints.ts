import type {
  RadarRequirementSpec,
  SourceStrategy,
  UserSuppliedSource,
} from "../schema/radar-requirement-spec";

export interface SourceHintSearch {
  sourceName: string;
  sourceUrl: string;
  domain: string;
  query: string;
  siteFilter: string;
}

export interface SourceHintCheck {
  sourceName: string;
  sourceUrl: string;
  status: "checked" | "no_results" | "failed" | "invalid_url" | "name_only";
  resultCount: number;
  error?: string;
}

function sourceStrategy(spec: RadarRequirementSpec): SourceStrategy | undefined {
  return spec.source_strategy;
}

export function extractSourceDomain(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function getUserSuppliedUrlSources(spec: RadarRequirementSpec): UserSuppliedSource[] {
  const sources = sourceStrategy(spec)?.user_supplied_sources ?? [];
  return sources.filter((source) => extractSourceDomain(source.source_url) !== "");
}

export function getManualSourceNames(spec: RadarRequirementSpec): string[] {
  return Array.from(
    new Set((sourceStrategy(spec)?.manual_sources ?? []).map((name) => name.trim()).filter(Boolean)),
  );
}

export function buildSourceHintSearches(
  spec: RadarRequirementSpec,
  baseQuery: string,
  maxSources = 5,
): SourceHintSearch[] {
  return getUserSuppliedUrlSources(spec)
    .slice(0, maxSources)
    .map((source) => {
      const domain = extractSourceDomain(source.source_url);
      const sourceName = source.source_name || domain;
      return {
        sourceName,
        sourceUrl: source.source_url,
        domain,
        query: `${baseQuery} ${sourceName}`.trim(),
        siteFilter: domain,
      };
    });
}

export function buildNameOnlySourceChecks(spec: RadarRequirementSpec): SourceHintCheck[] {
  return getManualSourceNames(spec).map((sourceName) => ({
    sourceName,
    sourceUrl: "",
    status: "name_only",
    resultCount: 0,
  }));
}

export function buildMockSourceHintChecks(spec: RadarRequirementSpec, baseQuery: string): SourceHintCheck[] {
  return [
    ...buildNameOnlySourceChecks(spec),
    ...buildSourceHintSearches(spec, baseQuery).map((hint) => ({
      sourceName: hint.sourceName,
      sourceUrl: hint.sourceUrl,
      status: "no_results" as const,
      resultCount: 0,
    })),
  ];
}
