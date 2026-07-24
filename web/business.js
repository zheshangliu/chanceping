(() => {
  const app = document.getElementById("business-app");
  const editions = new Set(["guangzhou", "tianhe", "shaoguan"]);
  const categoryLabels = { competition: "赛事", exhibition: "展会", procurement: "采购", channel: "渠道", policy: "政策", international: "国际" };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function routeState() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const edition = editions.has(parts[0]) ? parts[0] : "guangzhou";
    const page = parts[1] || "home";
    const slug = parts[2] || "";
    return { edition, page, slug };
  }

  function nav(edition, active) {
    const base = `/${edition.route.replace(/^\//, "")}`;
    const links = [["首页", base], ["全部机会", `${base}/opportunities`], ["信息来源", `${base}/sources`], ["关于雷达", `${base}/about`]];
    return `<nav class="business-nav" aria-label="主导航">${links.map(([label, href]) => `<a class="${(active === "home" ? href === base : href.endsWith(`/${active}`)) ? "is-active" : ""}" href="${href}">${label}</a>`).join("")}</nav>`;
  }

  function shell(common, edition, active, content) {
    document.title = edition.seo.title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", edition.seo.description);
    const base = edition.route;
    return `<header class="business-header"><a class="business-brand" href="${base}"><span>ChancePing</span><small>${escapeHtml(edition.shortName)}</small></a>${nav(edition, active)}<a class="business-main-link" href="https://www.chanceping.com/">创建我的雷达</a></header><main class="business-shell">${content}</main><footer class="business-footer"><p>${escapeHtml(common.disclaimer)}</p><small>${escapeHtml(edition.footerNote)} · Sprint 1 页面骨架</small></footer>`;
  }

  function emptyState(title, description) {
    return `<section class="business-empty"><span>DATA PENDING</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p><p class="business-note">此页面暂未展示或模拟真实机会。首批数据完成核验和导入后将显示官方来源与状态。</p></section>`;
  }

  function home(common, edition) {
    const base = edition.route;
    return `<section class="business-hero"><p class="business-kicker">CITY BUSINESS RADAR</p><h1>${escapeHtml(edition.headline)}</h1><p class="business-lead">${escapeHtml(edition.subheadline)}</p><p class="business-tagline">${escapeHtml(edition.tagline)}</p><div class="business-actions"><a class="business-button" href="${base}/opportunities">${escapeHtml(common.primaryCtaLabel)}</a><a class="business-button business-button-secondary" href="${base}/about">了解雷达</a></div></section><section class="business-section"><div class="business-section-heading"><p class="business-kicker">LATEST OPPORTUNITIES</p><h2>最新机会</h2></div>${emptyState("机会数据正在准备", "当前为公开页面骨架，尚未导入可公开展示的核验机会数据。")}</section><section class="business-grid"><article><h2>面向谁</h2><p>${escapeHtml(edition.audienceDescription)}</p></article><article><h2>关注方向</h2><p>${edition.featuredCategories.map((id) => categoryLabels[id] || id).join("、")}</p></article><article><h2>使用方式</h2><p>浏览公开信息，并在正式行动前回到官方最新通知核验。</p></article></section>`;
  }

  function opportunities() { return emptyState("全部机会即将开放", "筛选、排序和机会详情将在真实数据完成校验后接入。本阶段不显示模拟机会。 "); }
  function detail(slug) { return `<section class="business-copy"><p class="business-kicker">OPPORTUNITY DETAIL</p><h1>机会详情待接入</h1><p>请求的机会标识为 <code>${escapeHtml(slug)}</code>。Sprint 1 尚未导入真实机会，因此不会生成或展示虚构详情。</p><a class="business-button business-button-dark" href="./">返回全部机会</a></section>`; }
  function sources() { return emptyState("信息来源网络待接入", "来源页面会仅展示允许公开、可回到官方原文且具有核验状态的信息源。 "); }
  function about(common, edition) { return `<section class="business-copy"><p class="business-kicker">ABOUT THE RADAR</p><h1>${escapeHtml(edition.name)}</h1><p>${escapeHtml(edition.subheadline)}</p><h2>公开信息与决策辅助</h2><p>${escapeHtml(common.disclaimer)}</p><h2>示例使用场景</h2><blockquote>${escapeHtml(edition.exampleScenario)}</blockquote></section>`; }
  function notFound() { return `<section class="business-empty"><span>404</span><h1>页面不存在</h1><p>请从当前地区版本的导航继续浏览。</p></section>`; }

  async function boot() {
    const state = routeState();
    try {
      const response = await fetch(`/api/business/editions/${state.edition}`);
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error("配置读取失败");
      const { common, edition } = payload.data;
      let content;
      if (state.page === "home") content = home(common, edition);
      else if (state.page === "opportunities" && !state.slug) content = opportunities();
      else if (state.page === "opportunities" && state.slug) content = detail(state.slug);
      else if (state.page === "sources") content = sources();
      else if (state.page === "about") content = about(common, edition);
      else content = notFound();
      app.innerHTML = shell(common, edition, state.page, content);
    } catch (error) {
      app.innerHTML = `<section class="business-error"><h1>页面暂时无法加载</h1><p>地区配置读取失败，请稍后重试。</p><a href="/guangzhou">返回广州版</a></section>`;
    }
  }
  boot();
})();
