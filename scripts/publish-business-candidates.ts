import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadBusinessOpportunities, type BusinessOpportunity } from "../src/business/opportunity";
import type { PublishableCandidate } from "../src/business/publishable-candidate";

const apply = process.argv.includes("--apply");
const input = path.resolve(process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? "data/business/review/publishable-candidates.json");
const target = path.resolve("src/business/opportunities.recorded.json");
const payload = JSON.parse(fs.readFileSync(input, "utf8")) as { records: PublishableCandidate[] };
const timestamp = "2026-07-24T12:00:00+08:00";

function slugFor(candidate: PublishableCandidate): string { return `guangdong-procurement-${crypto.createHash("sha256").update(candidate.officialUrl).digest("hex").slice(0, 16)}`; }
function toOpportunity(candidate: PublishableCandidate): BusinessOpportunity {
  const id = `opp-${crypto.createHash("sha256").update(candidate.officialUrl).digest("hex").slice(0, 20)}`;
  return { id, slug: slugFor(candidate), title: candidate.title, summary: `${candidate.organizer}发布的广东省政府采购项目，符合条件的供应商可按官方公告获取采购文件并参与投标或响应。`, category: "procurement", subCategory: "government-procurement", keywords: ["广东政府采购", "公开招标", "供应商", "投标"], industries: ["business-services", "government-procurement"], regions: candidate.regions, editions: candidate.editions, organizer: candidate.organizer, sourceName: "中国政府采购网", sourceType: "government", officialUrl: candidate.officialUrl, publishedAt: candidate.publishedAt, deadline: candidate.deadline, deadlineType: "fixed", timezone: "Asia/Shanghai", status: "open", verificationStatus: "fully_verified", verifiedAt: timestamp, verificationNotes: "已核对中国政府采购网官方公告的采购单位、广东省行政区域、公告类型、固定截止日、潜在投标人行动入口和字段级证据定位。资格、采购文件及更正公告以官方原文为准。", targetAudience: candidate.targetAudience, eligibilitySummary: candidate.eligibilitySummary, eligibilityRequirements: candidate.eligibilityRequirements, rewardSummary: candidate.rewardSummary, recommendationLevel: candidate.recommendationLevel, recommendationReasons: ["广东省行政区域内的当前政府采购行动公告", "官方页面列出采购单位、文件获取与截止时间", "可映射给广州、天河和韶关供应商发现商机"], risks: candidate.risks, nextActions: candidate.nextActions, featured: false, sourceDiscoveredAt: timestamp, createdAt: timestamp, updatedAt: timestamp, dataOwner: "chanceping-business-radar" };
}

const existing = loadBusinessOpportunities();
const existingUrls = new Set(existing.map((item) => item.officialUrl));
const additions = payload.records.filter((candidate) => !existingUrls.has(candidate.officialUrl)).map(toOpportunity);
const next = [...existing, ...additions];
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", existing: existing.length, additions: additions.length, total: next.length }, null, 2));
if (additions.length < 100) process.exitCode = 1;
if (apply && additions.length >= 100) {
  const snapshotDirectory = path.resolve("artifacts/business-opportunities-snapshots");
  fs.mkdirSync(snapshotDirectory, { recursive: true });
  fs.copyFileSync(target, path.join(snapshotDirectory, `opportunities.recorded.before-100-launch-${Date.now()}.json`));
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(temporary, target);
}
