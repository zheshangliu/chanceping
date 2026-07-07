/**
 * ChancePing 首页 Tab 逻辑
 * 来源：Task 038 第 5 节
 *
 * 职责：
 *   - 首页输入框 + MVP 模板
 *   - 模板直接运行预置画像
 *   - 自由输入先生成雷达画像确认卡
 *   - 暴露全局 switchTab / showToast 函数供其他模块共用
 *
 * 纯 JS，无框架，无构建工具。
 */

// ============================================================
// 全局工具函数（供 home.js / requirement-chat.js / watch-rules-editor.js 共用）
// ============================================================

const CUSTOMER_TABS = new Set(["home", "watch-result", "radars"]);
const ADVANCED_PANEL_IDS = [
  "panel-chat",
  "panel-search",
  "panel-opportunities",
  "panel-reports",
  "panel-editor",
];
const advancedPanelVault = new Map();
const advancedTabVault = new Map();

function mountAdvancedPanelForTab(tabName) {
  if (!CUSTOMER_TABS.has(tabName)) {
    const nav = document.querySelector(".tab-nav");
    const tabButton = advancedTabVault.get(tabName);
    if (nav && tabButton && !document.querySelector(`.tab-btn[data-tab="${tabName}"]`)) {
      nav.appendChild(tabButton);
    }
  }
  const panelId = `panel-${tabName}`;
  if (!ADVANCED_PANEL_IDS.includes(panelId)) return;
  if (document.getElementById(panelId)) return;
  const panel = advancedPanelVault.get(panelId);
  const content = document.querySelector(".tab-content");
  if (panel && content) content.appendChild(panel);
}

function detachAdvancedPanelsForCustomerPath() {
  const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab || "home";
  if (!CUSTOMER_TABS.has(activeTab)) return;
  document.querySelectorAll(".advanced-tab").forEach((tab) => {
    if (!tab.dataset.tab) return;
    tab.classList.remove("active");
    advancedTabVault.set(tab.dataset.tab, tab);
    tab.remove();
  });
  ADVANCED_PANEL_IDS.forEach((panelId) => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.remove("active");
    advancedPanelVault.set(panelId, panel);
    panel.remove();
  });
}

/**
 * 切换到指定 Tab。
 * @param {string} tabName - Tab 名称（home / watch-result / radars / advanced tabs）
 */
