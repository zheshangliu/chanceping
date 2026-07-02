import { readFileSync } from "fs";
import { loadLocalApiEnv } from "../src/config/local-env";
import { isLocalLiveSearchEnabled } from "../src/config/local-live-search";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as { scripts?: Record<string, string> };
  check(
    "verify:live-provider-health is not part of verify:all",
    !String(packageJson.scripts?.["verify:all"] ?? "").includes("verify:live-provider-health"),
  );

  const envResult = loadLocalApiEnv({ enabled: true });
  check("api.env loaded explicitly for provider health", envResult.loaded, envResult.reason);
  check("SERPER_API_KEY exists without printing value", Boolean(process.env.SERPER_API_KEY));

  process.env.CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH = "true";
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  check("local live search switch is enabled for health check", isLocalLiveSearchEnabled());

  const { providerRegistry } = await import("../src/search/provider-registry");
  const provider = providerRegistry.get("serper");
  check("serper provider is registered", Boolean(provider));
  if (provider) {
    const healthy = await provider.healthCheck();
    check("serper health check succeeds", healthy, "provider returned unhealthy; do not run full live Golden 20");
  }

  if (oldNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = oldNodeEnv;
  }

  console.log(`live provider health verification: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`FAIL live provider health script completes -> ${message}`);
  process.exit(1);
});
