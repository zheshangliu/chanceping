import { Hono } from "hono";
import { readProcurementChangeFeed, renderProcurementDigestMarkdown } from "../../opportunity-v2/procurement-change-feed";
import { createProcurementFollowupStore, type FollowupStatus } from "../../opportunity-v2/procurement-followup-store";
import { readOpportunityV2Pool } from "../../opportunity-v2/opportunity-pool";
import { coverageWorkbenchDetailPage, coverageWorkbenchPage, procurementWorkbenchDetailPage, procurementWorkbenchPage, resolveWorkbenchOwner, type ProcurementWorkbenchRouteOptions } from "./procurement-workbench";

function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char)); }
function safeExternalHref(value: string | null): string { try { const url = new URL(value ?? ""); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : ""; } catch { return ""; } }

function changeFeedPage(options: ProcurementWorkbenchRouteOptions = {}): string {
  const feed = readProcurementChangeFeed(options.changeFeedPath);
  const markdown = renderProcurementDigestMarkdown(feed.events);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>采购变更摘要｜盯非遗</title><style>body{margin:0;background:#f5f0e7;color:#2d2925;font-family:Georgia,"Songti SC",serif}.wrap{max-width:960px;margin:0 auto;padding:32px 22px}a{color:#173f5f}pre{white-space:pre-wrap;line-height:1.6;border-top:1px solid #b9aa98;padding-top:22px}</style></head><body><main class="wrap"><p><a href="/ich/procurement">← 返回采购工作台</a></p><h1>采购机会变更摘要</h1><p>只记录语义变化；仅 last_seen 更新不会重复提醒。当前事件：${feed.events.length} 条。</p><pre>${escapeHtml(markdown)}</pre></main></body></html>`;
}

function privateInboxPage(options: ProcurementWorkbenchRouteOptions, ownerId: string): Promise<string> {
  const store = createProcurementFollowupStore(options.followupPath);
  const opportunityPool = options.opportunities ?? readOpportunityV2Pool().opportunities;
  const feed = readProcurementChangeFeed(options.changeFeedPath);
  return (async () => {
    const activeStatuses = new Set<FollowupStatus>(["new", "reviewing", "preparing", "submitted"]);
    const followups = (await store.list(ownerId)).filter((item) => activeStatuses.has(item.status));
    const byId = new Map(opportunityPool.map((item) => [item.id, item]));
    const followupById = new Map(followups.map((item) => [item.opportunity_id, item]));
    const readIds = await store.readEventIds(ownerId);
    const events = feed.events.filter((event) => {
      const followup = followupById.get(event.opportunity_id);
      return followup && Date.parse(event.detected_at) >= Date.parse(followup.updated_at);
    }).map((event) => ({ ...event, is_read: readIds.has(event.event_id) }));
    const eventNames: Record<string, string> = { new: "新发现", deadline_changed: "截止日期变化", application_link_changed: "申请入口变化", eligibility_changed: "资格信息变化", budget_changed: "预算变化", stage_changed: "阶段变化", cancelled: "已取消", source_degraded: "来源异常" };
    const tasks = followups.map((item) => {
      const opportunity = byId.get(item.opportunity_id);
      const due = item.next_followup_at ? new Date(item.next_followup_at) : null;
      const dueText = due && Number.isFinite(due.getTime()) ? due.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "未设跟进日期";
      return `<article class="inbox-item"><p class="kicker">跟进 · ${escapeHtml(item.status)} · ${escapeHtml(dueText)}</p><h2><a href="/ich/opportunities/${encodeURIComponent(item.opportunity_id)}">${escapeHtml(opportunity?.title ?? "机会记录暂不可用")}</a></h2><p>${escapeHtml(item.note || "暂无备注")}</p></article>`;
    }).join("");
    const changes = events.map((event) => {
      const evidenceHref = safeExternalHref(event.evidence_url);
      return `<article class="inbox-item"><p class="kicker">${escapeHtml(eventNames[event.event_type] ?? event.event_type)} · ${event.is_read ? "已读" : "未读"}</p><h2><a href="/ich/opportunities/${encodeURIComponent(event.opportunity_id)}">${escapeHtml(byId.get(event.opportunity_id)?.title ?? event.opportunity_id)}</a></h2><p>变化前：${escapeHtml(JSON.stringify(event.before) ?? "无")}</p><p>变化后：${escapeHtml(JSON.stringify(event.after) ?? "无")}</p>${evidenceHref ? `<p><a rel="nofollow noopener" href="${escapeHtml(evidenceHref)}">查看变化证据</a></p>` : ""}${event.is_read ? "" : `<button type="button" data-read-event="${escapeHtml(event.event_id)}">标记已读</button>`}</article>`;
    }).join("");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>站内待办｜盯非遗</title><style>body{margin:0;background:#f5f0e7;color:#2d2925;font-family:Georgia,"Songti SC",serif}.wrap{max-width:960px;margin:0 auto;padding:32px 22px}.inbox-item{padding:18px 0;border-bottom:1px solid #d5c9b9}.kicker{color:#8d4f35}a{color:#173f5f}p{line-height:1.6;overflow-wrap:anywhere}button{padding:9px 14px;background:#fffdf7;border:1px solid #b9aa98}@media(max-width:600px){.wrap{padding:20px 14px}}</style></head><body><main class="wrap"><p><a href="/ich/procurement">← 返回采购工作台</a></p><h1>站内待办</h1><p>只显示当前登录用户自己的跟进与已关注机会的后续变化。</p><section><h2>待跟进（${followups.length}）</h2>${tasks || "<p>暂无待跟进事项。</p>"}</section><section><h2>重要变化（${events.length}）</h2>${changes || "<p>暂无已关注机会的新变化。</p>"}</section></main><script>document.querySelectorAll('[data-read-event]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;const id=button.dataset.readEvent;const response=await fetch('/api/opportunity-v2/workbench/inbox/'+encodeURIComponent(id)+'/read',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(response.ok){button.replaceWith(document.createTextNode('已读'))}else{button.disabled=false}}));</script></body></html>`;
  })();
}

export function procurementWorkbenchPageRoutes(options: ProcurementWorkbenchRouteOptions = {}): Hono {
  const app = new Hono();
  app.get("/procurement", (c) => c.html(procurementWorkbenchPage(options)));
  app.get("/procurement/inbox", async (c) => {
    const owner = await resolveWorkbenchOwner(options, c.req.raw);
    if (!owner) return c.html(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>站内待办｜盯非遗</title><body><main><h1>站内待办</h1><p>此页面需要有效登录身份；匿名访问不会读取任何跟进、备注或用户待办。</p><p><a href="/ich/procurement">返回采购工作台</a></p></main></body></html>`, 401);
    return c.html(await privateInboxPage(options, owner));
  });
  app.get("/procurement/changes", (c) => c.html(changeFeedPage(options)));
  app.get("/procurement/:id", async (c) => {
    const owner = await resolveWorkbenchOwner(options, c.req.raw);
    const html = procurementWorkbenchDetailPage(options, c.req.param("id"), Boolean(owner));
    return c.html(html, html.includes("采购机会不存在") ? 404 : 200);
  });
  app.get("/opportunities", (c) => c.html(coverageWorkbenchPage(options, c.req.query())));
  app.get("/opportunities/:id", async (c, next) => {
    const owner = await resolveWorkbenchOwner(options, c.req.raw);
    const html = coverageWorkbenchDetailPage(options, c.req.param("id"), Boolean(owner));
    if (html.includes("综合机会不存在")) return next();
    return c.html(html, 200);
  });
  return app;
}
