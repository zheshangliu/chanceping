import { loadAdminAuthConfig, type AdminAuthConfig } from "../auth/admin-auth";
import { SessionStore } from "../auth/session-store";
import { createHeadHunterStores, type HeadHunterStores } from "../stores";

export interface HeadHunterApiContext {
  stores: HeadHunterStores;
  sessions: SessionStore;
  authConfig: AdminAuthConfig;
}

export function createHeadHunterApiContext(options: Partial<Pick<HeadHunterApiContext, "stores" | "sessions" | "authConfig">> = {}): HeadHunterApiContext {
  const authConfig = options.authConfig ?? (process.env.FINANCE_PUBLIC_MODE === "true"
    ? { username: "", password_hash: "", session_secret: "public-finance-mode" }
    : loadAdminAuthConfig());
  return { stores: options.stores ?? createHeadHunterStores(), sessions: options.sessions ?? new SessionStore(), authConfig };
}
