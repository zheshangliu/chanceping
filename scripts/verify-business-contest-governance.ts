import assert from "node:assert/strict";
import { buildBusinessReleaseManifest } from "../src/business/release-manifest";
import { sourcesForEdition } from "../src/business/source-catalog";

const manifest = buildBusinessReleaseManifest();
assert.equal(manifest.schemaVersion, "business-release-manifest.v1");
assert.ok(manifest.data.total >= 100, `expected launch-scale dataset, got ${manifest.data.total}`);
assert.equal(manifest.data.total, manifest.data.current + manifest.data.historical);
assert.equal(manifest.governance.requiredOfficialUrl, true);
for (const edition of manifest.governance.editions) {
  const sources = sourcesForEdition(edition as "guangzhou" | "tianhe" | "shaoguan");
  assert.ok(sources.every((source) => source.role !== "candidate_discovery"), `${edition} exposes candidate source`);
  assert.ok(sources.every((source) => source.integrationStatus === "ACTIVE" || source.integrationStatus === "MANUAL_ONLY"), `${edition} exposes non-public source`);
}
console.log(`Business contest governance verified: ${manifest.data.total} opportunities, ${manifest.data.current} current, ${manifest.data.historical} historical`);
