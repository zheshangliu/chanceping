import { collectWelfareSource, WELFARE_SHADOW_SOURCES } from "../src/public/welfare-opportunities";

const requested = new Set([
  "OFF-N-003", "OFF-N-005", "OFF-N-007", "OFF-N-009", "OFF-N-010", "OFF-N-011",
  "OFF-GD-003", "OFF-GZ-002", "OFF-GZ-003", "OFF-DG-001", "OFF-ZS-001", "OFF-HZ-001",
  "ORG-003", "ORG-004", "ORG-005", "OFF-N-008", "OFF-GD-001", "OFF-FS-001", "OFF-ZH-001", "OFF-GD-002",
]);

async function main(): Promise<void> {
  const results = [];
  for (const source of WELFARE_SHADOW_SOURCES.filter((item) => requested.has(item.code))) {
    const result = await collectWelfareSource(source.code, { persist: false, evidenceDir: `data/welfare-adapter-review/${source.code}`, maxDetails: 12 });
    results.push({ sourceCode: source.code, adapter: source.adapter, status: result.status, discoveredCount: result.discoveredCount, publishedCount: result.publishedCount, errors: result.errors.length });
  }
  console.log(JSON.stringify({ reviewedAt: new Date().toISOString(), results }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
