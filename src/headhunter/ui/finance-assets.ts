export const FINANCE_CSS = `
:root { color-scheme: light; --ink:#172033; --muted:#667085; --line:#e4e7ec; --accent:#155eef; --surface:#fff; --bg:#f7f9fc; }
* { box-sizing:border-box; } body { margin:0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); }
.finance-shell { min-height:100vh; display:flex; } .finance-nav { width:240px; padding:24px 16px; background:#101828; color:#fff; } .finance-nav h1 { font-size:18px; margin:0 8px 24px; } .finance-nav a { display:block; color:#d0d5dd; text-decoration:none; padding:10px 12px; border-radius:8px; margin:4px 0; } .finance-nav a:hover,.finance-nav a.active { background:#1d2939; color:#fff; }
.finance-main { flex:1; padding:32px; max-width:1280px; } .finance-header { display:flex; justify-content:space-between; gap:16px; align-items:center; margin-bottom:24px; } .finance-header h2 { margin:0; } .finance-card { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:16px; box-shadow:0 1px 2px #1018280d; } .finance-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; } .finance-muted { color:var(--muted); } .finance-button { border:0; border-radius:8px; background:var(--accent); color:#fff; padding:9px 14px; cursor:pointer; } .finance-login { max-width:420px; margin:12vh auto; } .finance-login input { display:block; width:100%; padding:11px; border:1px solid var(--line); border-radius:8px; margin:8px 0 16px; } .finance-live-list { margin-top:18px; } .finance-live-row { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:14px 0; border-top:1px solid var(--line); } .finance-live-row p { margin:6px 0 0; } .finance-badge { white-space:nowrap; color:var(--accent); font-weight:600; } .finance-empty { padding:22px; border:1px dashed var(--line); color:var(--muted); text-align:center; }
@media (max-width: 720px) { .finance-shell { display:block; } .finance-nav { width:auto; padding:12px; position:sticky; top:0; z-index:2; } .finance-nav h1 { margin:4px 8px 8px; } .finance-nav a { display:inline-block; padding:8px; font-size:13px; } .finance-main { padding:16px; } .finance-header { display:block; } }
`;

export const FINANCE_JS = `
(async function () {
  const session = await fetch('/api/finance/auth/session').catch(() => null);
  if (session && session.status === 401 && location.pathname !== '/login') location.href = '/login';
  const logout = document.querySelector('[data-finance-logout]');
  if (logout) logout.addEventListener('click', async () => { await fetch('/api/finance/auth/logout', { method:'POST' }); location.href='/login'; });
  const copy = document.querySelectorAll('[data-copy]'); copy.forEach((button) => button.addEventListener('click', async () => { await navigator.clipboard.writeText(button.getAttribute('data-copy') || ''); button.textContent='已复制'; }));
  const live = document.querySelector('#finance-live-data');
  if (!live) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fetchJson = async (path) => { const response = await fetch(path); if (!response.ok) throw new Error(path + ' (' + response.status + ')'); return response.json(); };
  const empty = (message) => { live.innerHTML = '<div class="finance-empty">' + esc(message) + '</div>'; };
  const leadRows = (leads, companies) => {
    const names = new Map((Array.isArray(companies) ? companies : []).map((company) => [company.company_id, company.canonical_name]));
    return (Array.isArray(leads) ? leads : []).map((lead) => '<article class="finance-live-row"><div><strong>' + esc(names.get(lead.company_id) || lead.company_id) + '</strong><p class="finance-muted">' + esc(lead.opportunity_summary || lead.b_reasons?.join(' · ') || '待补证据与联系人') + '</p></div><span class="finance-badge">' + esc(lead.lead_pool === 'A_ACTIONABLE' ? 'A级' : lead.lead_pool === 'B_ENRICHMENT' ? 'B级' : lead.lead_pool) + ' · ' + esc(lead.final_rank_score ?? 0) + '</span></article>').join('');
  };
  try {
    const pathname = location.pathname;
    if (pathname === '/weekly') {
      const [snapshot, companies] = await Promise.all([fetchJson('/api/finance/weekly/current'), fetchJson('/api/finance/companies')]);
      if (!snapshot) return empty('暂无已发布周报');
      const leads = snapshot.leads || [];
      const a = leads.filter((lead) => lead.lead_pool === 'A_ACTIONABLE').length;
      const b = leads.filter((lead) => lead.lead_pool === 'B_ENRICHMENT').length;
      live.innerHTML = '<h3>第 ' + esc(snapshot.week_key) + ' 周报</h3><div class="finance-grid"><article><strong>' + a + '</strong><p>A 级机会</p></article><article><strong>' + b + '</strong><p>B 级情报</p></article><article><strong>' + leads.length + '</strong><p>线索总数</p></article></div><div class="finance-live-list">' + (leadRows(leads, companies) || '<div class="finance-empty">本期没有线索</div>') + '</div>';
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
