import fs from "node:fs";
import path from "node:path";

function sleepSync(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

/** Small process-shared lock for the JSON runtime files used by V2. */
export function withJsonFileLock<T>(target: string, operation: () => T): T {
  const lockPath = `${target}.lock`;
  const started = Date.now();
  let descriptor: number | null = null;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  while (descriptor === null) {
    try {
      descriptor = fs.openSync(lockPath, "wx");
      fs.writeFileSync(descriptor, `${process.pid}\n`, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age > 60_000) fs.unlinkSync(lockPath);
      } catch { /* another process owns or is releasing the lock */ }
      if (Date.now() - started > 15_000) throw new Error(`Timed out waiting for JSON lock: ${target}`);
      sleepSync(15);
    }
  }
  try {
    return operation();
  } finally {
    try { fs.closeSync(descriptor); } catch { /* already closed */ }
    try { fs.unlinkSync(lockPath); } catch { /* another cleanup already removed it */ }
  }
}

export function atomicWriteJson(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temp, target);
}
