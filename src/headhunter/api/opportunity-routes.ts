import { Hono } from "hono";
import type { HeadHunterApiContext } from "./context";
import { requireAdmin, jsonBody } from "./route-utils";
import { isOpportunityWorkflowStatus, type OpportunityRecord } from "../model/opportunity";

export function opportunityRoutes(context: HeadHunterApiContext): Hono {
  const app = new Hono();
  app.get("/", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; return c.json(await context.stores.opportunities.list()); });
  app.get("/:opportunityId", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const item = await resolveOpportunity(context, c.req.param("opportunityId")); return item ? c.json(item) : c.json({ error: "not_found" }, 404); });
  app.patch("/:opportunityId/status", async (c) => { const guard = requireAdmin(c, context); if (guard) return guard; const item = await resolveOpportunity(context, c.req.param("opportunityId")); if (!item) return c.json({ error: "not_found" }, 404); const body = await jsonBody(c); if (typeof body.status !== "string" || !isOpportunityWorkflowStatus(body.status)) return c.json({ error: "invalid_status" }, 400); const note = typeof body.note === "string" ? body.note.trim() : ""; const follow_up_notes = note ? [...(item.follow_up_notes || []), { text: note, created_at: new Date().toISOString() }] : item.follow_up_notes; const updated = { ...item, status: body.status, follow_up_notes, updated_at: new Date().toISOString() }; await context.stores.opportunities.upsert(updated); return c.json(updated); });
  return app;
}

async function resolveOpportunity(context: HeadHunterApiContext, opportunityId: string): Promise<OpportunityRecord | null> {
  const stored = await context.stores.opportunities.get(opportunityId);
  if (stored) return stored;
  const leadId = opportunityId.startsWith("lead-") ? opportunityId.slice(5) : opportunityId;
  const snapshots = await context.stores.weeklySnapshots.list();
  for (const snapshot of snapshots.filter((row) => row.published)) {
    const lead = snapshot.leads.find((candidate) => candidate.id === leadId);
    if (!lead) continue;
    const now = new Date().toISOString();
    return {
      opportunity_id: `lead-${lead.id}`, company_id: lead.company_id || `lead-company-${lead.id}`, weekly_snapshot_id: snapshot.weekly_snapshot_id,
      signal_ids: lead.primary_trigger_id ? [lead.primary_trigger_id] : [], primary_signal_id: lead.primary_trigger_id || null,
      signal_type: "hiring", title: lead.company_name || "机会", why_now: lead.why_now_zh || lead.opportunity_summary || "待补充",
      business_driver: lead.business_driver_zh || lead.trigger_summary_zh || "待补充", talent_need: lead.talent_need_zh || "待补充",
      recommended_contact_id: lead.contacts?.find((contact) => contact.url || contact.email || contact.phone)?.contact_id || null,
      next_action: lead.manual_action || lead.bd_action_zh || lead.generated_action || "安排一次确认沟通",
      evidence_ids: (lead.evidences || []).map((evidence) => evidence.evidence_id), status: lead.lead_pool === "A_ACTIONABLE" ? "ready_to_contact" : "discovered",
      score: lead.final_rank_score || 0, contactable: Boolean((lead.contacts || []).some((contact) => contact.url || contact.email || contact.phone)),
      human_review_status: lead.business_review_status === "human_approved" ? "approved" : "pending", created_at: now, updated_at: now,
    };
  }
  return null;
}
