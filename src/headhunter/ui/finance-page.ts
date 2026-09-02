import { FINANCE_CSS, FINANCE_JS } from "./finance-assets";

export function renderFinancePage(pathname: string): string {
  const isLogin = pathname === "/login";
  const pageTitle = isLogin ? "管理员登录" : pageLabel(pathname);
  const body = isLogin ? `<section class="finance-card finance-login"><h2>维优猎头 BD 雷达</h2><p class="finance-muted">finance.chanceping.com 管理员入口</p><form><label>账号<input name="username" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button class="finance-button" type="submit">登录</button></form></section>` : `<div class="finance-shell"><nav class="finance-nav"><h1>ChancePing Finance</h1>${navLinks(pathname)}<a href="#" data-finance-logout>退出登录</a></nav><main class="finance-main"><header class="finance-header"><div><p class="finance-muted">维优猎头 BD 雷达</p><h2>${pageTitle}</h2></div><button class="finance-button" onclick="location.href='/weekly'">本周周报</button></header><section class="finance-card"><h3>${pageTitle}</h3><p class="finance-muted">数据由正式 WeeklySnapshot 提供；长证据、Gate 和行动详情在对应页面展开。</p><div class="finance-grid"><article><strong>A 级机会</strong><p>本周必须联系的高价值公司</p></article><article><strong>B 级情报池</strong><p>待补证据、联系人或评分的机会</p></article><article><strong>趋势</strong><p>政策、市场、行业和招聘市场变化</p></article></div></section></main></div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pageTitle}｜ChancePing Finance</title><style>${FINANCE_CSS}</style></head><body>${body}<script>${FINANCE_JS}</script></body></html>`;
}

function navLinks(active: string): string { return [["/weekly", "本周"], ["/leads/a", "A级机会"], ["/leads/b", "B级情报池"], ["/trends", "趋势"], ["/companies", "公司库"], ["/runs", "雷达运行"]].map(([href, label]) => `<a class="${active === href ? "active" : ""}" href="${href}">${label}</a>`).join(""); }
function pageLabel(pathname: string): string { return ({ "/": "本周", "/weekly": "本周", "/leads/a": "A级机会", "/leads/b": "B级情报池", "/trends": "趋势", "/companies": "公司库", "/runs": "雷达运行" } as Record<string, string>)[pathname] ?? "Finance Workbench"; }
