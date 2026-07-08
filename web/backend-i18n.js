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
      myRadarsTitle: "我的雷达",
      myRadarsSubtitle: "情报流指挥台：回到已保存的雷达，继续编辑、再次盯机会或查看最新报告。",
      createRadar: "建立新雷达",
      refreshList: "刷新列表",
      quotaFree: "免费版",
      quotaCustomRadars: "自定义雷达",
      loadingRadars: "正在加载你的长期雷达...",
      builtIn: "内置",
      saved: "已保存",
      neverRun: "还没跑过",
      version: "版本",
      status: "状态",
      lastRun: "上次运行",
      newThisRun: "本次新增",
      intelSummary: "情报流摘要",
      publicLibrary: "公共库",
      editRadar: "编辑雷达",
      viewOpportunitiesReport: "查看机会和报告",
      rerunRadar: "再次盯机会",
      deleteRadar: "删除雷达",
      globalAiEventsHealth: "内置公共雷达，不占用自定义名额；公开页和这里读取同一批赛事库。",
      globalAiEventsDescription: "这里展示 AI Events 公共赛事库中当前有效的机会；公开页 /aievents 也读取同一批数据。",
      chatProduct: "机会雷达",
      newRadar: "新雷达",
      newRadarHint: "一个窗口，一个雷达",
      customRadarWindows: "自定义雷达窗口",
      currentRadar: "当前雷达",
      rename: "改名",
      delete: "删除",
      restart: "重新开始",
      oneChatOneRadar: "一个聊天窗口，一个正在成长的雷达",
      chatInputPlaceholder: "继续告诉我：你是谁、不要什么、什么结果才算有用",
      send: "发送",
      builtInWindow: "内置",
      openRadarImage: "打开雷达画像",
      confirmRun: "确认并盯一次",
      openMarkdownReport: "打开 Markdown 报告",
      viewCards: "查看机会卡",
      resultBoard: "机会管道看板",
      resultBoardDesc: "先看能立刻行动的，再复核资格、持续观察，最后保留本轮降权原因。",
      topThree: "先看这 3 个",
      topThreeDesc: "我把本轮最值得先打开复核的机会放在前面。",
      immediateAction: "立即行动",
      immediateActionDesc: "建议本周优先打开官方入口，复核报名、提交作品或申请资源路径。",
      reviewEligibility: "复核资格",
      reviewEligibilityDesc: "方向匹配，但还需要确认资格、费用、截止时间或主办方字段。",
      monitorSignals: "持续观察",
      monitorSignalsDesc: "可作为下一轮监控线索，不直接包装成已确认机会。",
      downgradeReasons: "淘汰原因",
      downgradeReasonsDesc: "低行动性、弱页面、过期或与当前雷达不匹配的结果。",
      reportSummary: "报告摘要",
      copyMarkdown: "复制 Markdown",
      allCards: "查看全部机会卡",
      sourceChecks: "本轮重点检查来源",
      adjustRadarProfile: "调整雷达画像",
      backToRadarList: "返回我的雷达列表",
      viewRadarDetail: "查看本次雷达详情",
      saveHint: "下次不用重新描述，系统会按这个画像继续找机会。",
      retrySearch: "重试搜索",
      switchDemoMode: "切回演示数据查看流程",
      fullMarkdownReport: "查看完整 Markdown 报告",
      noExtraSources: "本轮未指定额外信号源。",
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
      myRadarsTitle: "My Radars",
      myRadarsSubtitle: "Intelligence command center: return to saved radars, keep editing, rerun, or read the latest report.",
      createRadar: "Create radar",
      refreshList: "Refresh list",
      quotaFree: "Free plan",
      quotaCustomRadars: "Custom radars",
      loadingRadars: "Loading your long-term radars...",
      builtIn: "Built-in",
      saved: "Saved",
      neverRun: "Not run yet",
      version: "Version",
      status: "Status",
      lastRun: "Last run",
      newThisRun: "New items",
      intelSummary: "Radar summary",
      publicLibrary: "Public library",
      editRadar: "Edit radar",
      viewOpportunitiesReport: "View opportunities and report",
      rerunRadar: "Run again",
      deleteRadar: "Delete radar",
      globalAiEventsHealth: "Built-in public radar. It does not count toward your 3 custom radars; this page and /aievents read the same event library.",
      globalAiEventsDescription: "This shows the current opportunities from the AI Events public library; /aievents reads the same dataset.",
      chatProduct: "Opportunity Radar",
      newRadar: "New radar",
      newRadarHint: "One window, one radar",
      customRadarWindows: "Custom radar windows",
      currentRadar: "Current radar",
      rename: "Rename",
      delete: "Delete",
      restart: "Restart",
      oneChatOneRadar: "One chat window, one growing radar",
      chatInputPlaceholder: "Tell me who you are, what to avoid, and what results are useful",
      send: "Send",
      builtInWindow: "Built-in",
      openRadarImage: "Open radar image",
      confirmRun: "Confirm and run",
      openMarkdownReport: "Open Markdown report",
      viewCards: "View opportunity cards",
      resultBoard: "Opportunity pipeline",
      resultBoardDesc: "Start with actions, then review eligibility, monitor signals, and keep downgrade reasons.",
      topThree: "First 3 to check",
      topThreeDesc: "The most worthwhile sources to open first.",
      immediateAction: "Immediate action",
      immediateActionDesc: "Open the official entry this week and verify registration, submission, or resource application path.",
      reviewEligibility: "Review eligibility",
      reviewEligibilityDesc: "Direction matches, but eligibility, fee, deadline, or organizer fields need confirmation.",
      monitorSignals: "Monitor signals",
      monitorSignalsDesc: "Use as next-round monitoring clues; do not package as confirmed opportunities.",
      downgradeReasons: "Downgrade reasons",
      downgradeReasonsDesc: "Low actionability, weak pages, expired items, or results not matching the radar.",
      reportSummary: "Report summary",
      copyMarkdown: "Copy Markdown",
      allCards: "View all opportunity cards",
      sourceChecks: "Sources checked this round",
      adjustRadarProfile: "Adjust radar profile",
      backToRadarList: "Back to My Radars",
      viewRadarDetail: "View this radar detail",
      saveHint: "Next time, ChancePing can continue with this radar instead of asking you to describe it again.",
      retrySearch: "Retry search",
      switchDemoMode: "Switch to demo data",
      fullMarkdownReport: "View full Markdown report",
      noExtraSources: "No extra signal sources were specified this round.",
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
