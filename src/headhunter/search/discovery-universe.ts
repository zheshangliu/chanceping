import type { TargetCompany } from "./target-universe";

export function buildDiscoveryQueries(companies: TargetCompany[]): string[] {
  return companies.flatMap((company) => [`${company.name} official announcement`, `${company.name} hiring`, `${company.name} HR recruiter`]);
}
