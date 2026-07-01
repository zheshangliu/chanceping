import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface LoadLocalApiEnvOptions {
  cwd?: string;
  envFile?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  enabled?: boolean;
  nodeEnv?: string;
  override?: boolean;
  allowInProduction?: boolean;
}

export interface LoadLocalApiEnvResult {
  loaded: boolean;
  reason: "loaded" | "disabled" | "missing" | "production_disabled";
  path: string;
  keysLoaded: string[];
  keysSkippedExisting: string[];
  invalidLines: number;
}

interface EnvEntry {
  key: string;
  value: string;
}

function parseEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseLocalEnv(content: string): { entries: EnvEntry[]; invalidLines: number } {
  const entries: EnvEntry[] = [];
  let invalidLines = 0;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) {
      invalidLines++;
      continue;
    }
    entries.push({ key: match[1], value: parseEnvValue(match[2]) });
  }
  return { entries, invalidLines };
}

export function loadLocalApiEnv(options: LoadLocalApiEnvOptions = {}): LoadLocalApiEnvResult {
  const targetEnv = options.env ?? process.env;
  const enabled = options.enabled ?? targetEnv.CHANCEPING_LOAD_API_ENV === "true";
  const cwd = options.cwd ?? process.cwd();
  const envFile = options.envFile ?? "api.env";
  const envPath = resolve(cwd, envFile);
  const baseResult = {
    path: envPath,
    keysLoaded: [] as string[],
    keysSkippedExisting: [] as string[],
    invalidLines: 0,
  };

  if (!enabled) {
    return { ...baseResult, loaded: false, reason: "disabled" };
  }

  const nodeEnv = options.nodeEnv ?? targetEnv.NODE_ENV ?? process.env.NODE_ENV ?? "";
  if (nodeEnv === "production" && options.allowInProduction !== true) {
    return { ...baseResult, loaded: false, reason: "production_disabled" };
  }

  if (!existsSync(envPath)) {
    return { ...baseResult, loaded: false, reason: "missing" };
  }

  const parsed = parseLocalEnv(readFileSync(envPath, "utf-8"));
  const result: LoadLocalApiEnvResult = {
    ...baseResult,
    loaded: true,
    reason: "loaded",
    invalidLines: parsed.invalidLines,
  };

  for (const entry of parsed.entries) {
    if (!options.override && targetEnv[entry.key] !== undefined) {
      result.keysSkippedExisting.push(entry.key);
      continue;
    }
    targetEnv[entry.key] = entry.value;
    result.keysLoaded.push(entry.key);
  }

  return result;
}
