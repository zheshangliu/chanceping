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
const categoryCount = (category: string) => current.filter((item) => item.category === category).length;
const sourceCounts = [...new Set(current.map((item) => item.sourceName))].length;
const largestSourceShare = Math.max(...Object.values(current.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.sourceName]: (counts[item.sourceName] ?? 0) + 1 }), {}))) / current.length;
check("launch includes at least ten current policy opportunities", categoryCount("policy") >= 10);
check("launch includes at least three current competition opportunities", categoryCount("competition") >= 3);
check("launch retains current exhibition and international opportunities", categoryCount("exhibition") >= 1 && categoryCount("international") >= 1);
check("launch includes at least ten current exhibition opportunities", categoryCount("exhibition") >= 10);
const foreignTradeSignals = /外贸|出口|跨境|国际|境外|东盟|服务贸易|进口/;
const foreignTradeCount = current.filter((item) => item.category === "international" || foreignTradeSignals.test(`${item.title} ${item.keywords.join(" ")} ${item.summary}`)).length;
check("launch includes at least ten current foreign-trade opportunities", foreignTradeCount >= 10);
check("launch is represented by at least five official sources", sourceCounts >= 5);
check("largest source share is below 90 percent", largestSourceShare < 0.9);
if (failures > 0) process.exitCode = 1;
