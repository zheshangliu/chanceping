import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProcurementChangeEvents, readProcurementChangeFeed, recordProcurementChangeFeed } from "../src/opportunity-v2/procurement-change-feed";
import type { OpportunityV2 } from "../src/opportunity-v2/types";

const base: OpportunityV2 = {
  id: "change-fixture", title: "非遗礼赠采购", summary: "采购文化礼赠", source_id: "proc-cn-ccgp", source_item_id: "c1", source_name: "fixture", source_url: "https://example.invalid", detail_url: "https://example.invalid/c1", category: "procurement_project", region: "CN", tags: ["文创产品", "礼赠"], deadline: "2026-10-01", status: "CURRENT", first_seen_at: "2026-09-01T00:00:00Z", last_seen_at: "2026-09-01T00:00:00Z", discovered_by_sources: ["proc-cn-ccgp"], radar_relevance: "RELEVANT", procurement: { direction: "buyer_demand", stage: "open", notice_type: "tender", project_id: "c1", budget_amount: 100, budget_currency: "CNY", milestones: [] },
};
const now = "2026-09-15T00:00:00.000Z";
assert.equal(buildProcurementChangeEvents([base], [{ ...base, last_seen_at: now }], now).length, 0);
const changed = buildProcurementChangeEvents([base], [{ ...base, deadline: "2026-10-03" }], now);
assert.equal(changed.length, 1);
assert.equal(changed[0].event_type, "deadline_changed");
assert.equal(buildProcurementChangeEvents([base], [{ ...base, deadline: "2026-10-03" }], now)[0].event_id, changed[0].event_id);
assert.equal(buildProcurementChangeEvents([base], [], now).length, 0);
const cancelled = buildProcurementChangeEvents([base], [{ ...base, procurement: { ...base.procurement!, stage: "cancelled" } }], now);
assert.equal(cancelled[0].event_type, "cancelled");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-change-feed-store-"));
const feedPath = path.join(tempDir, "procurement-change-feed.json");
const firstRun = recordProcurementChangeFeed([base], [], feedPath, now);
assert.equal(firstRun.length, 1);
assert.equal(firstRun[0].event_type, "new");
const seenOnly = recordProcurementChangeFeed([{ ...base, last_seen_at: now }], [], feedPath, now);
assert.equal(seenOnly.length, 0);
const deadlineChange = recordProcurementChangeFeed([{ ...base, deadline: "2026-10-03" }], [], feedPath, now);
assert.equal(deadlineChange.length, 1);
assert.equal(deadlineChange[0].event_type, "deadline_changed");
const repeatedDeadlineChange = recordProcurementChangeFeed([{ ...base, deadline: "2026-10-03" }], [], feedPath, now);
assert.equal(repeatedDeadlineChange.length, 0);
assert.equal(readProcurementChangeFeed(feedPath).events.length, 2);
fs.rmSync(tempDir, { recursive: true, force: true });
console.log("PROCUREMENT_CHANGE_FEED: PASS");
