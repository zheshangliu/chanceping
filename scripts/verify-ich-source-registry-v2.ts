import assert from "node:assert/strict";
import { ICH_PRIMARY_CATEGORIES } from "../src/ich/types";
import { getIchSourceRegistryV2, listIchSourceRegistryV2ByCategory, listIchSourceRegistryV2ByGeography, validateIchSourceRegistryV2 } from "../src/ich/source-registry-v2";

const registry = getIchSourceRegistryV2();
const errors = validateIchSourceRegistryV2(registry);
assert.deepEqual(errors, [], errors.join("; "));
assert.equal(registry.sources.length, 39, "DS1 source registry must contain the expanded 39-source baseline");
assert.ok(registry.sources.filter((source) => source.family === "procurement_platform").length >= 5, "procurement coverage must have at least five platform sources");
assert.ok(registry.sources.filter((source) => source.geography.includes("guangzhou")).length >= 3, "Guangzhou coverage must have at least three sources");
assert.ok(registry.sources.filter((source) => source.role === "discovery").length >= 3, "discovery layer must be represented");
const adapterReady = registry.sources.filter((source) => source.operational_status === "adapter_ready");
assert.ok(adapterReady.every((source) => ["mct-notices", "cnaf", "ichina", "gmfyg", "gz-culture", "cnacs", "gdmuseum", "ccgp", "gd-culture", "yuexiu-notices", "gdmoa", "unesco-ich"].includes(source.id)), "only audited adapters may be adapter_ready");
assert.ok(adapterReady.length <= 12, "DS12 adapter-ready promotion must remain incremental");
for (const category of ICH_PRIMARY_CATEGORIES) assert.ok(listIchSourceRegistryV2ByCategory(category).length > 0, `category ${category} must have a source`);
assert.ok(listIchSourceRegistryV2ByGeography("greater_bay_area").length >= 5, "Greater Bay Area source pool must be represented");
assert.ok(registry.query_packs.some((pack) => pack.id === "ich-cn-procurement"));
assert.ok(registry.query_packs.some((pack) => pack.id === "ich-grants-intl"));
console.log(`ICH DS1 source registry V2: ${registry.sources.length} sources, ${registry.query_packs.length} query packs, all checks passed`);
