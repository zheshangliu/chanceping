import path from "path";

const PRODUCTION_RUNTIME_DIR = "/var/lib/chanceping/ich";
const CHANCEPING_SERVER_ROOT = "/opt/chanceping";

function configuredPath(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? path.resolve(value) : null;
}

export function defaultIchSubmissionRuntimeDir(): string {
  return configuredPath("CHANCEPING_ICH_RUNTIME_DIR") ??
    (isChancePingProductionRuntime()
      ? PRODUCTION_RUNTIME_DIR
      : path.resolve(process.cwd(), "data"));
}

export function isChancePingProductionRuntime(
  cwd = process.cwd(),
  nodeEnv = process.env.NODE_ENV,
): boolean {
  const resolvedCwd = path.resolve(cwd);
  return nodeEnv === "production" ||
    resolvedCwd === CHANCEPING_SERVER_ROOT ||
    resolvedCwd.startsWith(`${CHANCEPING_SERVER_ROOT}${path.sep}`);
}

export function legacyIchSubmissionStorePath(): string {
  return path.resolve(process.cwd(), "data/ich-source-submissions.json");
}

export function defaultIchSubmissionStorePath(): string {
  return configuredPath("CHANCEPING_ICH_SUBMISSION_STORE_PATH") ??
    path.join(defaultIchSubmissionRuntimeDir(), "ich-source-submissions.json");
}

export function defaultIchSubmissionTransactionPath(): string {
  return configuredPath("CHANCEPING_ICH_SUBMISSION_TRANSACTION_PATH") ??
    path.join(defaultIchSubmissionRuntimeDir(), "ich-submission-accept.transaction.json");
}
