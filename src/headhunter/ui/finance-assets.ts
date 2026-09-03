export const FINANCE_CSS = `
:root { color-scheme: light; --ink:#172033; --muted:#667085; --line:#e4e7ec; --accent:#155eef; --surface:#fff; --bg:#f7f9fc; }
* { box-sizing:border-box; } body { margin:0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); }
.finance-shell { min-height:100vh; display:flex; } .finance-nav { width:240px; padding:24px 16px; background:#101828; color:#fff; } .finance-nav h1 { font-size:18px; margin:0 8px 24px; } .finance-nav a { display:block; color:#d0d5dd; text-decoration:none; padding:10px 12px; border-radius:8px; margin:4px 0; } .finance-nav a:hover,.finance-nav a.active { background:#1d2939; color:#fff; }
.finance-main { flex:1; padding:32px; max-width:1280px; } .finance-header { display:flex; justify-content:space-between; gap:16px; align-items:center; margin-bottom:24px; } .finance-header h2 { margin:0; } .finance-card { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:16px; box-shadow:0 1px 2px #1018280d; } .finance-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; } .finance-muted { color:var(--muted); } .finance-button { border:0; border-radius:8px; background:var(--accent); color:#fff; padding:9px 14px; cursor:pointer; } .finance-link { display:inline-block; text-decoration:none; font-size:13px; padding:5px 8px; } .finance-login { max-width:420px; margin:12vh auto; } .finance-login input { display:block; width:100%; padding:11px; border:1px solid var(--line); border-radius:8px; margin:8px 0 16px; } .finance-live-list { margin-top:18px; } .finance-live-row { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:14px 0; border-top:1px solid var(--line); } .finance-live-row p { margin:6px 0 0; } .finance-lead-card { border:1px solid var(--line); border-radius:10px; padding:18px; margin:14px 0; } .finance-lead-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; } .finance-lead-header h4 { margin:0; font-size:18px; } .finance-lead-details { display:grid; grid-template-columns:180px 1fr; gap:10px 18px; margin:18px 0; } .finance-lead-details dt { color:var(--muted); font-weight:600; } .finance-lead-details dd { margin:0; line-height:1.6; } .finance-lead-details ul,.finance-evidence ul { margin:0; padding-left:20px; } .finance-lead-details blockquote { margin:0 0 10px; padding:10px 12px; background:var(--bg); border-left:3px solid var(--accent); white-space:pre-wrap; } .finance-evidence { border-top:1px solid var(--line); padding-top:12px; } .finance-evidence summary { cursor:pointer; color:var(--accent); } .finance-lead-card footer { border-top:1px solid var(--line); padding-top:12px; margin-top:12px; } .finance-badge { white-space:nowrap; color:var(--accent); font-weight:600; } .finance-funnel { margin-top:18px; } .finance-funnel article { padding:12px; border:1px solid var(--line); border-radius:8px; } .finance-blockers { color:#b54708; } .finance-empty { padding:22px; border:1px dashed var(--line); color:var(--muted); text-align:center; }
@media (max-width: 720px) { .finance-shell { display:block; } .finance-nav { width:auto; padding:12px; position:sticky; top:0; z-index:2; } .finance-nav h1 { margin:4px 8px 8px; } .finance-nav a { display:inline-block; padding:8px; font-size:13px; } .finance-main { padding:16px; } .finance-header { display:block; } }
`;

