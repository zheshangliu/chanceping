import { loadBusinessOpportunities, lifecycleStatus } from "../src/business/opportunity";

let failures = 0;
function check(name: string, condition: boolean): void { console.log(`${condition ? "PASS" : "FAIL"} ${name}`); if (!condition) failures += 1; }
const now = new Date("2026-07-24T12:00:00+08:00");
const records = loadBusinessOpportunities();
const current = records.filter((item) => lifecycleStatus(item, now) !== "historical");
check("launch has at least 100 current publishable opportunities", current.length >= 100);
check("current launch records are official HTTPS and fully verified", current.every((item) => item.officialUrl.startsWith("https://") && item.verificationStatus === "fully_verified"));
check("current fixed records have future deadline", current.filter((item) => item.deadlineType === "fixed").every((item) => item.deadline && Date.parse(item.deadline) >= now.getTime()));
check("launch opportunities cover all Business editions", ["guangzhou", "tianhe", "shaoguan"].every((edition) => current.some((item) => item.editions.includes(edition as "guangzhou"))));
check("current launch records have decision fields", current.every((item) => item.risks.length > 0 && item.nextActions.length >= 2 && item.eligibilitySummary.length > 0));
if (failures > 0) process.exitCode = 1;
