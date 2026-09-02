import { randomBytes } from "node:crypto";

interface SessionRecord { username: string; expires_at: number; }

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  constructor(private readonly ttlMs = 8 * 60 * 60 * 1000) {}
  create(username: string, now = Date.now()): string {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, { username, expires_at: now + this.ttlMs });
    return token;
  }
  get(token: string | undefined, now = Date.now()): SessionRecord | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expires_at <= now) { this.sessions.delete(token); return null; }
    return { ...session };
  }
  revoke(token: string | undefined): void { if (token) this.sessions.delete(token); }
  clear(): void { this.sessions.clear(); }
}
