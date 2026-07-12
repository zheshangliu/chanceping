import {
  isLiveSearchExplicitlyEnabled,
  resolveSearchDataMode,
} from "../src/config/local-live-search";
import {
  LiveLlmProfileError,
  resolveLiveLlmProfile,
} from "../src/config/live-llm-profile";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const disabled = { NODE_ENV: "production" };
check("production search remains disabled by default", !isLiveSearchExplicitlyEnabled(disabled, "production"));
check(
  "production live request is rejected without switch",
  resolveSearchDataMode({ requestedMode: "live", fallbackMode: "mock", env: disabled, nodeEnv: "production" }).error?.code === "LIVE_SEARCH_DISABLED",
);

const enabledSearch = { NODE_ENV: "production", CHANCEPING_ENABLE_PRODUCTION_LIVE_SEARCH: "true" };
check("production search requires explicit switch", isLiveSearchExplicitlyEnabled(enabledSearch, "production"));
check(
  "production live request resolves when explicit switch is set",
  resolveSearchDataMode({ requestedMode: "live", fallbackMode: "mock", env: enabledSearch, nodeEnv: "production" }).dataMode === "live",
);

try {
  resolveLiveLlmProfile({
    env: {
      NODE_ENV: "production",
      CHANCEPING_LLM_PROFILE: "contest",
      CONTEST_LLM_PROVIDER: "qwen",
      CONTEST_LLM_MODEL: "qwen3.7-plus",
      CONTEST_LLM_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      CONTEST_LLM_API_KEY: "redacted-test-key",
    },
    nodeEnv: "production",
  });
  check("production Qwen is disabled without explicit switch", false);
} catch (error) {
  check("production Qwen is disabled without explicit switch", error instanceof LiveLlmProfileError && error.code === "LIVE_LLM_PRODUCTION_DISABLED");
}

try {
  const profile = resolveLiveLlmProfile({
    env: {
      NODE_ENV: "production",
      CHANCEPING_ENABLE_PRODUCTION_LIVE_LLM: "true",
      CHANCEPING_LLM_PROFILE: "contest",
      CONTEST_LLM_PROVIDER: "qwen",
      CONTEST_LLM_MODEL: "qwen3.7-plus",
      CONTEST_LLM_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      CONTEST_LLM_API_KEY: "redacted-test-key",
    },
    nodeEnv: "production",
  });
  check("production Qwen resolves with explicit switch", profile.provider === "qwen" && profile.model === "qwen3.7-plus");
} catch (error) {
  check("production Qwen resolves with explicit switch", false, error instanceof Error ? error.message : String(error));
}

console.log(`production live capability verification: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);
