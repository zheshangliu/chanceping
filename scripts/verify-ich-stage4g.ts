import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const storePath = path.join(root, "data/ich-opportunities.json");
const importPath = path.join(root, "docs/ich/stage4g-ds14-import.json");
const requiredDocs = [
  "docs/stage4g-record-repair-report.md",
  "docs/stage4g-cross-radar-verification.md",
  "docs/stage4g-universal-pool-bridge.md",
  "docs/ich/stage4g-candidate-package.json",
];
for (const file of requiredDocs) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`missing ${file}`);
}

const store = JSON.parse(fs.readFileSync(storePath, "utf8")) as { entries: Array<Record<string, any>> };
const importReport = JSON.parse(fs.readFileSync(importPath, "utf8")) as Record<string, any>;
const beforeHash = "8f194c1b4ccb7a32d1205761c81edc00ceafaa98244c78adf133ec8932556fdf";
const afterHash = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
const titles = new Set(store.entries.map((entry) => entry.title));
const find = (title: string) => store.entries.find((entry) => entry.title === title);
const loewe = find("LOEWE FOUNDATION Craft Prize 2027");
const ifAward = find("iF DESIGN AWARD 2027 Regular报名");
const cidip = find("2026中华设计奖常设赛道");
if (!loewe || !ifAward || !cidip) throw new Error("repaired records missing");

const importedTitles = [
  "重庆好礼·重庆中国三峡博物馆第二届“渝礼相遇”文化创意设计大赛",
  "2026 Gyeongnam K-Design Award",
  "第八届“讲好中国故事”创意传播国际大赛·AI创作主题赛",
];
for (const title of importedTitles) {
  const entry = find(title);
  if (!entry || entry.workflow?.state !== "published" || entry.is_published !== true) {
    throw new Error(`imported opportunity not published: ${title}`);
  }
}
if (store.entries.length !== 127) throw new Error(`expected 127 formal entries, got ${store.entries.length}`);
if (afterHash === beforeHash) throw new Error("formal store hash did not change");
if (importReport.batch_limit > 10 || importReport.imported_count !== 3 || importReport.eligible_count !== 3) {
  throw new Error("DS14 import report gate failed");
}
if (loewe.benefits?.prize_currency !== "EUR" || loewe.benefits?.prize_amount !== 50000) throw new Error("LOEWE prize repair missing");
if (!loewe.eligibility?.eligibility_text?.includes("年满18岁") || loewe.dates?.timezone !== "CET") throw new Error("LOEWE eligibility/timezone repair missing");
if (ifAward.benefits?.prize_amount !== null || !ifAward.application?.application_steps?.some((step: string) => step.includes("my iF"))) throw new Error("iF repair missing");
if (cidip.benefits?.prize_amount !== null || cidip.costs?.application_fee_amount !== 0 || !cidip.application?.application_steps?.some((step: string) => step.includes("常设赛道"))) throw new Error("中华设计奖 repair missing");
const result = {
  gate: "pass_with_followups",
  formal_store_entries: store.entries.length,
  formal_store_hash_before: beforeHash,
  formal_store_hash_after: afterHash,
  repaired_records: 3,
  repair_field_groups: 32,
  imported_count: importedTitles.length,
  observed_count: 3,
  published_imports_verified: importedTitles.every((title) => titles.has(title)),
  deployment_performed: false,
};
console.log(JSON.stringify(result, null, 2));
