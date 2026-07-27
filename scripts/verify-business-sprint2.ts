import { createApp } from "../src/api/app";
import { loadBusinessOpportunities, lifecycleStatus } from "../src/business/opportunity";

let failures = 0;
function check(name: string, condition: boolean): void { console.log(`${condition ? "PASS" : "FAIL"} ${name}`); if (!condition) failures += 1; }

async function main(): Promise<void> {
  const records = loadBusinessOpportunities();
  check("recorded Business data exists", records.length > 0);
  check("recorded Business data uses official https sources", records.every((item) => item.officialUrl.startsWith("https://") && !item.officialUrl.includes("example.")));
  check("recorded Business data has verified state", records.every((item) => item.verificationStatus !== "pending_verification"));
  check("expired recorded opportunity is historical", records.some((item) => item.status === "historical" && lifecycleStatus(item, new Date("2026-07-24T12:00:00+08:00")) === "historical"));
  check("recorded Business data includes at least 100 current verified opportunities", records.filter((item) => lifecycleStatus(item, new Date("2026-07-24T12:00:00+08:00")) !== "historical").length >= 100);
  const app = createApp();
  const list = await app.request("/api/business/opportunities?edition=guangzhou&status=all");
  const listBody = await list.json() as { success?: boolean; data?: { items?: Array<{ slug?: string; lifecycleStatus?: string }>; total?: number; displayedTotal?: number } };
  check("Guangzhou Business list returns verified records", list.status === 200 && listBody.success === true && (listBody.data?.items?.length ?? 0) >= 100);
  check("Business list exposes filtered total separately from diverse display count", list.status === 200 && (listBody.data?.total ?? 0) >= (listBody.data?.displayedTotal ?? 0));
  const slug = listBody.data?.items?.find((item) => item.lifecycleStatus === "current")?.slug ?? "missing";
  const detail = await app.request(`/api/business/opportunities/${slug}?edition=guangzhou`);
  const detailBody = await detail.json() as { success?: boolean; data?: { officialUrl?: string; verificationStatus?: string; risks?: string[] } };
  check("Business detail returns official source and decision fields", Boolean(detail.status === 200 && detailBody.success === true && detailBody.data?.officialUrl?.startsWith("https://") && detailBody.data?.verificationStatus === "fully_verified" && (detailBody.data.risks?.length ?? 0) > 0));
  const current = await app.request("/api/business/opportunities?edition=guangzhou&status=current");
  const currentBody = await current.json() as { data?: { total?: number } };
  check("Guangzhou current filter excludes expired records", current.status === 200 && (currentBody.data?.total ?? 0) >= 100);
  const diverse = await app.request("/api/business/opportunities?edition=guangzhou&status=current&diverse=1");
  const diverseBody = await diverse.json() as { data?: { sourceDiversityApplied?: boolean; items?: Array<{ sourceName: string; category: string }> } };
  const diverseItems = diverseBody.data?.items ?? [];
  const largestShare = diverseItems.length ? Math.max(...Object.values(diverseItems.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.sourceName]: (counts[item.sourceName] ?? 0) + 1 }), {}))) / diverseItems.length : 1;
  check("diverse discovery feed caps a source at 60 percent and retains non-procurement categories", diverse.status === 200 && diverseBody.data?.sourceDiversityApplied === true && largestShare <= 0.6 && diverseItems.some((item) => item.category !== "procurement"));
  const shaoguan = await app.request("/api/business/opportunities?edition=shaoguan&status=current");
  const shaoguanBody = await shaoguan.json() as { data?: { total?: number } };
  check("Shaoguan current filter returns launch-scale actionable opportunities", shaoguan.status === 200 && (shaoguanBody.data?.total ?? 0) >= 100);
  const sources = await app.request("/api/business/sources?edition=tianhe");
  const sourcesBody = await sources.json() as { success?: boolean; data?: { items?: Array<{ officialUrl?: string; role?: string; integrationStatus?: string }> } };
  check("official source catalog is edition-scoped", sources.status === 200 && sourcesBody.success === true && (sourcesBody.data?.items?.length ?? 0) >= 3 && sourcesBody.data?.items?.every((item) => item.officialUrl?.startsWith("https://")) === true);
  check("public source catalog excludes candidate and technical-review sources", sources.status === 200 && sourcesBody.data?.items?.every((item) => item.role !== "candidate_discovery" && (item.integrationStatus === undefined || ["ACTIVE", "MANUAL_ONLY"].includes(item.integrationStatus))) === true);
  if (failures > 0) process.exitCode = 1;
}
main();
