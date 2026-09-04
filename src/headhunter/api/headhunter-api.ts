import { Hono } from "hono";
import type { AuthRoutesOptions } from "./auth-routes";
import { createAuthRoutes } from "./auth-routes";
import type { HeadHunterApiContext } from "./context";
import { createHeadHunterApiContext } from "./context";
import { companyRoutes } from "./company-routes";
import { evidenceRoutes } from "./evidence-routes";
import { leadRoutes } from "./lead-routes";
import { runRoutes } from "./run-routes";
import { trendRoutes } from "./trend-routes";
import { weeklyRoutes } from "./weekly-routes";
import { opportunityRoutes } from "./opportunity-routes";
import { watchlistRoutes } from "./watchlist-routes";

export interface HeadHunterApiOptions extends AuthRoutesOptions { context?: HeadHunterApiContext; }

export function createHeadHunterApi(options: HeadHunterApiOptions = {}): Hono {
  const context = options.context ?? createHeadHunterApiContext({ sessions: options.sessions, authConfig: options.config });
  const app = new Hono();
  app.route("/auth", createAuthRoutes({ config: context.authConfig, sessions: context.sessions, secureCookies: options.secureCookies, maxFailures: options.maxFailures, windowMs: options.windowMs }));
  app.route("/weekly", weeklyRoutes(context));
  app.route("/leads", leadRoutes(context));
  app.route("/companies", companyRoutes(context));
  app.route("/evidence", evidenceRoutes(context));
  app.route("/trends", trendRoutes(context));
  app.route("/runs", runRoutes(context));
  app.route("/opportunities", opportunityRoutes(context));
  app.route("/watchlist", watchlistRoutes(context));
  return app;
}
