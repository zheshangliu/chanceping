import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isFixedDeadlineCurrent } from "../src/business/data-quality";
import { loadBusinessOpportunities, validateBusinessOpportunities, type BusinessOpportunity } from "../src/business/opportunity";

type Input = Pick<BusinessOpportunity, "title" | "category" | "keywords" | "organizer" | "sourceName" | "sourceType" | "officialUrl" | "deadline" | "deadlineType" | "targetAudience" | "eligibilitySummary" | "eligibilityRequirements" | "rewardSummary" | "risks" | "nextActions"> & { publishedAt?: string; evidenceSummary: string };
const inputPath = process.argv[2];
const apply = process.argv.includes("--apply");
if (!inputPath) throw new Error("Usage: tsx scripts/import-verified-business-opportunities.ts <input.json> [--apply]");
const now = new Date("2026-07-24T12:00:00+08:00");
const timestamp = now.toISOString();
const inputs = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as Input[];

const additions: BusinessOpportunity[] = inputs.map((item) => {
  const deadlineType = item.deadlineType ?? "fixed";
  if (!item.title || !item.officialUrl.startsWith("https://") || !item.evidenceSummary || (deadlineType === "fixed" && (!item.deadline || !isFixedDeadlineCurrent(item.deadline, now)))) throw new Error(`Invalid verified input: ${item.title}`);
  const hash = crypto.createHash("sha256").update(item.officialUrl).digest("hex");
  return {
    id: `opp-${hash.slice(0, 20)}`, slug: `verified-${item.category}-${hash.slice(0, 16)}`, title: item.title,
    summary: `${item.organizer}发布的当前${item.category === "exhibition" ? "参展" : "外贸"}机会，符合条件的主体可按官方原文办理。`, category: item.category, subCategory: `verified-${item.category}`,
    keywords: [...new Set(["人工核验", "官方原文", ...item.keywords])], industries: ["business-services"], regions: ["guangdong"], editions: ["guangzhou", "tianhe", "shaoguan"], organizer: item.organizer, sourceName: item.sourceName, sourceType: item.sourceType,
    officialUrl: item.officialUrl, publishedAt: item.publishedAt, deadline: item.deadline, deadlineType, timezone: "Asia/Shanghai", status: "open", verificationStatus: "fully_verified", verifiedAt: timestamp,
    verificationNotes: `人工复核：${item.evidenceSummary}`, targetAudience: item.targetAudience, eligibilitySummary: item.eligibilitySummary, eligibilityRequirements: item.eligibilityRequirements, rewardSummary: item.rewardSummary,
    recommendationLevel: "medium", recommendationReasons: ["直接官方或主办方原文", "固定报名/申报截止日已核验", "保留原始链接供复核"], risks: item.risks, nextActions: item.nextActions,
    featured: false, sourceDiscoveredAt: timestamp, createdAt: timestamp, updatedAt: timestamp, dataOwner: "chanceping-business-radar",
  };
});
const existing = loadBusinessOpportunities();
const urls = new Set(existing.map((item) => item.officialUrl));
const next = validateBusinessOpportunities([...existing, ...additions.filter((item) => !urls.has(item.officialUrl))]);
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", imported: next.length - existing.length, total: next.length }, null, 2));
if (apply) fs.writeFileSync(path.resolve("src/business/opportunities.recorded.json"), `${JSON.stringify(next, null, 2)}\n`);
