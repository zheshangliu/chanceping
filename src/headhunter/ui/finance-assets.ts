export const FINANCE_CSS = `
:root { color-scheme: light; --ink:#172033; --muted:#667085; --line:#e4e7ec; --accent:#155eef; --surface:#fff; --bg:#f7f9fc; }
* { box-sizing:border-box; } body { margin:0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); }
.finance-shell { min-height:100vh; display:flex; } .finance-nav { width:240px; padding:24px 16px; background:#101828; color:#fff; } .finance-nav h1 { font-size:18px; margin:0 8px 24px; } .finance-nav a { display:block; color:#d0d5dd; text-decoration:none; padding:10px 12px; border-radius:8px; margin:4px 0; } .finance-nav a:hover,.finance-nav a.active { background:#1d2939; color:#fff; }
.finance-main { flex:1; padding:32px; max-width:1280px; } .finance-header { display:flex; justify-content:space-between; gap:16px; align-items:center; margin-bottom:24px; } .finance-header h2 { margin:0; } .finance-card { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:16px; box-shadow:0 1px 2px #1018280d; } .finance-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; } .finance-muted { color:var(--muted); } .finance-button { border:0; border-radius:8px; background:var(--accent); color:#fff; padding:9px 14px; cursor:pointer; } .finance-login { max-width:420px; margin:12vh auto; } .finance-login input { display:block; width:100%; padding:11px; border:1px solid var(--line); border-radius:8px; margin:8px 0 16px; }
@media (max-width: 720px) { .finance-shell { display:block; } .finance-nav { width:auto; padding:12px; position:sticky; top:0; z-index:2; } .finance-nav h1 { margin:4px 8px 8px; } .finance-nav a { display:inline-block; padding:8px; font-size:13px; } .finance-main { padding:16px; } .finance-header { display:block; } }
`;

export const FINANCE_JS = `
(async function () {
  const session = await fetch('/api/finance/auth/session').catch(() => null);
  if (session && session.status === 401 && location.pathname !== '/login') location.href = '/login';
  const logout = document.querySelector('[data-finance-logout]');
  if (logout) logout.addEventListener('click', async () => { await fetch('/api/finance/auth/logout', { method:'POST' }); location.href='/login'; });
  const copy = document.querySelectorAll('[data-copy]'); copy.forEach((button) => button.addEventListener('click', async () => { await navigator.clipboard.writeText(button.getAttribute('data-copy') || ''); button.textContent='已复制'; }));
})();
`;
