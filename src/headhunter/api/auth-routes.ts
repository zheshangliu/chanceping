import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { loadAdminAuthConfig, verifyAdminCredentials, type AdminAuthConfig } from "../auth/admin-auth";
import { SessionStore } from "../auth/session-store";

const SESSION_COOKIE = "finance_session";

export interface AuthRoutesOptions {
  config?: AdminAuthConfig;
  sessions?: SessionStore;
  secureCookies?: boolean;
  maxFailures?: number;
  windowMs?: number;
}

export function createAuthRoutes(options: AuthRoutesOptions = {}): Hono {
  const config = options.config ?? loadAdminAuthConfig();
  const sessions = options.sessions ?? new SessionStore();
  const maxFailures = options.maxFailures ?? 5;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const failures = new Map<string, { count: number; started_at: number }>();
  const app = new Hono();
  app.post("/login", async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>().catch((): { username?: string; password?: string } => ({}));
    const key = c.req.header("x-forwarded-for") ?? "local";
    const now = Date.now();
    const previous = failures.get(key);
    const current = previous && previous.started_at + windowMs > now ? previous : { count: 0, started_at: now };
    if (current.count >= maxFailures) return c.json({ error: "rate_limited" }, 429);
    if (!body.username || !body.password || !verifyAdminCredentials(body.username, body.password, config)) {
      current.count += 1; failures.set(key, current);
      return c.json({ error: "invalid_credentials" }, 401);
    }
    failures.delete(key);
    const token = sessions.create(body.username);
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: options.secureCookies ?? process.env.NODE_ENV === "production", sameSite: "Lax", path: "/", maxAge: 8 * 60 * 60 });
    return c.json({ authenticated: true });
  });
  app.post("/logout", (c) => { sessions.revoke(getCookie(c, SESSION_COOKIE)); deleteCookie(c, SESSION_COOKIE, { path: "/" }); return c.json({ authenticated: false }); });
  app.get("/session", (c) => {
    if (process.env.FINANCE_PUBLIC_MODE === "true") return c.json({ authenticated: true, public: true });
    const session = sessions.get(getCookie(c, SESSION_COOKIE));
    return session ? c.json({ authenticated: true, username: session.username }) : c.json({ authenticated: false }, 401);
  });
  return app;
}

export function requireFinanceSession(c: Parameters<Parameters<Hono["use"]>[1]>[0], sessions: SessionStore): Response | null {
  return sessions.get(getCookie(c, SESSION_COOKIE)) ? null : c.json({ error: "authentication_required" }, 401);
}
