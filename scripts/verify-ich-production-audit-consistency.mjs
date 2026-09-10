#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const auditDir = path.join(root, "audits/ich/production/latest");
const files = {
  summary: path.join(auditDir, "production-summary.json"),
  checks: path.join(auditDir, "checks.json"),
  manifest: path.join(auditDir, "manifest.json"),
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const summary = readJson(files.summary);
const checks = readJson(files.checks);
const manifest = readJson(files.manifest);

const values = {
  ui_no_history_top_nav: {
    "production-summary.ui.no_history_top_nav": summary.ui?.no_history_top_nav,
    "production-summary.gates.ui.no_history_top_nav": summary.gates?.ui?.no_history_top_nav,
    "checks.ui.no_history_top_nav": checks.ui?.no_history_top_nav,
    "manifest.gates.ui.no_history_top_nav": manifest.gates?.ui?.no_history_top_nav,
  },
  procurement_no_leakage: {
    "production-summary.gates.procurement_no_leakage": summary.gates?.procurement_no_leakage,
    "checks.procurement_no_leakage": checks.procurement_no_leakage,
    "manifest.gates.procurement_no_leakage": manifest.gates?.procurement_no_leakage,
  },
  procurement_leakage_count: {
    "production-summary.gates.procurement_leakage_count": summary.gates?.procurement_leakage_count,
    "checks.procurement_leakage_count": checks.procurement_leakage_count,
    "manifest.gates.procurement_leakage_count": manifest.gates?.procurement_leakage_count,
  },
};

const errors = [];
const assertAll = (name, expected) => {
  const entries = Object.entries(values[name]);
  if (entries.some(([, value]) => value !== expected) || new Set(entries.map(([, value]) => value)).size !== 1) {
    errors.push({ gate: name, expected, values: values[name] });
  }
};

assertAll("ui_no_history_top_nav", true);
assertAll("procurement_no_leakage", true);
assertAll("procurement_leakage_count", 0);

const result = {
  schema_version: "chanceping.ich.production-audit-consistency.v1",
  generated_at: new Date().toISOString(),
  status: errors.length === 0 ? "PASS" : "FAIL",
  errors,
  gates: values,
};

fs.writeFileSync(path.join(auditDir, "self-consistency.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
