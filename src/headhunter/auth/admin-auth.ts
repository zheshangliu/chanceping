import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export interface AdminAuthConfig {
  username: string;
  password_hash: string;
  session_secret: string;
}

export function loadAdminAuthConfig(env: NodeJS.ProcessEnv = process.env): AdminAuthConfig {
  const username = env.FINANCE_ADMIN_USERNAME;
  const passwordHash = env.FINANCE_ADMIN_PASSWORD_HASH;
  const sessionSecret = env.FINANCE_SESSION_SECRET;
  if (!username || !passwordHash || !sessionSecret) throw new Error("Finance admin auth secrets are not configured");
  return { username, password_hash: passwordHash, session_secret: sessionSecret };
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const actual = scryptSync(password, parts[1], 64);
    const expected = Buffer.from(parts[2], "hex");
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function verifyAdminCredentials(username: string, password: string, config: AdminAuthConfig): boolean {
  return username === config.username && verifyPassword(password, config.password_hash);
}
