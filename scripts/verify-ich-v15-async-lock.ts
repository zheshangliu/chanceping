import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withAsyncFileLock } from "../src/opportunity-v2/async-file-lock";

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chanceping-v15-lock-"));
  const lockPath = path.join(dir, "cycle.lock");
  let active = 0;
  let maxActive = 0;
  const order: string[] = [];
  const work = (label: string, ms: number) => withAsyncFileLock(lockPath, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push(`${label}:start`);
    await pause(ms);
    order.push(`${label}:end`);
    active -= 1;
  });
  try {
    const first = work("first", 90);
    await pause(10);
    const second = work("second", 5);
    await Promise.all([first, second]);
    assert.equal(maxActive, 1, "simultaneous runner calls may not overlap");
    assert.deepEqual(order, ["first:start", "first:end", "second:start", "second:end"]);
    await assert.rejects(fs.stat(lockPath), { code: "ENOENT" }, "completed cycle releases the lock");

    let missingPid = 2_147_483_647;
    try { process.kill(missingPid, 0); } catch (error) { assert.equal((error as NodeJS.ErrnoException).code, "ESRCH"); missingPid = 2_147_483_647; }
    await fs.writeFile(lockPath, `${JSON.stringify({ pid: missingPid, token: "dead-owner", acquired_at: "2000-01-01T00:00:00Z" })}\n`);
    const reclaimed = await withAsyncFileLock(lockPath, async () => "reclaimed", { timeoutMs: 1000, retryMs: 5 });
    assert.equal(reclaimed, "reclaimed", "only a lock with a confirmed-dead PID may be reclaimed");
    await assert.rejects(fs.stat(lockPath), { code: "ENOENT" });

    await assert.rejects(withAsyncFileLock(lockPath, async () => { throw new Error("fixture"); }), /fixture/u);
    await assert.rejects(fs.stat(lockPath), { code: "ENOENT" }, "failed work must also release its own lock");
    console.log("ICH_V15_ASYNC_LOCK: PASS (serialized, dead-owner recovery, finally release)");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
