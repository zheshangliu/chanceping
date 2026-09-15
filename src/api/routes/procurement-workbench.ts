import { Hono } from "hono";
import { filterOpportunityV2Radar, readOpportunityV2Pool, readOpportunityV2Sources, type OpportunityV2Fetcher } from "../../opportunity-v2";
import { hasProcurementDomainTag, isCraftRelevantProcurement } from "../../opportunity-v2/procurement";
import { assessProcurement, publicWorkbenchAssessment, type ProcurementBusinessProfile, type WorkbenchAssessment } from "../../opportunity-v2/procurement-workbench";
import { createProcurementFollowupStore, type FollowupStatus } from "../../opportunity-v2/procurement-followup-store";
import { readProcurementChangeFeed } from "../../opportunity-v2/procurement-change-feed";
import { renderProcurementCsv, renderProcurementMarkdown } from "../../opportunity-v2/procurement-export";
import type { OpportunityV2, OpportunityV2Source } from "../../opportunity-v2/types";

export interface ProcurementWorkbenchRouteOptions {
  opportunities?: OpportunityV2[];
  sources?: OpportunityV2Source[];
  profile?: ProcurementBusinessProfile;
  followupPath?: string;
  changeFeedPath?: string;
  fetcher?: OpportunityV2Fetcher;
  now?: Date;
}

const FALLBACK_PROFILE: ProcurementBusinessProfile = {
  profile_id: "default-procurement-profile",
  approved_domain_tags: ["文创产品", "非遗活动", "礼赠", "展陈", "文化服务", "绿植", "花艺", "活动执行", "文旅推广", "传统文化体验"],
  geo_preferences: { onsite_first: ["广州"], onsite_secondary: ["佛山", "东莞", "深圳", "珠海", "中山", "惠州", "江门", "肇庆"], goods_shipping_preferred: ["CN"] },
  qualification_facts: { default_eligibility: "NEEDS_REVIEW", verified_licenses: [] },
  hard_negative_domains: ["纯建筑土建装修", "普通IT/软件运维/硬件设备", "保洁餐饮安保", "一般工业生产工艺与原材料"],
  weights: { domain: 40, delivery_geo: 25, delivery_form: 15, evidence: 10, stage: 10 },
};

function bodyOf(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> { return c.req.json().catch(() => ({})) as Promise<Record<string, unknown>>; }
function publicProcurementItems(opportunities: OpportunityV2[], sources: OpportunityV2Source[]): OpportunityV2[] {
  const sourceIds = new Set(sources.filter((source) => source.enabled && !["PAUSED", "NEEDS_ADAPTER"].includes(source.status)).map((source) => source.id));
  return opportunities.filter((item) => sourceIds.has(item.source_id)).filter((item) => item.category === "procurement_project").filter((item) => !item.encoding_error && item.procurement?.direction !== "seller_offer").filter((item) => hasProcurementDomainTag(item.tags) && isCraftRelevantProcurement(`${item.title} ${item.summary} ${item.tags.join(" ")}`));
}

function queryFilter(items: WorkbenchAssessment[], query: Record<string, string>): WorkbenchAssessment[] {
  const q = query.q?.trim().toLowerCase();
  return items.filter((item) => !query.lane || item.lane === query.lane).filter((item) => !query.region || item.opportunity.region === query.region).filter((item) => !query.domain || item.opportunity.tags.some((tag) => tag.includes(query.domain))).filter((item) => !q || `${item.opportunity.title} ${item.opportunity.summary} ${item.opportunity.procurement?.buyer_name ?? ""}`.toLowerCase().includes(q));
}

function buildAssessments(options: ProcurementWorkbenchRouteOptions): WorkbenchAssessment[] {
  const opportunities = options.opportunities ?? readOpportunityV2Pool().opportunities;
  const sources = options.sources ?? readOpportunityV2Sources();
  const profile = options.profile ?? FALLBACK_PROFILE;
  return publicProcurementItems(opportunities, sources).map((item) => assessProcurement(item, profile, { now: options.now })).filter((item) => item.lane !== "excluded");
}

function ownerOf(c: { req: { header: (name: string) => string | undefined } }): string { return c.req.header("x-business-user")?.trim() ?? ""; }
function unauthorized(): Response { return new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "需要登录用户身份" } }), { status: 401, headers: { "content-type": "application/json" } }); }

