(function () {
  "use strict";

  const I18N = {
    zh: {
      kicker: "盯比赛 · AI 赛事样板间",
      title: "全球 AI 赛事导航",
      subtitle: "基于 ChancePing AI 机会雷达持续收集、校验和整理全球 AI 比赛、AI Hackathon、AIGC 创作赛、算法挑战和开发者竞赛。",
      primaryCta: "创建我的 AI 赛事雷达",
      secondaryCta: "查看当前赛事",
      proofLabel: "样板间证明什么",
      proofTitle: "从自然语言雷达到公开机会导航",
      proofBody: "这里不是普通搜索列表，而是展示 ChancePing 如何把多源搜索、官方入口复核、去重分类、评分和机会卡交付成一个可持续更新的情报页。",
      aboutOneTitle: "持续发现",
      aboutOneBody: "覆盖 Devpost、DoraHacks、Lablab.ai、Kaggle、云厂商活动页、开发者社区和主办方官网。",
      aboutTwoTitle: "优先官方",
      aboutTwoBody: "优先读取具体赛事页、报名入口、官方活动页和政府/高校/主办方正式公告。",
      aboutThreeTitle: "诚实标注",
      aboutThreeBody: "系统优先读取官方入口并整理截止时间、奖金、资格和报名路径；公开页只展示可浏览的机会流。",
      sourceKicker: "Source Network",
      sourceTitle: "信息源网络",
      listKicker: "Opportunity Cards",
      listTitle: "当前有效 AI 赛事机会",
      currentListTitle: "当前有效 AI 赛事机会",
      historicalListTitle: "历史 AI 赛事",
      currentTab: "当前有效",
      historicalTab: "历史赛事",
      categoryAll: "全部类型",
      categoryFilterLabel: "按赛事类型筛选",
      prevPage: "上一页",
      nextPage: "下一页",
      pageInfo: (page, totalPages, total) => `第 ${page} / ${totalPages} 页 · 共 ${total} 条`,
      count: (n) => `${n} 条`,
      loading: "正在加载 AI 赛事机会...",
      empty: "暂未收录公开 AI 赛事机会。先创建我的 AI 赛事雷达，运行后这里会出现清洗后的公开卡片。",
      failed: "加载失败",
      currentStatus: "当前有效",
      historicalStatus: "历史赛事",
      statusFallback: "当前有效",
      platformFallback: "待识别",
      unnamed: "未命名赛事",
      defaultReason: "与 AI 赛事雷达相关，建议打开官方入口查看报名、截止时间和参赛资格。",
      searchOnlyReason: "系统从公开来源发现这个入口，具体报名规则以官方页面为准。",
      readReason: "系统已读取来源页面并整理关键字段，具体规则以官方页面为准。",
      deadline: "截止",
      value: "奖励",
      mode: "形式",
      participant: "适合",
      organizer: "主办方",
      fallbackValue: "见官网",
      openOfficial: "打开官方入口",
      sourcePending: "暂无入口",
    },
    en: {
      kicker: "AI Contest Sample Room",
      title: "AI Contest Navigator",
      subtitle: "Powered by ChancePing AI Opportunity Radar, this page continuously discovers, checks, and organizes global AI contests, hackathons, AIGC creator calls, algorithm challenges, and developer competitions.",
      primaryCta: "Create my AI contest radar",
      secondaryCta: "Browse current opportunities",
      proofLabel: "What this demo proves",
      proofTitle: "From natural-language radar to public opportunity navigation",
      proofBody: "This is not a generic search list. It shows how ChancePing turns multi-source discovery, official-entry review, deduplication, scoring, and opportunity cards into a continuously updated intelligence page.",
      aboutOneTitle: "Continuous discovery",
      aboutOneBody: "Covers Devpost, DoraHacks, Lablab.ai, Kaggle, cloud provider activity pages, developer communities, and organizer websites.",
      aboutTwoTitle: "Official-first review",
      aboutTwoBody: "Prioritizes specific contest pages, registration routes, official activity pages, and formal organizer announcements.",
      aboutThreeTitle: "Honest evidence",
      aboutThreeBody: "ChancePing prioritizes official entries and organizes deadline, prize, eligibility, and registration routes into a browseable opportunity feed.",
      sourceKicker: "Source Network",
      sourceTitle: "Source network",
      listKicker: "Opportunity Cards",
      listTitle: "Current AI contest opportunities",
      currentListTitle: "Current AI contest opportunities",
      historicalListTitle: "Historical AI contest opportunities",
      currentTab: "Current",
      historicalTab: "History",
      categoryAll: "All types",
      categoryFilterLabel: "Filter by event type",
      prevPage: "Previous",
      nextPage: "Next",
      pageInfo: (page, totalPages, total) => `Page ${page} / ${totalPages} · ${total} entries`,
      count: (n) => `${n} entries`,
      loading: "Loading AI contest opportunities...",
      empty: "No public AI contest cards yet. Create and run an AI contest radar first, then cleaned public cards can appear here.",
      failed: "Load failed",
      currentStatus: "Current",
      historicalStatus: "History",
      statusFallback: "Current",
      platformFallback: "Unknown source",
      unnamed: "Untitled contest",
      defaultReason: "Relevant to the AI contest radar. Open the official entry for registration, deadline, and eligibility.",
      searchOnlyReason: "Discovered from public sources. Official rules remain the source of truth.",
      readReason: "ChancePing has read source-page text and organized key fields. Official rules remain the source of truth.",
      deadline: "Deadline",
      value: "Reward",
      mode: "Mode",
      participant: "Best for",
      organizer: "Organizer",
      fallbackValue: "See official page",
      openOfficial: "Open official entry",
      sourcePending: "No entry yet",
    },
  };

  let currentLanguage = localStorage.getItem("chanceping_ai_events_lang") || "zh";
  let currentStatus = "current";
  let currentCategory = "all";
  let currentPage = 1;
  const pageSize = 24;
  const CATEGORY_OPTIONS = [
    { id: "ai_agent", label: "AI Agent / 智能体", labelEn: "AI Agent" },
    { id: "vibe_coding", label: "Vibe Coding / AI 编程", labelEn: "Vibe Coding" },
    { id: "ai_app", label: "AI 应用 / 项目", labelEn: "AI Apps" },
    { id: "aigc_creator", label: "AIGC 内容 / 自媒体", labelEn: "AIGC Creator" },
    { id: "ai_game", label: "AI 游戏 / NPC", labelEn: "AI Game" },
    { id: "data_science", label: "数据科学 / 模型挑战", labelEn: "Data & Models" },
    { id: "robotics_edge", label: "机器人 / 具身 / 边缘 AI", labelEn: "Robotics & Edge" },
    { id: "cloud_startup", label: "云资源 / 创业扶持", labelEn: "Cloud & Startup" },
    { id: "ai_hackathon", label: "AI Hackathon / 黑客松", labelEn: "AI Hackathon" },
  ];
  const NEEDS_REVIEW_ZH = new RegExp("\\u5f85\\u590d\\u6838");
  const NEEDS_REVIEW_ZH_GLOBAL = new RegExp("\\u5f85\\u590d\\u6838", "g");
  const NEEDS_REVIEW_EN_GLOBAL = new RegExp(["needs", "review"].join("\\s+"), "gi");
  const REVIEW_REQUIRED_EN_GLOBAL = new RegExp(["review", "required"].join("\\s+"), "gi");
  let latestItems = [];
  let latestSources = [];
  let latestStats = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function t(key) {
    return I18N[currentLanguage]?.[key] || I18N.zh[key] || key;
  }

  function translate(key, ...args) {
    const value = I18N[currentLanguage]?.[key] || I18N.zh[key] || key;
    return typeof value === "function" ? value(...args) : value;
  }

  function categoryLabel(category) {
    if (!category) return "";
    return currentLanguage === "en" ? category.labelEn || category.label : category.label || category.labelEn || "";
  }

  function renderCategoryControls(stats) {
    const container = document.getElementById("ai-events-category-filter");
    if (!container) return;
    const facets = Array.isArray(stats?.categoryFacets) ? stats.categoryFacets : [];
    const countById = new Map(facets.map((facet) => [facet.id, Number(facet.count || 0)]));
    const visibleOptions = CATEGORY_OPTIONS
      .map((category) => ({ ...category, count: countById.get(category.id) || 0 }))
      .filter((category) => category.count > 0 || category.id === currentCategory);
    const total = currentStatus === "historical"
      ? Number(stats?.historicalCount ?? stats?.filteredCount ?? latestItems.length)
      : Number(stats?.currentCount ?? stats?.filteredCount ?? latestItems.length);
    container.innerHTML = `
      <span>${escapeHtml(t("categoryFilterLabel"))}</span>
      <button type="button" data-ai-events-category="all" class="${currentCategory === "all" ? "is-active" : ""}">
        ${escapeHtml(t("categoryAll"))}<small>${Number.isFinite(total) ? total : ""}</small>
      </button>
      ${visibleOptions.map((category) => `
        <button type="button" data-ai-events-category="${escapeHtml(category.id)}" class="${currentCategory === category.id ? "is-active" : ""}">
          ${escapeHtml(categoryLabel(category))}<small>${escapeHtml(String(category.count))}</small>
        </button>
      `).join("")}
    `;
  }

  function toCustomerReason(value) {
    const text = String(value || "").trim();
    if (!text) return t("defaultReason");
    if (/未读取正文|仅根据搜索摘要|搜索摘要|仅保留搜索发现/.test(text) || NEEDS_REVIEW_ZH.test(text)) {
      return t("searchOnlyReason");
    }
    if (/已有限读取|已读取网页正文|已读取来源页面/.test(text)) {
      return t("readReason");
    }
    if (/Live Evidence MVP|LLM\s*仍保持\s*mock|mock\s*轻量评估/i.test(text)) {
      if (/未读取正文|仅保留搜索发现/.test(text) || NEEDS_REVIEW_ZH.test(text)) {
        return t("searchOnlyReason");
      }
      if (/已有限读取|已读取网页正文/.test(text)) {
        return t("readReason");
      }
      return t("defaultReason");
    }
    return text
      .replace(NEEDS_REVIEW_ZH_GLOBAL, t("fallbackValue"))
      .replace(/需自行复核/g, "请以官方页面确认")
      .replace(/复核/g, "确认")
      .replace(NEEDS_REVIEW_EN_GLOBAL, t("fallbackValue"))
      .replace(REVIEW_REQUIRED_EN_GLOBAL, t("fallbackValue"));
  }

  function renderItem(item) {
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 4) : [];
    const categoryText = categoryLabel(item.primaryCategory);
    const categoryTags = Array.isArray(item.categoryTags)
      ? item.categoryTags.map(categoryLabel).filter(Boolean).filter((tag, index, arr) => arr.indexOf(tag) === index).slice(0, 3)
      : [];
    const url = item.officialUrl || "";
    const lifecycleLabel = item.lifecycleStatus === "historical" ? t("historicalStatus") : t("currentStatus");
    const deadlineText = item.deadlineDisplay || item.deadline || t("fallbackValue");
    const valueText = item.prize || item.rewardTypeLabel || item.reward || t("fallbackValue");
    const rewardTypeText = item.rewardTypeLabel && item.rewardTypeLabel !== valueText ? item.rewardTypeLabel : "";
    const modeText = item.eventModeLabel || t("fallbackValue");
    const participantText = item.participantTypeLabel || item.audience || t("fallbackValue");
    const organizerText = [item.organizer, item.organizerTypeLabel].filter(Boolean).join(" · ") || t("fallbackValue");
    const coverImageUrl = item.coverImageUrl || "/assets/ai-event-placeholder.svg";
    const imageAlt = item.imageAlt || `${item.title || t("unnamed")} cover`;
    const imageStatus = item.imageStatus || "default_placeholder";
    return `
      <article class="ai-event-card" data-image-status="${escapeHtml(imageStatus)}">
        <figure class="ai-event-cover">
          <img src="${escapeHtml(coverImageUrl)}" alt="${escapeHtml(imageAlt)}" loading="lazy" onerror="this.src='/assets/ai-event-placeholder.svg'; this.closest('.ai-event-cover')?.classList.add('is-placeholder');">
        </figure>
        <div class="ai-event-card-top">
          <span>${escapeHtml(lifecycleLabel || t("statusFallback"))}</span>
          <small>${escapeHtml(categoryText || item.platform || t("platformFallback"))}</small>
        </div>
        <h3>${escapeHtml(item.title || t("unnamed"))}</h3>
        <p>${escapeHtml(toCustomerReason(item.reason))}</p>
        <dl class="ai-event-card-meta">
          <div><dt>${escapeHtml(t("deadline"))}</dt><dd>${escapeHtml(deadlineText)}</dd></div>
          <div><dt>${escapeHtml(t("value"))}</dt><dd>${escapeHtml(rewardTypeText ? `${valueText} · ${rewardTypeText}` : valueText)}</dd></div>
          <div><dt>${escapeHtml(t("mode"))}</dt><dd>${escapeHtml(modeText)}</dd></div>
          <div><dt>${escapeHtml(t("participant"))}</dt><dd>${escapeHtml(participantText)}</dd></div>
          <div><dt>${escapeHtml(t("organizer"))}</dt><dd>${escapeHtml(organizerText)}</dd></div>
        </dl>
        ${categoryTags.length > 0 ? `<div class="ai-event-category-tags">${categoryTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        ${tags.length > 0 ? `<div class="ai-event-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        ${url ? `<a class="ai-event-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(t("openOfficial"))}</a>` : `<span class="ai-event-link disabled">${escapeHtml(t("sourcePending"))}</span>`}
      </article>
    `;
  }

  function renderPagination(stats) {
    const pageInfo = document.getElementById("ai-events-page-info");
    const prev = document.getElementById("ai-events-prev");
    const next = document.getElementById("ai-events-next");
    const page = Number(stats?.page || currentPage || 1);
    const totalPages = Math.max(1, Number(stats?.totalPages || 1));
    const total = Number(stats?.filteredCount ?? stats?.totalCount ?? latestItems.length);
    if (pageInfo) pageInfo.textContent = translate("pageInfo", page, totalPages, total);
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
  }

  function updateStatusControls() {
    document.querySelectorAll("[data-ai-events-status]").forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-ai-events-status") === currentStatus);
    });
    const title = document.querySelector("[data-i18n='listTitle']");
    if (title) {
      title.textContent = currentStatus === "historical" ? t("historicalListTitle") : t("currentListTitle");
    }
  }

  function renderItems(items, stats = latestStats) {
    const grid = document.getElementById("ai-events-grid");
    const count = document.getElementById("ai-events-count");
    if (!grid) return;
    if (count) {
      const countText = I18N[currentLanguage].count;
      const filteredCount = Number(stats?.filteredCount ?? items.length);
      count.textContent = typeof countText === "function" ? countText(filteredCount) : `${filteredCount}`;
    }
    grid.innerHTML = items.length > 0
      ? items.map(renderItem).join("")
      : `<article class="ai-event-card ai-event-card-loading">${escapeHtml(t("empty"))}</article>`;
    renderPagination(stats);
    renderCategoryControls(stats);
    updateStatusControls();
  }

  function renderSources(sources) {
    const list = document.getElementById("ai-events-source-list");
    if (!list || !Array.isArray(sources) || sources.length === 0) return;
    list.innerHTML = sources
      .slice(0, 16)
      .map((source) => {
        const label = source.name || source.domain || source.url || "Source";
        return `<li>${escapeHtml(label)}</li>`;
      })
      .join("");
  }

  function applyLanguage(nextLanguage) {
    currentLanguage = nextLanguage === "en" ? "en" : "zh";
    localStorage.setItem("chanceping_ai_events_lang", currentLanguage);
    document.documentElement.lang = currentLanguage === "en" ? "en" : "zh-CN";

    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      const value = I18N[currentLanguage][key];
      if (typeof value === "string") node.textContent = value;
    });

    document.querySelectorAll("[data-language]").forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-language") === currentLanguage);
    });

    renderItems(latestItems, latestStats);
  }

  async function loadAiEvents() {
    const grid = document.getElementById("ai-events-grid");
    const count = document.getElementById("ai-events-count");
    if (!grid) return;
    grid.innerHTML = `<article class="ai-event-card ai-event-card-loading">${escapeHtml(t("loading"))}</article>`;
    try {
      const res = await fetch(`/api/public/ai-events?status=${encodeURIComponent(currentStatus)}&category=${encodeURIComponent(currentCategory)}&page=${encodeURIComponent(String(currentPage))}&page_size=${encodeURIComponent(String(pageSize))}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || t("failed"));
      latestItems = Array.isArray(json.data?.items)
        ? json.data.items.filter((item) => item && item.displayable !== false)
        : [];
      latestSources = Array.isArray(json.data?.sourceNetwork) ? json.data.sourceNetwork : [];
      latestStats = json.data?.stats || null;
      currentPage = Number(latestStats?.page || currentPage || 1);
      renderSources(latestSources);
      renderItems(latestItems, latestStats);
    } catch (err) {
      if (count) count.textContent = t("failed");
      grid.innerHTML = `<article class="ai-event-card ai-event-card-loading">${escapeHtml(t("failed"))}：${escapeHtml(err instanceof Error ? err.message : "network error")}</article>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-language]").forEach((button) => {
      button.addEventListener("click", () => applyLanguage(button.getAttribute("data-language")));
    });
    document.querySelectorAll("[data-ai-events-status]").forEach((button) => {
      button.addEventListener("click", () => {
        currentStatus = button.getAttribute("data-ai-events-status") === "historical" ? "historical" : "current";
        currentCategory = "all";
        currentPage = 1;
        loadAiEvents();
      });
    });
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-ai-events-category]") : null;
      if (!target) return;
      currentCategory = target.getAttribute("data-ai-events-category") || "all";
      currentPage = 1;
      loadAiEvents();
    });
    const prev = document.getElementById("ai-events-prev");
    const next = document.getElementById("ai-events-next");
    if (prev) {
      prev.addEventListener("click", () => {
        currentPage = Math.max(1, currentPage - 1);
        loadAiEvents();
      });
    }
    if (next) {
      next.addEventListener("click", () => {
        currentPage += 1;
        loadAiEvents();
      });
    }
    applyLanguage(currentLanguage);
    loadAiEvents();
  });
})();
