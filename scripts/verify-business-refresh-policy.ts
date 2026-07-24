import { BUSINESS_REFRESH_INTERVAL_DAYS, isBusinessRefreshDue } from "../src/business/refresh-policy";

let failures = 0;
function check(name: string, value: boolean): void { console.log(`${value ? "PASS" : "FAIL"} ${name}`); if (!value) failures += 1; }
const base = new Date("2026-07-24T12:00:00+08:00");
check("business refresh interval is three days", BUSINESS_REFRESH_INTERVAL_DAYS === 3);
check("missing last run is due", isBusinessRefreshDue(undefined, base));
check("run after two days is not due", !isBusinessRefreshDue("2026-07-22T12:00:00+08:00", base));
check("run after three days is due", isBusinessRefreshDue("2026-07-21T12:00:00+08:00", base));
if (failures) process.exitCode = 1;
