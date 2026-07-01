import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { loadLocalApiEnv } from "../src/config/local-env";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const ignored = spawnSync("git", ["check-ignore", "-q", "api.env"], {
  cwd: process.cwd(),
  stdio: "ignore",
});
check("api.env is git-ignored", ignored.status === 0);

const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as {
  scripts?: Record<string, string>;
};
check(
  "live API verification is not part of verify:all",
  !String(packageJson.scripts?.["verify:all"] ?? "").includes("verify:live-mvp"),
);

const tempDir = mkdtempSync(join(tmpdir(), "chanceping-api-env-"));
try {
  writeFileSync(
    join(tempDir, "api.env"),
    [
      "# dummy test values only",
      "SERPER_API_KEY=test-serper",
      "export DEEPSEEK_API_KEY='test-deepseek'",
      'DASHSCOPE_API_KEY="test dashscope"',
      "EMPTY_VALUE=",
      "BAD LINE",
    ].join("\n"),
  );

  const envA: Record<string, string | undefined> = {};
  const disabled = loadLocalApiEnv({ cwd: tempDir, env: envA, enabled: false });
  check("api.env is not loaded unless explicitly enabled", disabled.loaded === false && envA.SERPER_API_KEY === undefined);

  const envB: Record<string, string | undefined> = { SERPER_API_KEY: "existing-serper" };
  const loaded = loadLocalApiEnv({ cwd: tempDir, env: envB, enabled: true });
  check("explicit local load succeeds", loaded.loaded === true);
  check("loads missing keys", envB.DEEPSEEK_API_KEY === "test-deepseek" && envB.DASHSCOPE_API_KEY === "test dashscope");
  check("does not override existing keys by default", envB.SERPER_API_KEY === "existing-serper");
  check("reports only key names", loaded.keysLoaded.includes("DEEPSEEK_API_KEY") && !JSON.stringify(loaded).includes("test-deepseek"));
  check("invalid lines are counted without failing", loaded.invalidLines === 1, `invalidLines=${loaded.invalidLines}`);

  const envC: Record<string, string | undefined> = {};
  const production = loadLocalApiEnv({ cwd: tempDir, env: envC, enabled: true, nodeEnv: "production" });
  check("production does not load api.env by default", production.loaded === false && production.reason === "production_disabled");

  const missing = loadLocalApiEnv({ cwd: join(tempDir, "missing"), env: {}, enabled: true });
  check("missing api.env is reported safely", missing.loaded === false && missing.reason === "missing");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log(`api.env verification: ${passed} PASS / ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
