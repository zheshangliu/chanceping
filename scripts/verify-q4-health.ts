import { readFileSync } from "fs";
import { loadLocalApiEnv } from "../src/config/local-env";
import { isLocalLiveSearchEnabled } from "../src/config/local-live-search";
import { resolveLiveLlmProfile, toLiveLlmPublicProfile } from "../src/config/live-llm-profile";
import { QwenAdapter } from "../src/agents/qwen-adapter";

let passed = 0;
let failed = 0;

function sanitize(message: unknown): string {
  let text = message instanceof Error ? message.message : String(message ?? "");
  for (const keyName of [
    "SERPER_API_KEY",
    "COMMERCIAL_LLM_API_KEY",
    "DEEPSEEK_API_KEY",
    "CONTEST_LLM_API_KEY",
    "DASHSCOPE_API_KEY",
  ]) {
    const value = process.env[keyName];
    if (value) text = text.split(value).join("[redacted]");
  }
  return text;
}

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` -> ${sanitize(detail)}` : ""}`);
  }
}

async function main(): Promise<void> {
  const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as { scripts?: Record<string, string> };
  check("Q4 health is opt-in and not part of verify:all", !String(packageJson.scripts?.["verify:all"] ?? "").includes("verify:q4:health"));

  const localEnv = loadLocalApiEnv({ enabled: true });
  check("api.env loaded explicitly for Q4", localEnv.loaded, localEnv.reason);

  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH = "true";
  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_LLM = "true";
  process.env.CHANCEPING_LLM_PROFILE = "contest";
  process.env.LLM_MODE = "live";
  process.env.DATA_MODE = "mock";

  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  check("SERPER_API_KEY exists without printing value", Boolean(process.env.SERPER_API_KEY));
  check("local live search switch is enabled", isLocalLiveSearchEnabled());

  let publicProfile = "";
  try {
    const profile = resolveLiveLlmProfile();
    const publicInfo = toLiveLlmPublicProfile(profile);
    publicProfile = `${publicInfo.profile}/${publicInfo.provider}/${publicInfo.model}`;
    check("contest live LLM profile resolves", publicInfo.profile === "contest" && publicInfo.provider === "qwen", publicProfile);

    const adapter = new QwenAdapter({
      apiKey: profile.apiKey,
      model: profile.model,
      baseUrl: profile.baseUrl,
      mockMode: false,
      maxTokens: 32,
    });
    const llmResponse = await adapter.chat({
      messages: [
        { role: "system", content: "You are a health check. Reply with ok only." },
        { role: "user", content: "Reply ok." },
      ],
      response_format: "text",
      temperature: 0,
    });
    check("Qwen minimal live call succeeds", llmResponse.content.trim().length > 0 && !/sk-|API_KEY|Bearer/i.test(llmResponse.content), llmResponse.content.slice(0, 80));
  } catch (err) {
    check("Qwen minimal live call succeeds", false, sanitize(err));
  }

  const { providerRegistry } = await import("../src/search/provider-registry");
  const serper = providerRegistry.get("serper");
  check("Serper provider is registered", Boolean(serper));
  if (serper) {
    try {
      const healthy = await serper.healthCheck();
      check("Serper health check succeeds", healthy);
      const results = await serper.search("WTT ITTF table tennis tournament registration", { max_results: 1 });
      check("Serper minimal live query succeeds", Array.isArray(results) && results.length >= 0);
      check("Serper minimal query returns real provider data shape", results.every((item) => item.source_provider === "serper" && /^https?:\/\//.test(item.url)), JSON.stringify(results.slice(0, 1)));
    } catch (err) {
      check("Serper minimal live query succeeds", false, sanitize(err));
    }
  }

  if (oldNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = oldNodeEnv;
  }

  console.log(`Q4 health gate: ${passed} PASS / ${failed} FAIL${publicProfile ? ` (${publicProfile})` : ""}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`Q4 health gate failed -> ${sanitize(err)}`);
  process.exit(1);
});
