import assert from "node:assert/strict";
import { WELFARE_SHADOW_SOURCES, WELFARE_SOURCES, type WelfareAdapterKind } from "../src/public/welfare-opportunities";

const requested = [
  "OFF-N-003", "OFF-N-005", "OFF-N-007", "OFF-N-009", "OFF-N-010", "OFF-N-011",
  "OFF-GD-003", "OFF-GZ-002", "OFF-GZ-003", "OFF-DG-001", "OFF-ZS-001", "OFF-HZ-001",
  "ORG-003", "ORG-004", "ORG-005", "OFF-N-008", "OFF-GD-001", "OFF-FS-001", "OFF-ZH-001", "OFF-GD-002",
] as const;
const expected: Record<string, WelfareAdapterKind> = {
  "OFF-N-003": "ccgp-contracts", "OFF-N-005": "ggzy-data-service", "OFF-N-007": "central-procurement",
  "OFF-N-008": "customs-procurement", "OFF-N-009": "pbc-procurement", "OFF-N-010": "tax-procurement",
  "OFF-N-011": "military-procurement", "OFF-GD-001": "gd-government-procurement", "OFF-GD-003": "gd-ggzy-spa",
  "OFF-GZ-002": "gzmall-procurement", "OFF-GZ-003": "gzexgrp-procurement", "OFF-FS-001": "city-ggzy-spa",
  "OFF-DG-001": "city-ggzy-spa", "OFF-ZH-001": "city-ggzy-spa", "OFF-ZS-001": "city-ggzy-spa",
  "OFF-HZ-001": "city-ggzy-spa", "ORG-003": "org-notice-board", "ORG-004": "org-notice-board", "ORG-005": "org-notice-board",
  "OFF-GD-002": "gd-government-procurement",
};
const all = [...WELFARE_SOURCES, ...WELFARE_SHADOW_SOURCES];
for (const code of requested) {
  const source = all.find((item) => item.code === code);
  assert.ok(source, `${code} must be registered`);
  assert.equal(source?.adapter, expected[code], `${code} must use its reviewed adapter`);
  assert.ok(source?.url.startsWith("https://"), `${code} must use HTTPS`);
  assert.ok(source?.allowedHost, `${code} must have an allowlisted host`);
  if (source?.rollout !== "public") assert.equal(source?.rollout, "shadow", `${code} must stay isolated until evidence passes`);
}
assert.equal(requested.length, 20);
console.log(`PASS verify:welfare:adapters (${requested.length} reviewed source adapters; shadow isolation intact)`);
