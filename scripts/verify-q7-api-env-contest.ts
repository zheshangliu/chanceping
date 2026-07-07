import { execFileSync, spawnSync } from "node:child_process";
import { loadLocalApiEnv } from "../src/config/local-env";
import {
  LiveLlmProfileError,
  resolveLiveLlmProfile,
  toLiveLlmPublicProfile,
} from "../src/config/live-llm-profile";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function gitLsFiles(path: string): string {
  try {
    return execFileSync("git", ["ls-files", path], { encoding: "utf8" });
  } catch {
    return "";
  }
}

function sanitize(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/(API_KEY|TOKEN|SECRET|PASSWORD)=\S+/gi, "$1=[redacted]");
}

const ignored = spawnSync("git", ["check-ignore", "-q", "api.env"], {
  cwd: process.cwd(),
  stdio: "ignore",
});
check("api.env is git-ignored", ignored.status === 0);
check("api.env is not tracked", gitLsFiles("api.env").trim() === "");

const env: Record<string, string | undefined> = {};
const loaded = loadLocalApiEnv({ env, enabled: true });
check("api.env loads for local contest readiness", loaded.loaded === true, `reason=${loaded.reason}`);
const loadedText = JSON.stringify(loaded);
const secretValues = [env.CONTEST_LLM_API_KEY, env.DASHSCOPE_API_KEY, env.SERPER_API_KEY]
  .filter((value): value is string => Boolean(value));
check("api.env loader reports key names only", secretValues.every((value) => !loadedText.includes(value)));

check("local api.env selects contest profile", env.CHANCEPING_LLM_PROFILE === "contest", env.CHANCEPING_LLM_PROFILE ?? "missing");
check("local api.env contest provider is qwen", env.CONTEST_LLM_PROVIDER === "qwen", env.CONTEST_LLM_PROVIDER ?? "missing");
check("local api.env contest model is configured", Boolean(env.CONTEST_LLM_MODEL));
check("local api.env contest base URL is configured", Boolean(env.CONTEST_LLM_BASE_URL));
check("local api.env contest key is present without printing value", Boolean(env.CONTEST_LLM_API_KEY || env.DASHSCOPE_API_KEY));
check("local live LLM is explicitly enabled for localhost", env.CHANCEPING_ENABLE_LOCAL_LIVE_LLM === "true", env.CHANCEPING_ENABLE_LOCAL_LIVE_LLM ?? "missing");

try {
  const profile = resolveLiveLlmProfile({ env, nodeEnv: "development" });
  const publicProfile = toLiveLlmPublicProfile(profile);
  const publicText = `${publicProfile.profile}/${publicProfile.provider}/${publicProfile.model}`;
  check("local live LLM resolves to Qwen contest profile", publicProfile.profile === "contest" && publicProfile.provider === "qwen", publicText);
  check("public profile does not expose contest key", !publicText.includes(profile.apiKey), publicText);
} catch (error) {
  check("local live LLM resolves to Qwen contest profile", false, sanitize(error));
}

try {
  resolveLiveLlmProfile({ env, nodeEnv: "production" });
  check("production still rejects live LLM by default", false, "resolver unexpectedly succeeded");
} catch (error) {
  check(
    "production still rejects live LLM by default",
    error instanceof LiveLlmProfileError && error.code === "LIVE_LLM_PRODUCTION_DISABLED",
    sanitize(error),
  );
}

console.log(`Q7 api.env contest readiness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
