import { runIchProductionCycleAudit } from "../src/opportunity-v2/production-cycle";

async function main(): Promise<void> {
  const audit = await runIchProductionCycleAudit();
  console.log(JSON.stringify(audit, null, 2));
  if (audit.status !== "PASS") process.exitCode = 1;
}

main().catch(() => {
  // Audit output is useful; raw exception messages may include local paths.
  console.error("ICH V1.5 quality audit failed; check runtime file availability and permissions.");
  process.exitCode = 1;
});
