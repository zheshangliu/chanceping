import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadBusinessOpportunities } from "./opportunity";
import { loadSourceRegistry } from "./data-pipeline";

export interface BusinessReleaseManifest {
  schemaVersion: "business-release-manifest.v1";
  generatedAt: string;
  gitCommit: string;
  data: { opportunitiesSha256: string; sourceRegistrySha256: string; total: number; current: number; historical: number };
  governance: { editions: string[]; requiredOfficialUrl: true; publicSourceRoles: string[] };
}

function sha256(file: string): string { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function commit(): string { try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "unknown"; } }

export function buildBusinessReleaseManifest(root = process.cwd()): BusinessReleaseManifest {
  const opportunitiesPath = path.join(root, "src/business/opportunities.recorded.json");
  const registryPath = path.join(root, "src/business/data/source-registry.v1.json");
  const opportunities = loadBusinessOpportunities(opportunitiesPath);
  return {
    schemaVersion: "business-release-manifest.v1",
    generatedAt: new Date().toISOString(),
    gitCommit: commit(),
    data: { opportunitiesSha256: sha256(opportunitiesPath), sourceRegistrySha256: sha256(registryPath), total: opportunities.length, current: opportunities.filter((item) => item.status !== "historical").length, historical: opportunities.filter((item) => item.status === "historical").length },
    governance: { editions: ["guangzhou", "tianhe", "shaoguan"], requiredOfficialUrl: true, publicSourceRoles: ["official_fact"] },
  };
}
