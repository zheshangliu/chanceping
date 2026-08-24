import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { IchOpportunityStore } from "../src/ich/store";
import { IchPublicationService } from "../src/ich/publication-service";

const nowRaw = process.argv.includes("--now") ? process.argv[process.argv.indexOf("--now") + 1] : "2026-08-24T16:00:00+08:00";
const now = new Date(nowRaw);
if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowRaw}`);
const write = process.argv.includes("--write");
const storePath = path.resolve("data/ich-opportunities.json");
const auditPath = path.resolve("docs/ich/DS4-主来源重复修复记录_V1.0.json");
const supersededSlugs = [
  "expansion-batch-01-001",
  "expansion-batch-01-002",
  "expansion-batch-01-027",
  "expansion-batch-02-005",
  "expansion-batch-03-051",
  "expansion-batch-03-079",
];
const preferredSlugs = [
  "2026-ali-cultural-creative-products-procurement",
  "2026-chongming-cultural-tourism-badge-design",
  "2027-county-hall-pottery-potter-in-residence",
  "2026-weaveup-wool-residency",
  "2026-royal-museums-greenwich-creative-practitioner-residence",
  "2026-heritage-crafts-emerging-metalworker-award",
];
const beforeRaw = fs.readFileSync(storePath, "utf8");
const store = new IchOpportunityStore(storePath);
const service = new IchPublicationService(store);
const entries = store.list();
const actions = supersededSlugs.map((slug, index) => {
  const target = entries.find((entry) => entry.slug === slug);
  const preferred = entries.find((entry) => entry.slug === preferredSlugs[index]);
  if (!target || !preferred) throw new Error(`duplicate repair pair missing: ${slug} / ${preferredSlugs[index]}`);
  if (target.workflow.state !== "published") throw new Error(`${slug} is not published`);
  return { id: target.id, slug, preferred_slug: preferred.slug, preferred_id: preferred.id, revision_before: target.workflow.revision };
});
if (write) {
  for (const action of actions) {
    service.transition(action.id, "withdrawn", "withdrawn", {
      actor: "ich-ds4-dedup",
      now,
      expectedRevision: action.revision_before,
      reason: `DS4 主来源重复修复：与 ${action.preferred_slug} 共享同一主来源，保留更高可信度的唯一正式记录。`,
    });
  }
}
const afterRaw = fs.readFileSync(storePath, "utf8");
const audit = { schema_version: "1.0", stage: "DS4", mode: write ? "write" : "dry-run", executed_at: now.toISOString(), before_sha256: crypto.createHash("sha256").update(beforeRaw).digest("hex"), after_sha256: crypto.createHash("sha256").update(afterRaw).digest("hex"), actions, before_total: JSON.parse(beforeRaw).entries.length, after_total: JSON.parse(afterRaw).entries.length, withdrawn_count: write ? actions.length : 0, rollback_backup: write ? "data/ich-opportunities.json.bak" : null, production_store_write: write };
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ mode: audit.mode, duplicate_groups: actions.length, before_total: audit.before_total, after_total: audit.after_total, production_store_write: write, audit: path.relative(process.cwd(), auditPath) }, null, 2));
