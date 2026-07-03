import { readFile, writeFile } from "node:fs/promises";
import {
  buildGolden8Report,
  buildPostQ5ManualQualityAudit,
  buildRandom10Report,
  runGolden8Diagnostics,
  runRandom10Validation,
  writeReport,
} from "./q5-r-validation.mjs";
import { buildGoldenReport } from "./golden-20-browser-baseline.mjs";

const command = process.argv[2];
const baseUrl = process.env.Q5_R_BASE_URL || "http://127.0.0.1:3310";

async function loadResults(file) {
  const parsed = JSON.parse(await readFile(file, "utf-8"));
  return Array.isArray(parsed) ? parsed : parsed.results ?? [];
}

async function saveJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  console.log(file);
}

if (command === "golden8-diagnostics") {
  const diagnostics = await runGolden8Diagnostics(baseUrl);
  await saveJson("data/q5-r-golden8-diagnostics.json", { generatedAt: new Date().toISOString(), diagnostics });
} else if (command === "golden8-report") {
  const browserResults = await loadResults("data/q5-r-golden8-browser-results.json");
  const diagnosticFile = JSON.parse(await readFile("data/q5-r-golden8-diagnostics.json", "utf-8"));
  await writeReport("Golden_8_Q5_Live_Regression_Report.md", buildGolden8Report(browserResults, diagnosticFile.diagnostics ?? []));
} else if (command === "random10") {
  const results = await runRandom10Validation(baseUrl);
  await saveJson("data/q5-r-random10-results.json", { generatedAt: new Date().toISOString(), results });
  await writeReport("Random_10_Q5_Generalization_Report.md", buildRandom10Report(results));
} else if (command === "golden20-report") {
  const results = await loadResults("data/q5-r-golden20-browser-results.json");
  const automated = buildGoldenReport(results, { title: "Golden 20 Post-Q.5 Rerun Report", expectedTotal: 20 })
    .replace("- 当前结论：达到进入 Milestone N/O 的门槛。", "- 自动化结论：主链路达到门槛；是否进入 N/O 以第 10 节人工行动价值复核为准。")
    .replace("- 建议进入 Milestone N/O，同时把 Q 中部分通过问题列为 N/O 的 UX 与错误态收口项。", "- 暂不根据自动化结果直接进入 N/O；以第 10 节人工行动价值复核为准。")
    .replace("- 可以准备阿里云测试站，但 live LLM/live search 仍应默认关闭，仅给测试环境显式开关。", "- 暂不根据自动化结果上阿里云；以第 10 节人工行动价值复核为准。");
  const report = `${automated}\n\n${buildPostQ5ManualQualityAudit(results)}`;
  await writeReport("Golden_20_Post_Q5_Rerun_Report.md", report);
} else {
  console.error("Usage: node scripts/run-q5-r-api-validation.mjs <golden8-diagnostics|golden8-report|random10|golden20-report>");
  process.exit(1);
}
