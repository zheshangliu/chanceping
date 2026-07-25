import { collectWelfareSourceForReview, loadPersistedWelfareOpportunities, mergeWelfareRecords, savePersistedWelfareOpportunities } from "../src/public/welfare-opportunities";

const codes = (process.env.WELFARE_REVIEW_IMPORT_CODES ?? "OFF-SZ-006,OFF-SZ-009,OFF-SZ-010,OFF-ZS-002,OFF-DG-002,OFF-GZ-004,WEL-002").split(",").map((v) => v.trim()).filter(Boolean);

async function main(): Promise<void> {
  const imported = [];
  for (const code of codes) {
    const result = await collectWelfareSourceForReview(code, { maxDetails: 30, evidenceDir: `data/welfare-adapter-review/${code}` });
    const accepted = result.records.filter((record) => record.evidenceFields.some((field) => field.state === "verified"));
    imported.push(...accepted);
    console.log(JSON.stringify({ sourceCode: code, status: result.result.status, discovered: result.result.discoveredCount, accepted: accepted.length, filtered: result.result.discoveredCount - accepted.length }));
  }
  const before = loadPersistedWelfareOpportunities();
  const after = mergeWelfareRecords(before, imported);
  savePersistedWelfareOpportunities(after);
  console.log(JSON.stringify({ imported: imported.length, added: after.length - before.length, total: after.length }));
}

main().catch((error) => { console.error(error); process.exit(1); });
