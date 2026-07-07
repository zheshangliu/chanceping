(function () {
  const STORAGE_KEY = "chanceping_backend_language";

  const BACKEND_I18N = {
    zh: {
      brandTitle: "ChancePing 盯机会",
      topNavHome: "首页",
      topNavResult: "盯机会结果",
      topNavRadars: "我的雷达",
      sidebarProduct: "盯机会",
      sidebarNewRadar: "新雷达",
      sidebarRecent: "最近",
      aiEventsNavigator: "全球 AI 赛事导航",
      builtInNavigator: "V1.0 · 内置导航",
      homeTitle: "AI 赛事雷达",
      homeSubtitle: "像聊天一样说清楚你想找的 AI 比赛、Hackathon、云资源和产品展示机会",
      homeInputPlaceholder: "今天你想找什么机会？",
      homeStartButton: "开始画雷达",
      homeHelper: "先把 AI 赛事雷达聊准。你确认雷达后，系统才会开始搜索并把报告发回聊天窗口。",
    },
    en: {
      brandTitle: "ChancePing",
      topNavHome: "Home",
      topNavResult: "Results",
      topNavRadars: "My Radars",
      sidebarProduct: "Opportunity Radar",
      sidebarNewRadar: "New radar",
      sidebarRecent: "Recent",
      aiEventsNavigator: "Global AI Events Navigator",
      builtInNavigator: "V1.0 · Built-in navigator",
      homeTitle: "AI Events Radar",
      homeSubtitle: "Tell ChancePing what AI contests, hackathons, cloud credits, or product showcase opportunities you want to track.",
      homeInputPlaceholder: "What opportunity do you want to find today?",
      homeStartButton: "Draw radar",
      homeHelper: "First tune the AI events radar. ChancePing searches only after you confirm it, then sends the report back to this chat window.",
    },
  };

  function normalizeLanguage(language) {
    return language === "en" ? "en" : "zh";
  }

  function getLanguage() {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY) || "zh");
  }

  function t(key, language = getLanguage()) {
    const lang = normalizeLanguage(language);
    return BACKEND_I18N[lang]?.[key] || BACKEND_I18N.zh[key] || key;
  }

  function applyLanguage(language = getLanguage()) {
    const lang = normalizeLanguage(language);
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.setAttribute("lang", lang === "en" ? "en" : "zh-CN");
    document.documentElement.dataset.backendLanguage = lang;

    document.querySelectorAll("[data-backend-i18n]").forEach((node) => {
      const key = node.getAttribute("data-backend-i18n");
      if (key) node.textContent = t(key, lang);
    });

    document.querySelectorAll("[data-backend-i18n-placeholder]").forEach((node) => {
      const key = node.getAttribute("data-backend-i18n-placeholder");
      if (key && "placeholder" in node) node.placeholder = t(key, lang);
    });

    document.querySelectorAll("button[data-backend-language]").forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-backend-language") === lang);
    });

    window.dispatchEvent(new CustomEvent("chanceping-backend-language-change", { detail: { language: lang } }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("button[data-backend-language]").forEach((button) => {
      button.addEventListener("click", () => applyLanguage(button.getAttribute("data-backend-language")));
    });
    applyLanguage(getLanguage());
  });

  window.CHANCEPING_BACKEND_I18N = {
    t,
    getLanguage,
    applyLanguage,
    languages: ["zh", "en"],
  };
  window.applyChancePingBackendLanguage = applyLanguage;
})();