export const FINANCE_JS = `
(async function () {
  const session = await fetch('/api/finance/auth/session').catch(() => null);
  if (session && session.status === 401 && location.pathname !== '/login') location.href = '/login';
  const logout = document.querySelector('[data-finance-logout]');
  if (logout) logout.addEventListener('click', async () => { await fetch('/api/finance/auth/logout', { method:'POST' }); location.href='/login'; });
  document.addEventListener('click', async (event) => { const button = event.target.closest('[data-copy]'); if (!button) return; await navigator.clipboard.writeText(button.getAttribute('data-copy') || ''); button.textContent='已复制'; });
  const live = document.querySelector('#finance-live-data');
  if (!live) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fetchJson = async (path) => { const response = await fetch(path); if (!response.ok) throw new Error(path + ' (' + response.status + ')'); return response.json(); };
  const empty = (message) => { live.innerHTML = '<div class="finance-empty">' + esc(message) + '</div>'; };
  const link = (url, label) => url ? '<a class="finance-button finance-link" href="' + esc(url) + '" target="_blank" rel="noreferrer">' + esc(label) + '</a>' : '';
  const leadRows = (leads, companies) => {
    const names = new Map((Array.isArray(companies) ? companies : []).map((company) => [company.company_id, company.canonical_name]));
    return (Array.isArray(leads) ? leads : []).map((lead) => {
      const evidence = (lead.evidences || []).filter((item) => item.source_url).map((item) => '<li><a href="' + esc(item.source_url) + '" target="_blank" rel="noreferrer">' + esc(item.title || '查看原文') + '</a><span class="finance-muted"> · ' + esc(item.source_name) + (item.published_at ? ' · ' + esc(item.published_at) : '') + '</span></li>').join('');
      const contacts = [...(lead.contacts || []).filter((item) => item.url || item.email || item.phone).map((item) => '<li>' + esc(item.name || item.title || item.contact_type) + ' ' + link(item.url, '查看 LinkedIn') + (item.email ? ' <a href="mailto:' + esc(item.email) + '">发送邮件</a>' : '') + (item.phone ? ' <a href="tel:' + esc(item.phone) + '">拨打电话</a>' : '') + '</li>'), ...(lead.official_contact_entries || []).map((item) => '<li>' + esc(item.label) + ' ' + (item.url ? link(item.url, item.type === 'careers_entry' ? '打开招聘页' : '打开官网联系页') : item.email ? '<a href="mailto:' + esc(item.email) + '">发送邮件</a>' : item.phone ? '<a href="tel:' + esc(item.phone) + '">拨打电话</a>' : '') + '</li>')].join('');
      const script = lead.manual_outreach || lead.first_touch_script_zh || lead.generated_outreach || '';
      return '<article class="finance-lead-card"><header class="finance-lead-header"><div><h4>' + esc(lead.company_name || names.get(lead.company_id) || lead.company_id) + '</h4><p class="finance-muted">' + esc([lead.industry, lead.region].filter(Boolean).join(' · ')) + '</p></div><span class="finance-badge">' + esc(lead.lead_pool === 'A_ACTIONABLE' ? 'A级' : lead.lead_pool === 'B_ENRICHMENT' ? 'B级情报池' : lead.lead_pool) + ' · ' + esc(lead.final_rank_score ?? 0) + '</span></header>' +
        '<dl class="finance-lead-details"><dt>为什么现在</dt><dd>' + esc(lead.why_now_zh || lead.opportunity_summary || '待补充业务解释') + '</dd><dt>主要触发事件</dt><dd>' + esc(lead.trigger_summary_zh || '待补充触发事件') + (lead.primary_trigger?.source_url ? ' ' + link(lead.primary_trigger.source_url, '查看原文') : '') + '</dd><dt>潜在人才需求</dt><dd>' + esc(lead.talent_need_zh || '待补充') + '</dd><dt>建议联系人 / 联系入口</dt><dd>' + (contacts ? '<ul>' + contacts + '</ul>' : '<span class="finance-muted">暂无可验证联系入口</span>') + '</dd><dt>维优服务切口</dt><dd>' + esc(lead.service_wedge_zh || '待补充') + '</dd><dt>本周行动</dt><dd>' + esc(lead.manual_action || lead.bd_action_zh || lead.generated_action || '待补充') + '</dd><dt>首触话术</dt><dd><blockquote>' + esc(script || '暂无首触话术') + '</blockquote>' + (script ? '<button class="finance-button" data-copy="' + esc(script) + '">复制话术</button>' : '') + '</dd></dl>' +
        (evidence ? '<details class="finance-evidence"><summary>证据 ' + esc(lead.evidence_count ?? lead.evidences?.length ?? 0) + ' 条 · 查看全部原文</summary><ul>' + evidence + '</ul></details>' : '<p class="finance-muted">暂无可验证原文</p>') +
        '<footer class="finance-muted">BusinessScore ' + esc(lead.business_score) + ' · Freshness ' + esc(lead.freshness_score) + ' · 更新时间 ' + esc(lead.updated_at || '') + (lead.lead_pool === 'B_ENRICHMENT' && (lead.b_reasons || []).length ? '<br><span class="finance-blockers">尚未进入 A：' + esc((lead.b_reasons || []).join('、')) + '</span>' : '') + '</footer></article>';
    }).join('');
  };
  try {
    const pathname = location.pathname;
    if (pathname === '/weekly') {
      const [snapshot, companies] = await Promise.all([fetchJson('/api/finance/weekly/current'), fetchJson('/api/finance/companies')]);
      if (!snapshot) return empty('暂无已发布周报');
      const leads = snapshot.leads || [];
      const a = leads.filter((lead) => lead.lead_pool === 'A_ACTIONABLE').length;
      const b = leads.filter((lead) => lead.lead_pool === 'B_ENRICHMENT').length;
      const funnel = snapshot.funnel_metrics || {};
      const funnelKeys = [['candidate_url_count','候选网页'],['company_candidate_count','企业候选'],['company_resolved_count','确认企业'],['signal_count','有效 Trigger'],['job_count','岗位'],['person_candidate_count','人员候选'],['contact_count','公开联系入口'],['need_count','人才需求'],['a_count','A 级'],['b_count','B 级']];
      const funnelHtml = funnelKeys.map(([key,label]) => '<article><strong>' + esc(funnel[key] ?? 0) + '</strong><p>' + esc(label) + '</p></article>').join('');
      const blockers = Object.entries(funnel.blocking_reasons || {}).sort(([,x],[,y]) => y - x).map(([key,value]) => '<li>' + esc(key) + '：' + esc(value) + '</li>').join('');
      live.innerHTML = '<h3>第 ' + esc(snapshot.week_key) + ' 周报</h3><div class="finance-grid"><article><strong>' + a + '</strong><p>A 级机会</p></article><article><strong>' + b + '</strong><p>B 级情报</p></article><article><strong>' + leads.length + '</strong><p>线索总数</p></article></div><section class="finance-funnel"><h4>本周雷达结果解释</h4><div class="finance-grid">' + funnelHtml + '</div>' + (a === 0 && blockers ? '<p class="finance-blockers">本周暂无达到“立即联系”标准的企业，主要阻塞原因：</p><ul class="finance-blockers">' + blockers + '</ul>' : '') + '</section><div class="finance-live-list">' + (leadRows(leads, companies) || '<div class="finance-empty">本期没有线索</div>') + '</div>';
    } else if (pathname === '/leads/a' || pathname === '/leads/b') {
      const [leads, companies] = await Promise.all([fetchJson('/api/finance/leads/' + (pathname.endsWith('/a') ? 'a' : 'b')), fetchJson('/api/finance/companies')]);
      live.innerHTML = '<h3>' + (pathname.endsWith('/a') ? 'A级机会' : 'B级情报池') + '（' + leads.length + '）</h3><div class="finance-live-list">' + (leadRows(leads, companies) || '<div class="finance-empty">暂无数据</div>') + '</div>';
    } else if (pathname === '/companies') {
      const companies = await fetchJson('/api/finance/companies');
      live.innerHTML = '<h3>公司库（' + companies.length + '）</h3><div class="finance-live-list">' + (companies.map((company) => '<article class="finance-live-row"><div><strong>' + esc(company.canonical_name) + '</strong><p class="finance-muted">' + esc(company.target_segment) + ' · ' + esc(company.status) + '</p></div><a href="' + esc(company.website || '#') + '" target="_blank" rel="noreferrer">来源</a></article>').join('') || '<div class="finance-empty">暂无公司</div>') + '</div>';
    } else if (pathname === '/runs') {
      const runs = await fetchJson('/api/finance/runs');
      live.innerHTML = '<h3>雷达运行（' + runs.length + '）</h3><div class="finance-live-list">' + (runs.map((run) => '<article class="finance-live-row"><div><strong>' + esc(run.radar_run_id) + '</strong><p class="finance-muted">' + esc(run.status) + ' · 公司 ' + esc(run.company_count) + ' · 线索 ' + esc(run.lead_count) + '</p></div><span class="finance-badge">' + esc(run.trigger_type) + '</span></article>').join('') || '<div class="finance-empty">暂无运行记录</div>') + '</div>';
    } else if (pathname === '/trends') {
      const trends = await fetchJson('/api/finance/trends');
      live.innerHTML = '<h3>趋势（' + trends.length + '）</h3><div class="finance-live-list">' + (trends.map((trend) => '<article class="finance-live-row"><div><strong>' + esc(trend.title) + '</strong><p class="finance-muted">' + esc(trend.summary) + '</p></div></article>').join('') || '<div class="finance-empty">暂无趋势</div>') + '</div>';
    }
  } catch (error) { empty('数据加载失败：' + (error?.message || '未知错误')); }
})();
`;