export function procurementWorkbenchRoutes(options: ProcurementWorkbenchRouteOptions = {}): Hono {
  const app = new Hono();
  const store = createProcurementFollowupStore(options.followupPath);
  app.get("/opportunities", (c) => {
    const items = queryFilter(buildAssessments(options), c.req.query());
    return c.json({ schema_version: "chanceping-procurement-workbench.v1", total: items.length, opportunities: items.map(publicWorkbenchAssessment) });
  });
  app.get("/opportunities/:id", (c) => {
    const item = buildAssessments(options).find((candidate) => candidate.opportunity_id === c.req.param("id"));
    if (!item) return c.json({ error: { code: "NOT_FOUND", message: "采购机会不存在" } }, 404);
    return c.json(publicWorkbenchAssessment(item));
  });
  app.get("/export", (c) => {
    const items = queryFilter(buildAssessments(options), c.req.query());
    const format = c.req.query("format") === "csv" ? "csv" : "markdown";
    if (format === "csv") return new Response(renderProcurementCsv(items), { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=procurement-workbench.csv" } });
    return new Response(renderProcurementMarkdown(items), { status: 200, headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": "attachment; filename=procurement-workbench.md" } });
  });
  app.get("/changes", (c) => c.json(readProcurementChangeFeed(options.changeFeedPath)));
  app.get("/followups/:id", async (c) => {
    const owner = ownerOf(c); if (!owner) return unauthorized();
    return c.json({ followup: await store.get(owner, c.req.param("id")) });
  });
  app.get("/followups", async (c) => {
    const owner = ownerOf(c); if (!owner) return unauthorized();
    return c.json({ followups: await store.list(owner) });
  });
  app.post("/followups", async (c) => {
    const owner = ownerOf(c); if (!owner) return unauthorized();
    try {
      const body = await bodyOf(c);
      const record = await store.upsert({ owner_id: owner, opportunity_id: String(body.opportunity_id ?? ""), status: String(body.status ?? "new") as FollowupStatus, note: typeof body.note === "string" ? body.note : "", next_followup_at: body.next_followup_at == null ? null : String(body.next_followup_at) });
      return c.json({ followup: record }, 201);
    } catch (error) { return c.json({ error: { code: "INVALID_FOLLOWUP", message: error instanceof Error ? error.message : String(error) } }, 400); }
  });
  return app;
}

export function procurementWorkbenchPage(options: ProcurementWorkbenchRouteOptions = {}): string {
  const items = buildAssessments(options);
  const section = (lane: "current" | "early" | "research", heading: string, hint: string) => {
    const rows = items.filter((item) => item.lane === lane).slice(0, 20).map((item) => `<article class="pw-card"><span class="pw-lane">${item.business_fit} · ${item.opportunity.procurement?.stage ?? "unknown"}</span><h2><a href="/ich/procurement/${encodeURIComponent(item.opportunity_id)}">${escapeHtml(item.opportunity.title)}</a></h2><p>${escapeHtml(item.opportunity.summary || "来源未提供摘要")}</p><div class="pw-meta"><span>买方：${escapeHtml(item.opportunity.procurement?.buyer_name ?? "待确认")}</span><span>地区：${escapeHtml(item.opportunity.event_location || item.opportunity.region)}</span><span>截止：${escapeHtml(item.opportunity.deadline_conflict_unsafe ? "截止时间待核实" : item.opportunity.deadline ?? "待确认")}</span></div><p class="pw-next">下一步：${escapeHtml(item.next_action)}</p></article>`).join("");
    return `<section class="pw-section"><div><p class="pw-kicker">${heading}</p><p class="pw-hint">${hint}</p></div>${rows || `<p class="pw-empty">当前没有可展示记录。</p>`}</section>`;
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>采购机会工作台｜盯非遗</title><style>${pageStyle()}</style></head><body><main class="pw-wrap"><header class="pw-hero"><a href="/ich"><img src="/assets/dingfeiyi-logo.png" alt="盯非遗"></a><div><p class="pw-kicker">盯非遗 · 采购 / 订单</p><h1>采购机会工作台</h1><p>回答谁在采购、采购什么、在哪里交付，以及下一步该核验什么。</p></div><a class="pw-export" href="/api/opportunity-v2/workbench/export?format=markdown">导出 Markdown</a></header><form class="pw-filter" method="get"><input name="q" placeholder="搜索买方、标的或关键词"><select name="lane"><option value="">全部分区</option><option value="current">当前采购</option><option value="early">提前跟进</option><option value="research">历史研究</option></select><button>筛选</button></form>${section("current", "当前采购", "仍开放的真实买方需求；打开官方公告核验资格与附件。")}${section("early", "提前跟进", "采购意向、预审与持续征集，不写成已可投标。")}${section("research", "历史研究", "关闭或中标记录仅用于了解买方周期，默认不作为当前订单。")}</main></body></html>`;
}

export function procurementWorkbenchDetailPage(options: ProcurementWorkbenchRouteOptions = {}, opportunityId: string): string {
  const item = buildAssessments(options).find((candidate) => candidate.opportunity_id === opportunityId);
  if (!item) return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>采购机会不存在</title><body><main class="pw-wrap"><h1>采购机会不存在</h1><p><a href="/ich/procurement">返回工作台</a></p></main></body></html>`;
  const opportunity = item.opportunity;
  const publicDeadline = opportunity.deadline_conflict_unsafe ? "截止时间待核实" : opportunity.deadline ?? "待确认";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(opportunity.title)}｜采购机会</title><style>${pageStyle()}</style></head><body><main class="pw-wrap"><p><a href="/ich/procurement">← 返回采购机会工作台</a></p><article class="pw-detail"><p class="pw-kicker">${escapeHtml(item.lane)} · ${escapeHtml(item.business_fit)}</p><h1>${escapeHtml(opportunity.title)}</h1><p>${escapeHtml(opportunity.summary || "来源未提供摘要")}</p><dl class="pw-detail-list"><dt>买方</dt><dd>${escapeHtml(opportunity.procurement?.buyer_name ?? "待确认")}</dd><dt>地区 / 履约</dt><dd>${escapeHtml(opportunity.event_location || opportunity.region)}${opportunity.participation_mode ? ` · ${escapeHtml(opportunity.participation_mode)}` : ""}</dd><dt>预算</dt><dd>${escapeHtml(opportunity.procurement?.budget_amount == null ? "公告未明确" : `${opportunity.procurement.budget_amount} ${opportunity.procurement.budget_currency ?? ""}`)}</dd><dt>截止</dt><dd>${escapeHtml(publicDeadline)}</dd><dt>资格状态</dt><dd>${escapeHtml(item.eligibility_status)}；${escapeHtml(item.missing_requirements.join("、"))}</dd></dl><h2>适配依据</h2><ul>${item.fit_reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>待人工判断</li>"}</ul><h2>履约提示</h2><ul>${item.delivery_caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("") || "<li>暂无额外提示</li>"}</ul><p><strong>下一步：</strong>${escapeHtml(item.next_action)}</p><p><a rel="nofollow noopener" href="${escapeHtml(opportunity.detail_url || opportunity.source_url)}">打开官方公告</a></p><h2>保存私有跟进</h2><p>需由已授权业务用户调用工作台 API；公开页面不会显示备注。</p><form id="followup-form"><label>用户标识 <input name="owner" required autocomplete="username"></label><label>状态 <select name="status"><option>new</option><option>reviewing</option><option>preparing</option><option>submitted</option><option>ignored</option><option>won</option><option>lost</option></select></label><label>备注 <textarea name="note" maxlength="4000"></textarea></label><label>下次跟进 <input type="date" name="next_followup_at"></label><button>保存跟进</button><span id="followup-result" role="status"></span></form><script>document.getElementById('followup-form').addEventListener('submit',async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget),owner=String(f.get('owner')||'').trim();const r=await fetch('/api/opportunity-v2/workbench/followups',{method:'POST',headers:{'content-type':'application/json','x-business-user':owner},body:JSON.stringify({opportunity_id:${JSON.stringify(opportunityId)},status:f.get('status'),note:f.get('note'),next_followup_at:f.get('next_followup_at')||null})});document.getElementById('followup-result').textContent=r.ok?'已保存':'保存失败，请检查授权';});</script></article></main></body></html>`;
}

function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char)); }
function pageStyle(): string { return `.pw-wrap{max-width:1120px;margin:0 auto;padding:32px 22px;color:#2d2925;background:#f5f0e7;font-family:Georgia,"Songti SC",serif}.pw-hero{display:grid;grid-template-columns:auto 1fr auto;gap:24px;align-items:center;border-bottom:1px solid #b9aa98;padding-bottom:28px}.pw-hero img{width:auto;height:42px;object-fit:contain}.pw-kicker{color:#8d4f35;letter-spacing:.08em;text-transform:uppercase}.pw-hero h1{margin:4px 0;font-size:clamp(30px,5vw,54px);font-weight:500}.pw-hero p{color:#6c625a}.pw-export{color:#173f5f}.pw-filter{display:flex;gap:10px;margin:22px 0}.pw-filter input,.pw-filter select,.pw-filter button,.pw-detail input,.pw-detail select,.pw-detail textarea,.pw-detail button{padding:11px;border:1px solid #b9aa98;background:#fffdf7}.pw-section{margin:30px 0}.pw-section>div{display:flex;gap:18px;align-items:baseline;border-bottom:1px solid #d5c9b9}.pw-hint,.pw-empty{color:#746b62}.pw-card{padding:18px 0;border-bottom:1px solid #d5c9b9}.pw-card h2{margin:8px 0;font-size:24px}.pw-card a,.pw-detail a{color:#173f5f}.pw-card p,.pw-detail p{max-width:800px;line-height:1.6}.pw-meta{display:flex;flex-wrap:wrap;gap:18px;color:#6c625a;font-size:14px}.pw-lane{color:#8d4f35;font-size:13px;letter-spacing:.06em}.pw-next{color:#385b4a}.pw-detail{border-top:1px solid #b9aa98;padding-top:22px}.pw-detail h1{font-size:clamp(30px,5vw,54px);font-weight:500}.pw-detail-list{display:grid;grid-template-columns:150px 1fr;gap:0;border-top:1px solid #d5c9b9}.pw-detail-list dt,.pw-detail-list dd{margin:0;padding:12px 0;border-bottom:1px solid #d5c9b9}.pw-detail-list dt{color:#8d4f35}.pw-detail form{display:grid;gap:10px;max-width:560px}.pw-detail label{display:grid;gap:5px}.pw-detail textarea{min-height:100px}.pw-detail button{width:max-content}.pw-detail [role=status]{margin-left:10px}@media(max-width:680px){.pw-wrap{padding:20px 14px}.pw-hero{grid-template-columns:1fr;gap:12px}.pw-hero img{height:32px}.pw-filter{flex-wrap:wrap}.pw-filter>*{min-width:0;flex:1}.pw-meta{display:grid;gap:5px}.pw-detail-list{grid-template-columns:1fr}.pw-detail-list dt{border-bottom:0;padding-bottom:3px}.pw-detail-list dd{padding-top:0}}`; }
