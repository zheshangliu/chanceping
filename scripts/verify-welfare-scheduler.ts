import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const service = fs.readFileSync(path.resolve("docs/deployment/chanceping-welfare-update.service"), "utf8");
const timer = fs.readFileSync(path.resolve("docs/deployment/chanceping-welfare-update.timer"), "utf8");
assert.match(service, /WorkingDirectory=\/opt\/chanceping\/current/);
assert.match(service, /EnvironmentFile=\/etc\/chanceping\/chanceping\.env/);
assert.match(service, /ExecStart=\/usr\/bin\/npm run welfare:update -- --limit 12/);
assert.match(service, /TimeoutStartSec=30min/);
assert.match(service, /network-online\.target/);
assert.match(timer, /08:30:00 Asia\/Shanghai/);
assert.match(timer, /16:30:00 Asia\/Shanghai/);
assert.match(timer, /Persistent=true/);
console.log("PASS verify:welfare:scheduler");
