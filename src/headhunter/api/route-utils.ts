import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { HeadHunterApiContext } from "./context";

export function requireAdmin(c: Context, context: HeadHunterApiContext): Response | null {
  // Public mode intentionally exposes read-only Finance data. Mutating routes
  // remain protected even when the public flag is enabled.
  if (process.env.FINANCE_PUBLIC_MODE === "true" && c.req.method === "GET") return null;
  return context.sessions.get(getCookie(c, "finance_session")) ? null : c.json({ error: "authentication_required" }, 401);
}

export async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  const parsed: unknown = await c.req.json().catch(() => ({}));
  return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
}
