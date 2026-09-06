import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { IchOpportunityStore } from "../src/ich/store";
import type { IchOpportunity } from "../src/ich/types";

const root = process.cwd();
const storePath = path.join(root, "data/ich-opportunities.json");
const now = new Date("2026-09-06T12:00:00+08:00");
const bytesBefore = fs.readFileSync(storePath);
const beforeHash = crypto.createHash("sha256").update(bytesBefore).digest("hex");
const store = new IchOpportunityStore(storePath);
const entries = store.list();
const checkedAt = now.toISOString();
const changes: Array<Record<string, unknown>> = [];

const fuzhou = entries.find((entry) => entry.slug === "fuzhou-heritage-craft-gift-procurement-2026");
if (!fuzhou) throw new Error("Missing Fuzhou Batch2 record");
if (fuzhou.costs.deposit_amount !== 3000 || fuzhou.costs.deposit_currency !== "CNY") {
  const next = fuzhou.costs;
  next.deposit_amount = 3000;
  next.deposit_currency = "CNY";
  const provenance = (fuzhou as IchOpportunity & { field_provenance?: Record<string, unknown> }).field_provenance ?? {};
  provenance.deposit = {
    source_url: "https://www.fuzhou.gov.cn/zgfzzt/sjxw/fzjx/tzgg/202609/t20260904_5368132.htm",
    checked_at: checkedAt,
    note: "官方竞争性磋商公告第3项列明采购包保证金为3000元人民币。",
  };
  (fuzhou as IchOpportunity & { field_provenance: Record<string, unknown> }).field_provenance = provenance;
  fuzhou.metadata.updated_at = checkedAt;
  fuzhou.metadata.updated_by = "stage5a-b3-preflight";
  fuzhou.metadata.last_checked_at = checkedAt;
  changes.push({ slug: fuzhou.slug, fields: ["costs.deposit_amount", "costs.deposit_currency", "field_provenance.deposit"], values: { deposit_amount: 3000, deposit_currency: "CNY" } });
}

const guam = entries.find((entry) => entry.slug === "guam-micronesia-island-fair-vendor-2026");
if (!guam) throw new Error("Missing Guam Batch2 record");
if (guam.costs.application_fee_amount !== null || guam.costs.cost_status !== "partial" || guam.costs.deposit_amount !== 100 || guam.costs.deposit_currency !== "USD") {
  guam.costs.application_fee_amount = null;
  guam.costs.application_fee_currency = "USD";
  guam.costs.cost_status = "partial";
  guam.costs.deposit_amount = 100;
  guam.costs.deposit_currency = "USD";
  guam.costs.cost_text = "官方页面列明Made in Guam/Micronesia类别200美元、Commercial类别350美元；另有100美元垃圾押金和40美元消防许可费。由于费用按类别分档，未将任一类别费用表达为统一报名费。";
  const provenance = (guam as IchOpportunity & { field_provenance?: Record<string, unknown> }).field_provenance ?? {};
  provenance.fee = {
    source_url: "https://www.visitguam.com/gmif/vendor-application/",
    checked_at: checkedAt,
    note: "官方Vendor Application列明Made in Guam/Micronesia 200 USD、Commercial 350 USD及附加费用，属于分档费用。",
  };
  provenance.deposit = {
    source_url: "https://www.visitguam.com/gmif/vendor-application/",
    checked_at: checkedAt,
    note: "官方Vendor Application列明垃圾押金100 USD。",
  };
  (guam as IchOpportunity & { field_provenance: Record<string, unknown> }).field_provenance = provenance;
  guam.metadata.updated_at = checkedAt;
  guam.metadata.updated_by = "stage5a-b3-preflight";
  guam.metadata.last_checked_at = checkedAt;
  changes.push({ slug: guam.slug, fields: ["costs.application_fee_amount", "costs.application_fee_currency", "costs.cost_status", "costs.deposit_amount", "costs.deposit_currency", "field_provenance.fee", "field_provenance.deposit"], values: { application_fee_amount: null, application_fee_currency: "USD", cost_status: "partial", deposit_amount: 100, deposit_currency: "USD" } });
}

if (changes.length > 0) store.replaceAll(entries, checkedAt);
const bytesAfter = fs.readFileSync(storePath);
const afterHash = crypto.createHash("sha256").update(bytesAfter).digest("hex");
const report = { batch: "stage5a-batch-03-preflight", mode: changes.length ? "write" : "no-op", before_sha256: beforeHash, after_sha256: afterHash, changed_records: changes, checked_at: checkedAt };
fs.writeFileSync(path.join(root, "docs/ich/stage5a-batch3-preflight-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
