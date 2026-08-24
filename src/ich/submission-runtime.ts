import path from "path";

const PRODUCTION_RUNTIME_DIR = "/var/lib/chanceping/ich";

function configuredPath(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? path.resolve(value) : null;
}

export function defaultIchSubmissionRuntimeDir(): string {
  return configuredPath("CHANCEPING_ICH_RUNTIME_DIR") ??
    (process.env.NODE_ENV === "production"
      ? PRODUCTION_RUNTIME_DIR
      : path.resolve(process.cwd(), "data"));
}

export function defaultIchSubmissionStorePath(): string {
  return configuredPath("CHANCEPING_ICH_SUBMISSION_STORE_PATH") ??
    path.join(defaultIchSubmissionRuntimeDir(), "ich-source-submissions.json");
}

export function defaultIchSubmissionTransactionPath(): string {
  return configuredPath("CHANCEPING_ICH_SUBMISSION_TRANSACTION_PATH") ??
    path.join(defaultIchSubmissionRuntimeDir(), "ich-submission-accept.transaction.json");
}
