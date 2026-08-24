import fs from "node:fs";
import path from "node:path";
import { IchOpportunityStore } from "../src/ich/store";
import { findIchSemanticIssues, sanitizeIchTemplateContamination } from "../src/ich/semantic-validation";
import { validateIchOpportunityFile, type IchValidationResult } from "../src/ich/validation";
import type { IchOpportunityFile } from "../src/ich/types";

const positionalPath = process.argv.slice(2).find((argument, index, argumentsList) =>
  !argument.startsWith("--") && argumentsList[index - 1] !== "--now",
);
const filePath = path.resolve(positionalPath ?? "data/ich-opportunities.json");
const nowIndex = process.argv.indexOf("--now");
const now = new Date(nowIndex >= 0 ? (process.argv[nowIndex + 1] ?? "") : new Date().toISOString());
const repair = process.argv.includes("--repair");
if (Number.isNaN(now.getTime())) throw new Error("Invalid --now value");
if (!fs.existsSync(filePath)) throw new Error(`ICH data file not found: ${filePath}`);

const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
const fileValidation: IchValidationResult<IchOpportunityFile> = validateIchOpportunityFile(parsed);
if (!fileValidation.valid || !fileValidation.value) throw new Error(fileValidation.errors.join("; "));
const entries = fileValidation.value.entries;
const findings = entries.flatMap((entry) => {
  const issues = findIchSemanticIssues(entry, entries);
  return issues.length === 0 ? [] : [{ slug: entry.slug, title: entry.title, issues }];
});
const fieldCounts = new Map<string, number>();
for (const finding of findings) for (const issue of finding.issues) fieldCounts.set(issue.field, (fieldCounts.get(issue.field) ?? 0) + 1);

if (repair && findings.length > 0) {
  const contaminated = new Set(findings.map((finding) => finding.slug));
  const repaired = entries.map((entry) => contaminated.has(entry.slug) ? sanitizeIchTemplateContamination(entry, now.toISOString()) : entry);
  new IchOpportunityStore(filePath).replaceAll(repaired, now.toISOString());
}

const report = {
  file: filePath,
  mode: repair ? "repair" : "audit",
  audited_at: now.toISOString(),
  entries: entries.length,
  findings: findings.length,
  repaired: repair ? findings.length : 0,
  fields: Object.fromEntries([...fieldCounts.entries()].sort((a, b) => b[1] - a[1])),
  samples: findings.slice(0, 20).map((finding) => ({ slug: finding.slug, title: finding.title, issues: finding.issues })),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!repair && findings.length > 0) process.exitCode = 2;