function switchTab(tabName) {
  if (!CUSTOMER_TABS.has(tabName)) {
    mountAdvancedPanelForTab(tabName);
  }
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${tabName}`);
  });
  if (CUSTOMER_TABS.has(tabName)) {
    window.setTimeout(detachAdvancedPanelsForCustomerPath, 0);
  }
  if (tabName === "home") {
    window.syncHeroEntryVisibility?.({ forceChatActive: true });
  } else {
    document.body.classList.remove("hero-chat-active");
    document.body.classList.remove("hero-home-shell");
  }
  // Task 040: 派发 tab-switched 事件，供 opportunities.js / reports.js 监听加载
  window.dispatchEvent(new CustomEvent("tab-switched", { detail: { tab: tabName } }));
}

/**
 * 显示 Toast 提示。
 * @param {string} message - 提示文案
 * @param {string} [type] - 类型：success / error / warning
 */
function showToast(message, type) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type || ""}`;
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

// 暴露到全局
window.switchTab = switchTab;
window.showToast = showToast;

function hideLegacyTemplatesForHero() {
  [".home-examples-block", ".hero-demo-prompts"].forEach((selector) => {
    const block = document.querySelector(selector);
    if (block) block.hidden = true;
  });
}

window.hideLegacyTemplatesForHero = hideLegacyTemplatesForHero;

function syncLiveSearchPreference(urlParams) {
  const requested = urlParams.get("live_search");
  if (requested === "1" || requested === "true") {
    localStorage.setItem("chanceping_live_search", "true");
  } else if (requested === "0" || requested === "false") {
    localStorage.removeItem("chanceping_live_search");
  }
  const liveEnabled = localStorage.getItem("chanceping_live_search") === "true";
  const badge = document.getElementById("demo-badge");
  if (badge && liveEnabled) {
    badge.textContent = "Live Search 本地试跑";
    badge.style.display = "inline-block";
  }
  return liveEnabled;
}

function getChancePingSearchMode() {
  return localStorage.getItem("chanceping_live_search") === "true" ? "live" : undefined;
}

window.getChancePingSearchMode = getChancePingSearchMode;

// ============================================================
// 首页逻辑
// ============================================================

let selectedTemplate = null;

document.addEventListener("DOMContentLoaded", () => {
  // Task 041: Demo Mode 标识（URL 参数 ?demo=true 触发显示）
  const urlParams = new URLSearchParams(window.location.search);
  syncLiveSearchPreference(urlParams);
  if (urlParams.get("demo") === "true") {
    const badge = document.getElementById("demo-badge");
    if (badge) badge.style.display = "inline-block";
  }

  const input = document.getElementById("home-input");
  const watchBtn = document.getElementById("home-watch-btn");
  if (!input || !watchBtn) return;

  renderMvpTemplates(input);
  hideLegacyTemplatesForHero();
  bindHeroDemoPrompts(input);
  window.setTimeout(detachAdvancedPanelsForCustomerPath, 0);

  document.getElementById("home-attach-btn")?.addEventListener("click", () => {
    showToast("文件会作为画像补充材料使用，不会直接当作机会结果。", "warning");
  });

  document.querySelectorAll("[data-action='open-ai-event-radar']").forEach((button) => button.addEventListener("click", () => {
    if (window.openHeroRadarWindow) {
      window.openHeroRadarWindow();
      return;
    }
    showToast("AI 赛事雷达窗口还没准备好", "warning");
  }));

  document.querySelector("[data-action='create-new-radar']")?.addEventListener("click", () => {
    if (window.createNewHeroRadarWindow) {
      window.createNewHeroRadarWindow("");
      return;
    }
    showToast("新雷达窗口还没准备好", "warning");
  });

  watchBtn.addEventListener("click", () => {
    const text = input.value.trim();
    if (!text) {
      showToast("请输入你想盯的机会", "warning");
      input.focus();
      return;
    }

    if (window.createNewHeroRadarWindow) {
      window.createNewHeroRadarWindow(text)
        .then(() => {
          input.value = "";
          selectedTemplate = null;
        })
        .catch((err) => showToast(err.message || "创建雷达窗口失败", "error"));
      return;
    }

    if (window.startHeroRadarChat) {
      window.startHeroRadarChat(text, { autoSend: false })
        .then(() => {
          input.value = "";
          selectedTemplate = null;
        })
        .catch((err) => showToast(err.message || "生成雷达失败", "error"));
      return;
    }

    if (selectedTemplate && window.runTemplateWatch) {
      window.runTemplateWatch({
        ...selectedTemplate,
        description: text,
      }).catch((err) => showToast(err.message || "盯机会失败", "error"));
      return;
    }

    if (window.createRadarProfileDraft) {
      window.createRadarProfileDraft({ description: text })
        .catch((err) => showToast(err.message || "生成雷达画像失败", "error"));
    }
  });

  // Enter 提交（Shift+Enter 换行）
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      watchBtn.click();
    }
  });

  input.addEventListener("input", () => {
    selectedTemplate = null;
    document.querySelectorAll(".mvp-template-btn").forEach((btn) => btn.classList.remove("active"));
  });
});

function renderMvpTemplates(input) {
  const root = document.getElementById("mvp-template-list");
  if (!root) return;
  const templates = window.CHANCEPING_MVP_TEMPLATES || [];
  root.innerHTML = templates.map((tpl) => (
    `<button class="example-btn mvp-template-btn" data-template-id="${tpl.id}">${tpl.label}</button>`
  )).join("");
  root.querySelectorAll(".mvp-template-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedTemplate = templates.find((item) => item.id === btn.dataset.templateId) || null;
      input.value = selectedTemplate?.description || "";
      root.querySelectorAll(".mvp-template-btn").forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

function bindHeroDemoPrompts(input) {
  document.querySelectorAll("[data-hero-prompt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.heroPrompt || window.CHANCEPING_AI_EVENT_DEMO_PROMPT || "";
      input.focus();
    });
  });
}

/**
 * 发送第一条消息到 /api/chat，并把响应通过事件传给 requirement-chat.js。
 * @param {string} message - 用户输入的需求
 * @param {string} radarType - 雷达类型
 */
async function sendFirstMessage(message, radarType) {
  // 先通知 requirement-chat.js 追加用户消息 + 显示 typing
  window.dispatchEvent(
    new CustomEvent("chat-user-message", { detail: { message } }),
  );
  window.dispatchEvent(new CustomEvent("chat-typing-start"));

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        radar_type: radarType,
      }),
    });
    const json = await res.json();

    window.dispatchEvent(new CustomEvent("chat-typing-end"));

    if (json.success) {
      // 把响应传给 requirement-chat.js 更新 UI
      window.dispatchEvent(
        new CustomEvent("home-chat-response", { detail: json.data }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("chat-error", {
          detail: { message: json.error?.message || "请求失败" },
        }),
      );
    }
  } catch (err) {
    window.dispatchEvent(new CustomEvent("chat-typing-end"));
    window.dispatchEvent(
      new CustomEvent("chat-error", { detail: { message: err.message } }),
    );
  }
}
