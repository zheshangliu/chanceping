import fs from "node:fs";
import path from "node:path";
import { collectWelfareSource, WELFARE_SHADOW_SOURCES } from "../src/public/welfare-opportunities";

const requested = new Set([
  "OFF-N-003", "OFF-N-005", "OFF-N-007", "OFF-N-009", "OFF-N-010", "OFF-N-011",
  "OFF-GD-003", "OFF-GZ-002", "OFF-GZ-003", "OFF-DG-001", "OFF-ZS-001", "OFF-HZ-001",
  "ORG-003", "ORG-004", "ORG-005", "OFF-N-008", "OFF-GD-001", "OFF-FS-001", "OFF-ZH-001", "OFF-GD-002",
]);

async function main(): Promise<void> {
  const selected = process.env.WELFARE_ADAPTER_REVIEW_CODES?.split(",").map((item) => item.trim()).filter(Boolean);
  const sources = WELFARE_SHADOW_SOURCES.filter((item) => requested.has(item.code) && (!selected?.length || selected.includes(item.code)));
  const results = await Promise.all(sources.map(async (source) => {
    try {
      const result = await collectWelfareSource(source.code, { persist: false, evidenceDir: `data/welfare-adapter-review/${source.code}`, maxDetails: 3 });
      return { sourceCode: source.code, adapter: source.adapter, status: result.status, discoveredCount: result.discoveredCount, publishedCount: result.publishedCount, errors: result.errors.length, errorMessages: result.errors.slice(0, 2).map((item) => item.error) };
    } catch (error) {
      return { sourceCode: source.code, adapter: source.adapter, status: "failed", discoveredCount: 0, publishedCount: 0, errors: 1, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  const summary = { reviewedAt: new Date().toISOString(), results };
  const outputPath = process.env.WELFARE_ADAPTER_REVIEW_SUMMARY_PATH ?? "data/welfare-adapter-review-summary.json";
  fs.mkdirSync(path.dirname(path.resolve(process.cwd(), outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(process.cwd(), outputPath), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
