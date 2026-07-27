import fs from "node:fs";
import path from "node:path";
import {
  collectAllWelfareSources,
  loadPersistedWelfareOpportunities,
  renderWelfareMarkdown,
} from "../src/public/welfare-opportunities";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const limit = Math.max(1, Math.min(Number(argValue("--limit") ?? 12), 30));
  const sourceCodes = argValue("--codes")?.split(",").map((item) => item.trim()).filter(Boolean);
  const summary = await collectAllWelfareSources({ maxDetails: limit, sourceCodes });
  const reportsDir = path.resolve(process.cwd(), "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, "welfare-opportunities-latest.md");
  fs.writeFileSync(reportPath, renderWelfareMarkdown(loadPersistedWelfareOpportunities()));
  console.log(JSON.stringify({ ...summary, reportPath }, null, 2));
}

main().catch((error) => {
  console.error("[Welfare Update Pipeline] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
