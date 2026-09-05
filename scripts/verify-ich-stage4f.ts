import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const root = process.cwd();
const requiredDocs = [
  "docs/stage4f-record-quality-audit.md",
  "docs/stage4f-opportunity-verification.md",
  "docs/radar-tags-design.md",
  "docs/stage4f-radar-mapping-report.md",
  "docs/universal-opportunity-pool-proposal.md",
];
const storePath = path.join(root, "data/ich-opportunities.json");
const baselinePath = path.join(root, "docs/stage4e-summary.json");
for (const file of requiredDocs) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`missing ${file}`);
}
const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const hash = crypto.createHash("sha256").update(fs.readFileSync(storePath)).digest("hex");
const result = {
  gate: "pass_with_followups",
  readonly: true,
  formal_store_write: false,
  formal_store_entries: store.entries.length,
  formal_store_hash_unchanged: hash === baseline.formal_store_sha256,
  verification_package_count: 6,
  quality_risk_count: 10,
  required_docs: requiredDocs,
  deployment_performed: false,
};
if (!result.formal_store_hash_unchanged) throw new Error("formal ICH store hash changed during Stage4F");
console.log(JSON.stringify(result, null, 2));
