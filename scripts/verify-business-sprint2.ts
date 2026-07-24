import { createApp } from "../src/api/app";
import { loadBusinessOpportunities, lifecycleStatus } from "../src/business/opportunity";

let failures = 0;
function check(name: string, condition: boolean): void { console.log(`${condition ? "PASS" : "FAIL"} ${name}`); if (!condition) failures += 1; }

async function main(): Promise<void> {
  const records = loadBusinessOpportunities();
  check("recorded Business data exists", records.length > 0);
  check("recorded Business data uses official https sources", records.every((item) => item.officialUrl.startsWith("https://") && !item.officialUrl.includes("example.")));
  check("recorded Business data has verified state", records.every((item) => item.verificationStatus !== "pending_verification"));
  check("expired recorded opportunity is historical", records.every((item) => lifecycleStatus(item, new Date("2026-07-24T12:00:00+08:00")) === "historical"));
  const app = createApp();
  const list = await app.request("/api/business/opportunities?edition=guangzhou&status=all");
  const listBody = await list.json() as { success?: boolean; data?: { items?: Array<{ slug?: string; lifecycleStatus?: string }> } };
  check("Business list returns verified historical record", list.status === 200 && listBody.success === true && listBody.data?.items?.[0]?.lifecycleStatus === "historical");
  const slug = listBody.data?.items?.[0]?.slug ?? "missing";
  const detail = await app.request(`/api/business/opportunities/${slug}?edition=guangzhou`);
  const detailBody = await detail.json() as { success?: boolean; data?: { officialUrl?: string; verificationStatus?: string; risks?: string[] } };
  check("Business detail returns official source and decision fields", Boolean(detail.status === 200 && detailBody.success === true && detailBody.data?.officialUrl?.startsWith("https://") && detailBody.data?.verificationStatus === "status_verified" && (detailBody.data.risks?.length ?? 0) > 0));
  const current = await app.request("/api/business/opportunities?edition=guangzhou&status=current");
  const currentBody = await current.json() as { data?: { total?: number } };
  check("current filter does not relabel expired record as active", current.status === 200 && currentBody.data?.total === 0);
  if (failures > 0) process.exitCode = 1;
}
main();
