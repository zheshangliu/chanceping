import { Hono } from "hono";
import type { Context } from "hono";
import type { WeeklyLeadSnapshot } from "../model/lead";
import type { HeadHunterApiContext } from "./context";
import { requireAdmin, jsonBody } from "./route-utils";

export function leadRoutes(context: HeadHunterApiContext): Hono {
  const app = new Hono();
  app.get("/a", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; return c.json(await context.stores.leads.listByPool("A_ACTIONABLE")); });
  app.get("/b", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; return c.json(await context.stores.leads.listByPool("B_ENRICHMENT")); });
  app.post("/manual", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const body = await jsonBody(c); const now = new Date().toISOString(); let companyId = stringValueOrNull(body.company_id); if (!companyId && typeof body.company_name === "string" && body.company_name.trim()) { companyId = `manual-company-${Date.now()}`; await context.stores.companies.upsert({ company_id: companyId, canonical_name: body.company_name.trim(), name_cn: null, name_en: null, aliases: [], industry: null, sub_industry: null, country: null, region: null, city: null, company_type: null, website: null, linkedin_company_url: null, official_domains: [], target_segment: "other", parent_company_id: null, entity_scope: "legal_entity", created_at: now, updated_at: now, last_verified_at: null, status: "unknown" }); } const snapshot = { id: stringValue(body.id, `manual-${Date.now()}`), company_id: companyId ?? "manual-company", week_key: stringValue(body.week_key, "unknown-week"), radar_run_id: null, source: "manual" as const, primary_trigger_id: null, supporting_signal_ids: [], need_inference_ids: [], contact_gate_status: "fail" as const, evidence_gate_status: "fail" as const, business_score: numberValue(body.business_score, 0), freshness_score: numberValue(body.freshness_score, 0), final_rank_score: numberValue(body.final_rank_score, 0), lead_pool: body.lead_pool === "A_ACTIONABLE" ? "A_ACTIONABLE" as const : "B_ENRICHMENT" as const, b_reasons: ["other"], opportunity_summary: stringValue(body.opportunity_summary, ""), generated_action: null, manual_action: stringValueOrNull(body.manual_action), generated_outreach: null, manual_outreach: stringValueOrNull(body.manual_outreach), action_manually_edited: Boolean(body.manual_action), outreach_manually_edited: Boolean(body.manual_outreach), manual_edit: true, manual_pool_override: body.lead_pool === "A_ACTIONABLE" ? "A_ACTIONABLE" as const : null, created_at: now, updated_at: now }; await context.stores.leads.upsertWeekly(snapshot); return c.json(snapshot, 201); });
  app.patch("/:leadId", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const current = (await context.stores.leads.list()).find((lead) => lead.id === c.req.param("leadId")); if (!current) return c.json({ error: "not_found" }, 404); const body = await jsonBody(c); const updated = { ...current, ...(typeof body.manual_action === "string" ? { manual_action: body.manual_action, action_manually_edited: true } : {}), ...(typeof body.manual_outreach === "string" ? { manual_outreach: body.manual_outreach, outreach_manually_edited: true } : {}), manual_edit: true, updated_at: new Date().toISOString() }; await context.stores.leads.upsertWeekly(updated); return c.json(updated); });
  app.post("/:leadId/promote-a", async (c) => changePool(c, context, "A_ACTIONABLE"));
  app.post("/:leadId/archive", async (c) => changePool(c, context, "ARCHIVED"));
  return app;
}

async function changePool(c: Context, context: HeadHunterApiContext, pool: WeeklyLeadSnapshot["lead_pool"]): Promise<Response> {
  const guard = requireAdmin(c, context); if (guard) return guard;
  const current = (await context.stores.leads.list()).find((lead) => lead.id === c.req.param("leadId"));
  if (!current) return c.json({ error: "not_found" }, 404);
  const updated = { ...current, lead_pool: pool, manual_pool_override: pool, manual_edit: true, updated_at: new Date().toISOString() };
  await context.stores.leads.upsertWeekly(updated); return c.json(updated);
}
function stringValue(value: unknown, fallback: string): string { return typeof value === "string" && value ? value : fallback; }
function stringValueOrNull(value: unknown): string | null { return typeof value === "string" ? value : null; }
function numberValue(value: unknown, fallback: number): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
