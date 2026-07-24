import { loadSourceRegistry, sourceMayPublish, validateSourceRegistry } from "../src/business/data-pipeline";

let failures = 0;
function check(name: string, condition: boolean): void { console.log(`${condition ? "PASS" : "FAIL"} ${name}`); if (!condition) failures += 1; }

const registry = loadSourceRegistry();
check("source registry contains all 52 registered sources", registry.sources.length === 52 && registry.sourceCount === 52);
check("source ids are unique", new Set(registry.sources.map((source) => source.sourceId)).size === registry.sources.length);
check("source entries use official HTTPS entry URLs", registry.sources.every((source) => source.entryUrl.startsWith("https://")));
check("P2 discovery sources cannot publish directly", registry.sources.filter((source) => source.priority === "P2").every((source) => !sourceMayPublish(source)));
check("direct P0 and P1 facts remain publish-eligible only when explicitly allowed", registry.sources.filter((source) => source.finalAllowed === "是").every((source) => source.role === "official_fact" && sourceMayPublish(source)));
try {
  validateSourceRegistry({ ...registry, sourceCount: 51 });
  check("source count mismatch is rejected", false);
} catch { check("source count mismatch is rejected", true); }
try {
  validateSourceRegistry({ ...registry, sources: [{ ...registry.sources[0], sourceId: registry.sources[1].sourceId }, ...registry.sources.slice(1)] });
  check("duplicate source id is rejected", false);
} catch { check("duplicate source id is rejected", true); }
if (failures > 0) process.exitCode = 1;
