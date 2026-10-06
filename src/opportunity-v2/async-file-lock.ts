import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

interface LockRecord { pid: number; token: string; acquired_at: string; }
export interface AsyncFileLockOptions { timeoutMs?: number; retryMs?: number; }

function ownerIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function removeConfirmedDeadOwner(lockPath: string): Promise<boolean> {
  try {
    const before = await fs.lstat(lockPath);
    const raw = await fs.readFile(lockPath, "utf8");
    const record = JSON.parse(raw) as Partial<LockRecord>;
    if (!Number.isInteger(record.pid) || ownerIsAlive(record.pid as number)) return false;
    const after = await fs.lstat(lockPath);
    if (before.dev !== after.dev || before.ino !== after.ino) return false;
    await fs.unlink(lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    return false;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Cross-process async lock for a multi-step runtime transaction. Stale locks
 * are reclaimed only when their recorded PID is confirmed absent; age alone
 * never grants permission to unlink a lock owned by a slow but live run.
 */
export async function withAsyncFileLock<T>(lockPath: string, operation: () => Promise<T> | T, options: AsyncFileLockOptions = {}): Promise<T> {
  const target = path.resolve(lockPath);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retryMs = options.retryMs ?? 40;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || !Number.isInteger(retryMs) || retryMs < 1) throw new Error("Invalid async file-lock timeout");
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o750 });
  const started = Date.now();
  const token = randomUUID();
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let ownedStat: Awaited<ReturnType<Awaited<ReturnType<typeof fs.open>>["stat"]>> | undefined;

  while (!handle) {
    try {
      handle = await fs.open(target, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, token, acquired_at: new Date().toISOString() } satisfies LockRecord)}\n`, "utf8");
      await handle.sync();
      ownedStat = await handle.stat();
    } catch (error) {
      if (handle) { await handle.close().catch(() => undefined); handle = undefined; }
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await removeConfirmedDeadOwner(target);
      if (Date.now() - started >= timeoutMs) throw new Error("Timed out waiting for the protected Opportunity V2 cycle lock");
      await delay(retryMs);
    }
  }

  try {
    return await operation();
  } finally {
    try { await handle.close(); } catch { /* lock file cleanup remains token guarded */ }
    try {
      const currentStat = await fs.lstat(target);
      const current = JSON.parse(await fs.readFile(target, "utf8")) as Partial<LockRecord>;
      if (ownedStat && currentStat.dev === ownedStat.dev && currentStat.ino === ownedStat.ino && current.token === token) await fs.unlink(target);
    } catch { /* a replacement lock must not be removed by this owner */ }
  }
}
