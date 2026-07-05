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
      aboutThreeBody: "搜索发现不等于已核验事实；截止时间、资格、费用和联系人都按证据状态展示。",
      sourceKicker: "Source Network",
      sourceTitle: "信息源网络",
      listKicker: "Opportunity Cards",
      listTitle: "当前可复核 AI 赛事机会",
      count: (n) => `${n} 条`,
      loading: "正在加载 AI 赛事机会...",
      empty: "暂未收录公开 AI 赛事机会。先创建我的 AI 赛事雷达，运行后这里会出现清洗后的公开卡片。",
      failed: "加载失败",
      statusFallback: "待复核",
      platformFallback: "待识别",
      unnamed: "未命名赛事",
      defaultReason: "与 AI 赛事雷达相关，建议打开官方入口进一步复核。",
      searchOnlyReason: "搜索发现来源，尚未读取完整正文；请打开官方入口复核报名、截止时间和参赛资格。",
      readReason: "已读取来源页面的部分正文；报名资格、费用、截止时间和提交要求仍以官方页面为准。",
      needsReviewReason: "搜索发现来源，字段仍需复核；不要直接当作已确认报名机会。",
      deadline: "截止",
      value: "价值",
      review: "待复核",
      openOfficial: "打开官方入口",
      sourcePending: "来源待复核",
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
      aboutThreeBody: "Search discovery is not verified fact. Deadline, eligibility, fees, and contact details are separated by evidence status.",
      sourceKicker: "Source Network",
      sourceTitle: "Source network",
      listKicker: "Opportunity Cards",
      listTitle: "Current AI contest opportunities to review",
      count: (n) => `${n} entries`,
      loading: "Loading AI contest opportunities...",
      empty: "No public AI contest cards yet. Create and run an AI contest radar first, then cleaned public cards can appear here.",
      failed: "Load failed",
      statusFallback: "Needs review",
      platformFallback: "Unknown source",
      unnamed: "Untitled contest",
      defaultReason: "Relevant to the AI contest radar. Open the official entry to review the details.",
      searchOnlyReason: "Search-discovered source. Full page text has not been read yet; review registration, deadline, and eligibility on the official page.",
      readReason: "Part of the source page has been read. Eligibility, fees, deadline, and submission rules still defer to the official page.",
      needsReviewReason: "Search-discovered source with fields still requiring review; do not treat it as a confirmed registration opportunity.",
      deadline: "Deadline",
      value: "Value",
      review: "Review",
      openOfficial: "Open official entry",
      sourcePending: "Source pending",
    },
  };

  let currentLanguage = localStorage.getItem("chanceping_ai_events_lang") || "zh";
  let latestItems = [];

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

  function toCustomerReason(value) {
    const text = String(value || "").trim();
    if (!text) return t("defaultReason");
    if (/Live Evidence MVP|LLM\s*仍保持\s*mock|mock\s*轻量评估/i.test(text)) {
      if (/未读取正文|仅保留搜索发现|待复核/.test(text)) {
        return t("searchOnlyReason");
      }
      if (/已有限读取|已读取网页正文/.test(text)) {
        return t("readReason");
      }
      return t("needsReviewReason");
    }
    return text;
  }

  function renderItem(item) {
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 4) : [];
    const url = item.officialUrl || "";
    return `
      <article class="ai-event-card">
        <div class="ai-event-card-top">
          <span>${escapeHtml(item.statusLabel || t("statusFallback"))}</span>
          <small>${escapeHtml(item.platform || t("platformFallback"))}</small>
        </div>
        <h3>${escapeHtml(item.title || t("unnamed"))}</h3>
        <p>${escapeHtml(toCustomerReason(item.reason))}</p>
        <dl>
          <div><dt>${escapeHtml(t("deadline"))}</dt><dd>${escapeHtml(item.deadline || t("review"))}</dd></div>
          <div><dt>${escapeHtml(t("value"))}</dt><dd>${escapeHtml(item.reward || t("review"))}</dd></div>
        </dl>
        ${tags.length > 0 ? `<div class="ai-event-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        ${url ? `<a class="ai-event-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(t("openOfficial"))}</a>` : `<span class="ai-event-link disabled">${escapeHtml(t("sourcePending"))}</span>`}
      </article>
    `;
  }

  function renderItems(items) {
    const grid = document.getElementById("ai-events-grid");
    const count = document.getElementById("ai-events-count");
    if (!grid) return;
    if (count) {
      const countText = I18N[currentLanguage].count;
      count.textContent = typeof countText === "function" ? countText(items.length) : `${items.length}`;
    }
    grid.innerHTML = items.length > 0
      ? items.map(renderItem).join("")
      : `<article class="ai-event-card ai-event-card-loading">${escapeHtml(t("empty"))}</article>`;
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

    renderItems(latestItems);
  }

  async function loadAiEvents() {
    const grid = document.getElementById("ai-events-grid");
    const count = document.getElementById("ai-events-count");
    if (!grid) return;
    grid.innerHTML = `<article class="ai-event-card ai-event-card-loading">${escapeHtml(t("loading"))}</article>`;
    try {
      const res = await fetch("/api/public/ai-events");
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || t("failed"));
      latestItems = Array.isArray(json.data?.items) ? json.data.items : [];
      renderItems(latestItems);
    } catch (err) {
      if (count) count.textContent = t("failed");
      grid.innerHTML = `<article class="ai-event-card ai-event-card-loading">${escapeHtml(t("failed"))}：${escapeHtml(err instanceof Error ? err.message : "network error")}</article>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-language]").forEach((button) => {
      button.addEventListener("click", () => applyLanguage(button.getAttribute("data-language")));
    });
    applyLanguage(currentLanguage);
    loadAiEvents();
  });
})();
