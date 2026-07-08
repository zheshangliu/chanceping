(function () {
  "use strict";

  const SIDEBAR_COLLAPSED_KEY = "chanceping-sidebar-collapsed";
  const ANONYMOUS_USER_ID_KEY = "chanceping_hero_visitor_user_id";
  const HERO_CHAT_USER_ID = getHeroChatUserId();
  const STORAGE_KEY = `chanceping_hero_radar_chat_state:${HERO_CHAT_USER_ID}`;
  const LAST_CHAT_WINDOW_KEY = `chanceping_hero_radar_chat_window_id:${HERO_CHAT_USER_ID}`;
  const CHAT_WINDOW_LIMIT = 3;
  const QUOTA_ERROR_CODE = "RADAR_CHAT_QUOTA_EXCEEDED";
  const LONG_OPERATION_TIMEOUT_MS = 10 * 60 * 1000;
  const HERO_DEMO_PROMPT = "我是大湾区的 OPC / AI 产品创业者，正在打磨 ChancePing AI 赛事雷达 Demo。我想找未来 30-60 天内仍可报名、可提交项目或作品、适合个人开发者或小团队参加的 AI 比赛、AI Agent Hackathon、AI 创作赛事、AI IDE / Vibe Coding 比赛、云厂商开发者挑战、创业扶持和产品展示机会。请优先搜索 Qwen Cloud Hackathon、TRAE、Devpost、DoraHacks、Lablab.ai、Kaggle、阿里云、腾讯云、AWS、Google Cloud、Microsoft、GitHub、Hugging Face、Product Hunt、AI Grant、粤港澳大湾区和海外线上比赛，以及官方报名页、赛事官网、云厂商活动页和主办方公告。请排除展会资讯、培训广告、学生专属且 OPC 不能参加的比赛、已截止活动、纯新闻转载、社媒转帖和没有报名入口的页面。报告里请按 S/A/B/C 评级，给我报名截止、奖金或云资源、参赛资格、适合 ChancePing 的打法、材料清单、风险提醒，并明确本周先做哪三件事。";
  const AI_EVENT_SAMPLE_ROOM = {
    id: "ai-event-sample-room",
    name: "全球 AI 赛事导航",
    version: "V1.0",
    isSampleRoom: true,
  };

  function backendText(key, fallback) {
    return window.CHANCEPING_BACKEND_I18N?.t?.(key) || fallback || key;
  }

  function currentBackendLanguage() {
    return window.CHANCEPING_BACKEND_I18N?.getLanguage?.() || "zh";
  }

  const heroRadarChatState = {
    messages: [],
    currentDraft: null,
    currentResult: null,
    confirmedVersion: null,
    copiedRadarId: null,
    chatWindowId: null,
    activeChatWindowId: AI_EVENT_SAMPLE_ROOM.id,
    chatWindows: [],
    archivedChatWindows: [],
    showArchivedWindows: false,
    boundRadarId: AI_EVENT_SAMPLE_ROOM.id,
    pendingFirstMessage: "",
    pendingRevisionTrigger: "",
    sidebarCollapsed: false,
    homeEntryMode: false,
    modal: null,
    isBusy: false,
  };

  let pendingChatWindowRequest = null;
  let pendingInputSaveTimer = null;

  function getHeroChatUserId() {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("hero_chat_user_id") || params.get("test_user_id") || "";
      const value = raw.trim();
      if (/^[a-zA-Z0-9_.-]{1,80}$/.test(value)) return value;

      const stored = localStorage.getItem(ANONYMOUS_USER_ID_KEY) || "";
      if (/^visitor_[a-zA-Z0-9_.-]{8,80}$/.test(stored)) return stored;

      const anonymousId = createAnonymousHeroUserId();
      localStorage.setItem(ANONYMOUS_USER_ID_KEY, anonymousId);
      return anonymousId;
    } catch {
      return createAnonymousHeroUserId();
    }
  }

  function createAnonymousHeroUserId() {
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 24)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
    return `visitor_${random}`;
  }

  const CUSTOMER_LABELS = {
    direct_opportunity: "可直接行动的比赛机会",
    business_lead: "需要联系确认的合作线索",
    channel_partner_lead: "潜在渠道或伙伴线索",
    customer_lead: "潜在客户线索",
    association_directory: "协会或赛事目录",
    watch_signal: "观察信号",
    reference_case: "参考案例",
    rejected: "已降权或淘汰",
    official_event_site: "官方赛事页",
    official_announcement: "官方公告",
    application_portal: "报名/提交入口",
    developer_platform_challenge_page: "开发者挑战赛页面",
    cloud_provider_activity_page: "云厂商活动页",
    hackathon_platform: "Hackathon 平台",
    competition_platform: "比赛平台",
    association_directory_page: "协会或行业目录页",
    partner_directory: "合作伙伴目录",
    open_call_submission_page: "开放征集/提交入口",
    reference_case_source: "参考案例来源",
  };

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function asArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }

  function customerLabel(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (CUSTOMER_LABELS[raw]) return CUSTOMER_LABELS[raw];
    return raw
      .replace(/\b(direct_opportunity|business_lead|channel_partner_lead|customer_lead|association_directory|watch_signal|reference_case)\b/g, (token) => CUSTOMER_LABELS[token] || token)
      .replace(/\b(official_event_site|official_announcement|application_portal|developer_platform_challenge_page|cloud_provider_activity_page|hackathon_platform|competition_platform|partner_directory|open_call_submission_page)\b/g, (token) => CUSTOMER_LABELS[token] || token)
      .replace(/_/g, " ")
      .replace(/\s*\|\s*/g, " / ");
  }

  async function fetchWithTimeout(url, init = {}, timeoutMs = LONG_OPERATION_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: init.signal || controller.signal,
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        const error = new Error("这次盯机会等待超过 10 分钟。雷达已保留，你可以稍后重试；如果线上仍反复超时，需要把线上网关等待时间延长到 10 分钟。");
        error.code = "CLIENT_LONG_OPERATION_TIMEOUT";
        throw error;
      }
      throw err;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function postJson(url, body, options = {}) {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, options.timeoutMs || LONG_OPERATION_TIMEOUT_MS);
    const json = await parseJsonResponse(res);
    if (!json.success) {
      const error = new Error(json.error?.message || "请求失败");
      error.code = json.error?.code || "";
      throw error;
    }
    return json.data;
  }

  async function getJson(url, options = {}) {
    const res = await fetchWithTimeout(url, {}, options.timeoutMs || LONG_OPERATION_TIMEOUT_MS);
    const json = await parseJsonResponse(res);
    if (!json.success) {
      const error = new Error(json.error?.message || "请求失败");
      error.code = json.error?.code || "";
      throw error;
    }
    return json.data;
  }

  async function patchJson(url, body, options = {}) {
    const res = await fetchWithTimeout(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, options.timeoutMs || LONG_OPERATION_TIMEOUT_MS);
    const json = await parseJsonResponse(res);
    if (!json.success) {
      const error = new Error(json.error?.message || "请求失败");
      error.code = json.error?.code || "";
      throw error;
    }
    return json.data;
  }

  async function deleteJson(url, options = {}) {
    const res = await fetchWithTimeout(url, { method: "DELETE" }, options.timeoutMs || LONG_OPERATION_TIMEOUT_MS);
    const json = await parseJsonResponse(res);
    if (!json.success) {
      const error = new Error(json.error?.message || "请求失败");
      error.code = json.error?.code || "";
      throw error;
    }
    return json.data;
  }

  async function putJson(url, body, options = {}) {
    const res = await fetchWithTimeout(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, options.timeoutMs || LONG_OPERATION_TIMEOUT_MS);
    const json = await parseJsonResponse(res);
    if (!json.success) {
      const error = new Error(json.error?.message || "请求失败");
      error.code = json.error?.code || "";
      throw error;
    }
    return json.data;
  }

  async function parseJsonResponse(res) {
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();
    if (!contentType.includes("application/json")) {
      const looksLikeHtml = /<html|<!doctype|<body/i.test(text);
      const looksLikeGatewayTimeout = res.status === 504 || /504 Gateway Time-out|gateway time-out|upstream timed out/i.test(text);
      const error = new Error(looksLikeGatewayTimeout
        ? "这次搜索超过了线上网关等待时间。雷达已保留，你可以稍后重试；如果频繁出现，需要改成长任务或提高网关等待时间到 10 分钟。"
        : looksLikeHtml
          ? "服务器返回了网页错误页，不是 JSON。雷达已保留，你可以稍后重试；如果刚刚更新过线上服务，请检查网关是否允许 10 分钟长请求。"
          : `服务器返回了非 JSON 响应：${text.slice(0, 120) || res.statusText}`);
      error.code = looksLikeGatewayTimeout ? "GATEWAY_TIMEOUT" : "NON_JSON_RESPONSE";
      error.status = res.status;
      throw error;
    }
    try {
      return JSON.parse(text || "{}");
    } catch {
      const error = new Error("服务器返回的 JSON 无法解析，请稍后重试。");
      error.code = "INVALID_JSON_RESPONSE";
      error.status = res.status;
      throw error;
    }
  }

  function artifactTypeForPersistence(artifact) {
    if (!artifact || typeof artifact !== "object") return undefined;
    if (artifact.type === "radar" || artifact.type === "report" || artifact.type === "progress") {
      return artifact.type;
    }
    return undefined;
  }

  async function ensureRadarChatWindow() {
    if (heroRadarChatState.chatWindowId) return heroRadarChatState.chatWindowId;
    if (pendingChatWindowRequest) return pendingChatWindowRequest;
    const draft = heroRadarChatState.currentDraft;
    pendingChatWindowRequest = postJson("/api/radar-chats", {
      radarId: heroRadarChatState.boundRadarId || heroRadarChatState.copiedRadarId || undefined,
      title: getDraftDisplayName(draft),
      userId: HERO_CHAT_USER_ID,
      reuseByRadarId: heroRadarChatState.boundRadarId ? true : false,
      draftRadarVersion: draft?.radarVersion?.version || "V1.0",
    })
      .then((windowData) => {
        heroRadarChatState.chatWindowId = windowData.id;
        heroRadarChatState.activeChatWindowId = isSampleRoomWindow(windowData) ? AI_EVENT_SAMPLE_ROOM.id : windowData.id;
        if (windowData.radarId) heroRadarChatState.boundRadarId = windowData.radarId;
        rememberLastChatWindow(windowData.id);
        loadRadarChatWindows().then(() => renderHeroRadarChat()).catch(() => {});
        saveState();
        return windowData.id;
      })
      .catch(() => null)
      .finally(() => {
        pendingChatWindowRequest = null;
      });
    return pendingChatWindowRequest;
  }

  function persistChatMessage(message) {
    ensureRadarChatWindow()
      .then((chatWindowId) => {
        if (!chatWindowId) return null;
        return postJson(`/api/radar-chats/${chatWindowId}/messages`, {
          role: message.role === "user" ? "user" : "assistant",
          content: message.content || artifactTypeForPersistence(message.artifact) || " ",
          linkedRadarVersion: message.artifact?.version || heroRadarChatState.currentDraft?.radarVersion?.version,
          linkedRunId: message.artifact?.runId,
          linkedReportId: message.artifact?.reportId,
          artifactType: artifactTypeForPersistence(message.artifact),
          artifactPayload: message.artifact || undefined,
        });
      })
      .catch(() => {
        // Persistence is best-effort; the UI must not block if the local store is unavailable.
      });
  }

  function updateRadarChatWindow(patch) {
    const payload = {
      ...patch,
      ...(!("draftSnapshot" in patch) && heroRadarChatState.currentDraft ? { draftSnapshot: heroRadarChatState.currentDraft } : {}),
      ...(!("currentResultSnapshot" in patch) && heroRadarChatState.currentResult ? { currentResultSnapshot: heroRadarChatState.currentResult } : {}),
    };
    ensureRadarChatWindow()
      .then((chatWindowId) => {
        if (!chatWindowId) return null;
        return patchJson(`/api/radar-chats/${chatWindowId}`, payload);
      })
      .catch(() => {
        // Keep chat usable even when the local persistence API is unavailable.
      });
  }

  function syncPendingInputMessage(value) {
    const text = String(value || "");
    heroRadarChatState.pendingFirstMessage = text;
    saveState();
    if (!heroRadarChatState.chatWindowId || heroRadarChatState.boundRadarId === AI_EVENT_SAMPLE_ROOM.id) return;
    if (pendingInputSaveTimer) {
      window.clearTimeout(pendingInputSaveTimer);
    }
    const chatWindowId = heroRadarChatState.chatWindowId;
    pendingInputSaveTimer = window.setTimeout(() => {
      patchJson(`/api/radar-chats/${chatWindowId}`, { pendingMessage: text }).catch(() => {
        // Draft persistence is best-effort; the user can keep typing even if storage is unavailable.
      });
    }, 250);
  }

  function buildMemorySummaryFromDraft(extra = {}) {
    const version = heroRadarChatState.currentDraft?.radarVersion || {};
    const summary = version.oneSentencePositioning || heroRadarChatState.currentDraft?.description || "机会雷达正在学习你的需求。";
    return {
      summary,
      targetUser: formatReadableItem(version.targetUser),
      watchingFor: [
        ...asArray(version.opportunityIntents),
        ...asArray(version.highValueCriteria),
      ].map(formatReadableItem).filter(Boolean).slice(0, 12),
      exclusions: asArray(version.exclusionRules).map(formatReadableItem).filter(Boolean).slice(0, 12),
      confirmedRules: asArray(version.highValueCriteria).map(formatReadableItem).filter(Boolean).slice(0, 8),
      rejectedPatterns: asArray(version.exclusionRules).map(formatReadableItem).filter(Boolean).slice(0, 8),
      ...extra,
    };
  }

  function persistMemorySummary(extra = {}) {
    ensureRadarChatWindow()
      .then((chatWindowId) => {
        if (!chatWindowId) return null;
        return putJson(`/api/radar-chats/${chatWindowId}/memory-summary`, buildMemorySummaryFromDraft(extra));
      })
      .catch(() => {
        // Non-blocking persistence.
      });
  }

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(heroRadarChatState));
    } catch {
      // Ignore storage limits; the in-memory chat state still works.
    }
  }

  function rememberLastChatWindow(chatWindowId) {
    if (!chatWindowId) return;
    try {
      localStorage.setItem(LAST_CHAT_WINDOW_KEY, chatWindowId);
    } catch {
      // Reload recovery is best-effort.
    }
  }

  function forgetLastChatWindow() {
    try {
      localStorage.removeItem(LAST_CHAT_WINDOW_KEY);
    } catch {
      // Ignore storage errors.
    }
  }

  function getLastChatWindowId() {
    try {
      return localStorage.getItem(LAST_CHAT_WINDOW_KEY) || "";
    } catch {
      return "";
    }
  }

  function isSampleRoomWindowId(chatWindowId) {
    return chatWindowId === AI_EVENT_SAMPLE_ROOM.id;
  }

  function isSampleRoomWindow(windowData) {
    return windowData?.id === AI_EVENT_SAMPLE_ROOM.id || windowData?.radarId === AI_EVENT_SAMPLE_ROOM.id;
  }

  function isAiContestRadarText(value) {
    const raw = String(value || "");
    if (!raw.trim()) return false;
    const hasContestIntent = /赛事|比赛|竞赛|Hackathon|黑客松|马拉松|挑战赛|开发者挑战|可报名|提交作品|云资源|奖金赛/i.test(raw);
    const hasAiContext = /AI|AIGC|Agent|智能|大模型|开发者|OPC|Vibe\s*Coding|云厂商/i.test(raw);
    return hasContestIntent && hasAiContext;
  }

  function isAiContestRadarPayload(payload) {
    const text = [
      payload?.name,
      payload?.oneSentencePositioning,
      payload?.businessContext,
      payload?.targetUser,
      ...asArray(payload?.opportunityIntents),
      ...asArray(payload?.highValueCriteria),
      ...asArray(payload?.queryFamilies).map(formatReadableItem),
    ].filter(Boolean).join(" ");
    return isAiContestRadarText(text);
  }

  function getRadarKindLabel(payload) {
    if (shouldUseHeroDemoReplay()) return "AI 赛事雷达";
    return isAiContestRadarPayload(payload) ? "AI 赛事雷达" : "机会雷达";
  }

  function getDraftDisplayName(draft, fallbackText = "机会雷达") {
    const value = draft?.suggestedName
      || draft?.radarVersion?.oneSentencePositioning
      || draft?.radarVersion?.name
      || draft?.spec?.name
      || inferRadarTitle(draft?.description);
    return String(value || fallbackText).trim() || fallbackText;
  }

  function shouldDetachSampleRoomForMessage(text) {
    return heroRadarChatState.boundRadarId === AI_EVENT_SAMPLE_ROOM.id
      && !heroRadarChatState.currentDraft
      && !isAiContestRadarText(text);
  }

  function inferRadarTitle(text) {
    const raw = String(text || "").trim();
    if (!raw) return "新机会雷达";
    if (isAiContestRadarText(raw)) return "AI 赛事雷达";
    if (/补贴|申报|政策|专精特新|高新/i.test(raw)) return "政策申报雷达";
    if (/客户|线索|BD|销售|渠道|代理/i.test(raw)) return "客户线索雷达";
    const intentMatch = raw.match(/(?:想找|寻找|希望找|帮我找|盯一下|盯|需要)([^。；;，,]{2,32})/);
    const intentPhrase = cleanRadarTitlePhrase(intentMatch?.[1] || "");
    if (intentPhrase) return `${intentPhrase}雷达`;
    const compact = cleanRadarTitlePhrase(raw.replace(/\s+/g, " ").slice(0, 24));
    return compact ? `${compact}雷达` : "新机会雷达";
  }

  function cleanRadarTitlePhrase(value) {
    return String(value || "")
      .replace(/^(一些|更多|近期|未来\s*\d+\s*天内|可以|可报名|的)+/i, "")
      .replace(/[。；;，,]/g, "")
      .replace(/\s+/g, " ")
      .replace(/雷达$/, "")
      .trim()
      .slice(0, 24);
  }

  function getSampleSidebarWindow() {
    return {
      id: AI_EVENT_SAMPLE_ROOM.id,
      radarId: AI_EVENT_SAMPLE_ROOM.id,
      title: AI_EVENT_SAMPLE_ROOM.name,
      draftRadarVersion: AI_EVENT_SAMPLE_ROOM.version,
      currentConfirmedRadarVersion: AI_EVENT_SAMPLE_ROOM.version,
      status: "active",
      updatedAt: new Date(0).toISOString(),
      isSampleRoom: true,
    };
  }

  function normalizeSidebarWindow(windowData) {
    return {
      id: windowData.id,
      radarId: windowData.radarId || "",
      title: windowData.title || "机会雷达",
      draftRadarVersion: windowData.draftRadarVersion || windowData.currentConfirmedRadarVersion || "V1.0",
      currentConfirmedRadarVersion: windowData.currentConfirmedRadarVersion || "",
      status: windowData.status || "active",
      updatedAt: windowData.updatedAt || "",
      isSampleRoom: false,
    };
  }

  function sidebarWindowTime(windowData) {
    const timestamp = Date.parse(windowData?.updatedAt || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function compactSidebarWindows(windows, limit = 8) {
    const seen = new Set();
    return [...windows]
      .sort((a, b) => sidebarWindowTime(b) - sidebarWindowTime(a))
      .filter((item) => {
        const key = item.radarId ? `radar:${item.radarId}` : `chat:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  function getActiveCustomWindowCount() {
    return Math.max(0, (heroRadarChatState.chatWindows || []).filter((item) => !isSampleRoomWindow(item) && item.status !== "archived").length);
  }

  function isChatWindowQuotaFull() {
    return getActiveCustomWindowCount() >= CHAT_WINDOW_LIMIT;
  }

  async function loadRadarChatWindows() {
    try {
      const windows = await getJson(`/api/radar-chats?user_id=${encodeURIComponent(HERO_CHAT_USER_ID)}&include_archived=true`);
      const normalized = (Array.isArray(windows) ? windows : [])
        .filter((item) => !isSampleRoomWindow(item))
        .map(normalizeSidebarWindow);
      const activeWindows = normalized.filter((item) => item.status !== "archived");
      const archivedWindows = normalized.filter((item) => item.status === "archived");
      heroRadarChatState.chatWindows = [getSampleSidebarWindow(), ...compactSidebarWindows(activeWindows, Number.POSITIVE_INFINITY)];
      heroRadarChatState.archivedChatWindows = compactSidebarWindows(archivedWindows);
      renderHomeRadarSidebar();
      saveState();
      return heroRadarChatState.chatWindows;
    } catch {
      heroRadarChatState.chatWindows = [getSampleSidebarWindow()];
      heroRadarChatState.archivedChatWindows = [];
      renderHomeRadarSidebar();
      saveState();
      return heroRadarChatState.chatWindows;
    }
  }

  function renderHomeRadarSidebar() {
    const section = document.querySelector(".home-sidebar-section");
    if (!section) return;
    section.querySelector(".home-custom-radar-list")?.remove();
    const customWindows = (heroRadarChatState.chatWindows || []).filter((item) => !isSampleRoomWindow(item) && item.status !== "archived");
    const wrap = document.createElement("div");
    wrap.className = "home-custom-radar-list";
    if (customWindows.length > 0) {
      wrap.innerHTML = `
        <span class="home-sidebar-subtitle">自定义雷达窗口</span>
        ${customWindows.map((windowData) => `
          <button class="home-radar-window custom" type="button" data-action="switch-home-radar-window" data-chat-window-id="${escapeHtml(windowData.id)}">
            <strong>${escapeHtml(windowData.title || "机会雷达")}</strong>
            <small>${escapeHtml(windowData.draftRadarVersion || windowData.currentConfirmedRadarVersion || "V1.0")} · 雷达窗口</small>
          </button>
        `).join("")}
      `;
    } else {
      wrap.innerHTML = `<p class="home-sidebar-empty">还没有自定义雷达窗口。</p>`;
    }
    section.appendChild(wrap);
    wrap.querySelectorAll("[data-action='switch-home-radar-window']").forEach((button) => {
      button.addEventListener("click", () => {
        switchHeroRadarWindow(button.dataset.chatWindowId || "").catch((err) => window.showToast?.(err.message || "打开雷达窗口失败", "error"));
      });
    });
  }

  function restoreState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.messages)) return;
      heroRadarChatState.messages = parsed.messages;
      heroRadarChatState.currentDraft = parsed.currentDraft || null;
      heroRadarChatState.currentResult = parsed.currentResult || null;
      if (heroRadarChatState.currentResult) {
        window.persistWatchResult?.(heroRadarChatState.currentResult);
      }
      heroRadarChatState.confirmedVersion = parsed.confirmedVersion || null;
      heroRadarChatState.copiedRadarId = parsed.copiedRadarId || null;
      heroRadarChatState.chatWindowId = parsed.chatWindowId || null;
      heroRadarChatState.activeChatWindowId = parsed.activeChatWindowId || parsed.chatWindowId || AI_EVENT_SAMPLE_ROOM.id;
      heroRadarChatState.chatWindows = Array.isArray(parsed.chatWindows) ? parsed.chatWindows : [];
      heroRadarChatState.archivedChatWindows = Array.isArray(parsed.archivedChatWindows) ? parsed.archivedChatWindows : [];
      heroRadarChatState.showArchivedWindows = parsed.showArchivedWindows === true;
      if (parsed.boundRadarId === AI_EVENT_SAMPLE_ROOM.id) {
        heroRadarChatState.activeChatWindowId = AI_EVENT_SAMPLE_ROOM.id;
      }
      if (heroRadarChatState.chatWindowId) {
        rememberLastChatWindow(heroRadarChatState.chatWindowId);
      }
      if (Object.prototype.hasOwnProperty.call(parsed, "boundRadarId")) {
        heroRadarChatState.boundRadarId = parsed.boundRadarId || null;
      }
      heroRadarChatState.pendingFirstMessage = parsed.pendingFirstMessage || "";
      heroRadarChatState.modal = parsed.modal || null;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    try {
      heroRadarChatState.sidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      heroRadarChatState.sidebarCollapsed = false;
    }
  }

  function restoreMessageFromBackend(message) {
    return {
      id: message.id || uid(message.role || "message"),
      role: message.role === "user" ? "user" : "assistant",
      content: message.content || "",
      artifact: message.artifactPayload || (message.artifactType ? {
        type: message.artifactType,
        version: message.linkedRadarVersion,
        runId: message.linkedRunId,
        reportId: message.linkedReportId,
      } : undefined),
      createdAt: message.createdAt || new Date().toISOString(),
    };
  }

  async function restoreStateFromBackend(chatWindowIdOverride) {
    if (!chatWindowIdOverride && heroRadarChatState.messages.length > 0) return false;
    const chatWindowId = chatWindowIdOverride || getLastChatWindowId();
    if (!chatWindowId) return false;
    if (isSampleRoomWindowId(chatWindowId)) {
      openHeroRadarWindow();
      return true;
    }
    const detail = await getJson(`/api/radar-chats/${chatWindowId}`);
    const windowData = detail.window;
    const messages = Array.isArray(detail.messages) ? detail.messages : [];
    if (!windowData) return false;
    heroRadarChatState.messages = [];
    heroRadarChatState.currentDraft = null;
    heroRadarChatState.currentResult = null;
    heroRadarChatState.confirmedVersion = null;
    heroRadarChatState.copiedRadarId = null;
    heroRadarChatState.pendingFirstMessage = typeof windowData.pendingMessage === "string" ? windowData.pendingMessage : "";
    heroRadarChatState.modal = null;
    heroRadarChatState.isBusy = false;
    heroRadarChatState.homeEntryMode = false;
    delete document.body.dataset.heroHomeEntry;
    heroRadarChatState.chatWindowId = windowData.id;
    heroRadarChatState.activeChatWindowId = windowData.id;
    heroRadarChatState.boundRadarId = windowData.radarId || null;
    heroRadarChatState.currentDraft = windowData.draftSnapshot || null;
    heroRadarChatState.currentResult = windowData.currentResultSnapshot || null;
    if (heroRadarChatState.currentResult) {
      window.persistWatchResult?.(heroRadarChatState.currentResult);
    }
    heroRadarChatState.confirmedVersion = windowData.currentConfirmedRadarVersion || null;
    heroRadarChatState.messages = messages.map(restoreMessageFromBackend);
    if (heroRadarChatState.messages.length === 0) {
      heroRadarChatState.messages = [{
        id: uid("assistant"),
        role: "assistant",
        content: `已打开「${windowData.title || "机会雷达"}」的雷达窗口。你可以在下方继续补充需求，我会先更新雷达给你确认。`,
        createdAt: new Date().toISOString(),
      }];
    }
    rememberLastChatWindow(windowData.id);
    await loadRadarChatWindows();
    saveState();
    renderHeroRadarChat();
    return true;
  }

  function addMessage(role, content, artifact) {
    const message = {
      id: uid(role),
      role,
      content,
      artifact,
      createdAt: new Date().toISOString(),
    };
    heroRadarChatState.messages.push(message);
    saveState();
    renderHeroRadarChat();
    persistChatMessage(message);
    return message;
  }

  function updateMessageArtifact(messageId, updater) {
    const message = findMessageById(messageId);
    if (!message) return;
    message.artifact = typeof updater === "function" ? updater(message.artifact || {}) : updater;
    saveState();
    renderHeroRadarChat();
  }

  function renderList(title, items, fallbackItems = []) {
    const sourceItems = asArray(items).length > 0 ? items : fallbackItems;
    const list = [...new Set(asArray(sourceItems).map(formatReadableItem).filter(Boolean))];
    if (list.length === 0) return "";
    return `
      <div class="hero-artifact-field">
        <strong>${escapeHtml(title)}</strong>
        <ul>${list.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    `;
  }

  function formatReadableItem(item) {
    if (item == null) return "";
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      return customerLabel(item);
    }
    if (Array.isArray(item)) {
      return item.map(formatReadableItem).filter(Boolean).join(" / ");
    }
    if (typeof item === "object") {
      const title = item.themeName || item.queryFamily || item.name || item.label || item.sourceArchetype || item.intentType;
      const examples = asArray(item.queryExamples).slice(0, 2).map(formatReadableItem).filter(Boolean);
      const intent = customerLabel(item.intentType);
      const source = customerLabel(item.sourceArchetype);
      const parts = [
        customerLabel(title),
        intent && intent !== customerLabel(title) ? `类型：${intent}` : "",
        source && source !== customerLabel(title) ? `来源：${source}` : "",
        examples.length ? `示例关键词：${examples.join("；")}` : "",
      ].filter(Boolean);
      if (parts.length > 0) return parts.join("｜");
      return Object.values(item).flatMap((value) => asArray(value).map(formatReadableItem)).filter(Boolean).slice(0, 3).join(" / ");
    }
    return String(item);
  }

  function buildReadableRadarTitle(payload) {
    const targetUser = formatReadableItem(payload?.targetUser).replace(/\s+/g, " ").trim();
    const radarKind = getRadarKindLabel(payload);
    const rawTitle = String(payload?.oneSentencePositioning || payload?.name || radarKind)
      .replace(/机会机会雷达/g, "机会雷达")
      .replace(/雷达雷达/g, "雷达")
      .replace(/\s+/g, " ")
      .trim();
    if (targetUser && rawTitle.length > 34) {
      const cleanTarget = targetUser
        .replace(/ \/ AI 产品创业者/g, "")
        .replace(/AI 产品创业者/g, "AI 创业者")
        .replace(/大湾区的\s*/g, "大湾区 ")
        .replace(/的$/, "")
        .slice(0, 18);
      return `${cleanTarget}的${radarKind}`.replace(/\s+/g, " ");
    }
    return rawTitle || radarKind;
  }

  function renderDiffList(title, items) {
    const list = asArray(items);
    if (list.length === 0) return "";
    return `
      <div class="hero-diff-row">
        <span>${escapeHtml(title)}</span>
        <p>${list.map(escapeHtml).join("；")}</p>
      </div>
    `;
  }

  function openHeroModal(modal) {
    heroRadarChatState.modal = modal;
    saveState();
    renderHeroRadarChat();
  }

  function closeHeroModal() {
    heroRadarChatState.modal = null;
    saveState();
    renderHeroRadarChat();
  }

  function findRadarArtifactByVersion(version) {
    return heroRadarChatState.messages
      .map((message) => message.artifact)
      .find((artifact) => artifact?.type === "radar" && (artifact.version || artifact.payload?.version) === version);
  }

  function findMessageById(messageId) {
    return heroRadarChatState.messages.find((message) => message.id === messageId);
  }

  function summarizeDiff(diff) {
    const highlights = [
      ...asArray(diff.added),
      ...asArray(diff.upweighted),
      ...asArray(diff.downweighted),
      ...asArray(diff.exclusionChanges),
    ].map(formatReadableItem).filter(Boolean);
    return [...new Set(highlights)].slice(0, 3).join("；") || "已根据你的反馈更新雷达";
  }

  function summarizeOpportunityCards(cards) {
    const list = Array.isArray(cards) ? cards : [];
    const levelRank = { S: 0, A: 1, B: 2, C: 3 };
    const sorted = [...list].sort((a, b) => {
      const aLevel = levelRank[a.visible_level || a.level] ?? 9;
      const bLevel = levelRank[b.visible_level || b.level] ?? 9;
      if (aLevel !== bLevel) return aLevel - bLevel;
      return (b.backend_score || b.score || 0) - (a.backend_score || a.score || 0);
    });
    const levelCounts = list.reduce((acc, card) => {
      const level = card.visible_level || card.level || "待复核";
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});
    const levelText = ["S", "A", "B", "C"]
      .map((level) => `${level} 级 ${levelCounts[level] || 0} 条`)
      .join("，");
    const topCards = sorted
      .filter((card) => card.title)
      .slice(0, 3)
      .map((card) => ({
        title: card.title,
        level: card.visible_level || card.level || "待复核",
        reason: card.match_reason || card.next_action || "与本版机会雷达相关，建议打开来源复核。",
      }));
    return {
      total: list.length,
      levelText,
      topTitle: topCards[0]?.title || "",
      topCards,
      levelCounts,
    };
  }

  function buildReportRecommendation(summary) {
    const counts = summary?.levelCounts || {};
    if ((counts.S || 0) + (counts.A || 0) > 0) {
      return "优先处理 S/A 级机会，先复核官方报名入口、截止时间和参赛资格。";
    }
    if ((counts.B || 0) > 0) {
      return "本轮先复核 B 级机会，确认官方入口和截止时间后再决定是否投入。";
    }
    if ((counts.C || 0) > 0) {
      return "本轮多为观察线索，先追溯官方来源，不要直接当作可报名机会。";
    }
    return "本轮没有足够强的行动机会，建议继续补充信号源或调整雷达。";
  }

  function buildHeroActionItems(summary) {
    const top = summary?.topCards || [];
    if (top.length > 0) {
      return [
        `先打开 ${top[0].title} 的官方来源，复核报名入口、截止时间和参赛资格。`,
        "把 S/A 级机会需要的项目介绍、Demo 链接、团队资料和作品说明先整理出来。",
        "把不符合 OPC / 个人开发者的学生专属、展会资讯或纯新闻结果反馈给我，我会先升级雷达。",
      ];
    }
    return [
      "补充更明确的地区、平台或主办方，例如 Qwen、TRAE、Devpost、DoraHacks。",
      "放宽或调整排除条件后重新确认雷达，再跑一次搜索。",
      "增加你愿意参加的机会形态，例如奖金赛、云资源扶持、产品展示或 Hackathon。",
    ];
  }

  function shouldUseHeroDemoReplay() {
    return heroRadarChatState.boundRadarId === AI_EVENT_SAMPLE_ROOM.id && AI_EVENT_SAMPLE_ROOM.isSampleRoom === true;
  }

  function normalizeHeroDemoRadarVersion(draft) {
    if (!shouldUseHeroDemoReplay() || !draft) return draft;
    const radarVersion = {
      ...(draft.radarVersion || {}),
      version: "V1.0",
    };
    const spec = {
      ...(draft.spec || {}),
      radar_version: {
        ...(draft.spec?.radar_version || {}),
        version: "V1.0",
      },
    };
    return {
      ...draft,
      spec,
      radarVersion,
      radarDiff: null,
    };
  }

  function getHeroDemoReplayDelayMs() {
    const params = new URLSearchParams(window.location.search);
    return params.get("q7v_fast") === "1" ? 1200 : 10000;
  }

  function getPublicEventSourceUrl(item) {
    return item?.registrationUrl || item?.officialUrl || item?.official_source_url || item?.url || item?.source_url || "#";
  }

  function mapPublicAiEventToOpportunityCard(item, index) {
    const level = index < 2 ? "A" : index < 8 ? "B" : "C";
    const sourceUrl = getPublicEventSourceUrl(item);
    const categories = Array.isArray(item?.categoryTags) ? item.categoryTags.map((category) => category.label).filter(Boolean) : [];
    const reward = item?.prize && item.prize !== "见官网" ? item.prize : item?.rewardTypeLabel || "见官网";
    const deadline = item?.deadlineDisplay || item?.deadline || "见官网";
    const reason = item?.reason || item?.summary || item?.description || "这是 AI 赛事雷达最近一次入库的机会，适合先打开官方来源确认报名路径。";
    return {
      id: item?.id || `public_ai_event_${index + 1}`,
      title: item?.title || "未命名 AI 赛事机会",
      url: sourceUrl,
      official_source_url: sourceUrl,
      visible_level: item?.visible_level || item?.level || level,
      level: item?.visible_level || item?.level || level,
      opportunity_kind: item?.candidateType || "direct_opportunity",
      evidence_status: item?.evidenceStatus || "partially_verified",
      action_status: "prepare",
      data_mode: "demo_replay",
      source_disclaimer: "这是 AI 赛事雷达最近一次入库结果；报名资格、费用、截止时间和奖项义务仍以官方页面为准。",
      match_reason: reason,
      next_action: "打开官方来源，确认报名入口、截止时间、参赛资格和材料要求。",
      deadline,
      reward,
      organizer: item?.organizer || item?.sourceName || "见官网",
      categories,
      recommendedActions: [
        "打开官方来源确认报名入口和截止时间。",
        "整理项目介绍、Demo 链接、团队资料和作品说明。",
        "如果这类机会不符合你的目标，回到聊天框告诉我，我会先升级雷达。",
      ],
      ai_analysis: reason,
    };
  }

  function buildHeroDemoReplayMarkdown(feed, cards, version) {
    const stats = feed?.stats || {};
    const topCards = cards.slice(0, 5);
    const lines = [
      `# AI 赛事雷达 ${version}｜最近一次机会报告`,
      "",
      "本报告来自 AI 赛事雷达最近一次已入库结果回放，用于演示 ChancePing 的长期雷达工作流；不是本次点击后重新实时搜索全网。",
      "",
      "## 本轮概览",
      `- 当前有效机会：${stats.currentCount ?? cards.length} 条`,
      `- 历史赛事：${stats.historicalCount ?? 0} 条`,
      `- 已入库机会：${stats.databaseCount ?? cards.length} 条`,
      "- 更新策略：公有 AI 赛事雷达按后台任务定期运行，发现新增后写入数据库与公开导航页。",
      "",
      "## 建议先看",
      ...topCards.map((card, index) => `${index + 1}. ${card.title}｜${card.visible_level || "C"} 级｜截止：${card.deadline || "见官网"}｜奖金/资源：${card.reward || "见官网"}`),
      "",
      "## 本周行动建议",
      "- 先打开 A/B 级机会的官方来源，确认报名入口、截止时间和参赛资格。",
      "- 准备项目一句话介绍、Demo 链接、作品截图、团队介绍和参赛材料。",
      "- 如果你只想要某类比赛，例如 AI Agent、Vibe Coding 或云资源赛，在聊天框继续告诉我，我会先升级雷达。",
      "",
      "## 可信度说明",
      "搜索发现和已入库不等于最终报名事实；参赛资格、费用、截止时间、奖项义务和作品提交规则仍以官方页面为准。",
    ];
    return lines.join("\n");
  }

  async function fetchPublicAiEventsForReplay() {
    const params = new URLSearchParams({
      status: "current",
      page: "1",
      page_size: "60",
    });
    return getJson(`/api/public/ai-events?${params.toString()}`);
  }

  async function runHeroDemoReplay(draft, confirmedSpec, version, progressMessage) {
    updateMessageArtifact(progressMessage.id, (artifact) => ({
      ...artifact,
      currentProgressLine: "正在读取 AI 赛事雷达最近一次入库结果……",
    }));
    const feed = await fetchPublicAiEventsForReplay();
    const items = Array.isArray(feed?.items) ? feed.items : [];
    const cards = items.map(mapPublicAiEventToOpportunityCard);
    await new Promise((resolve) => window.setTimeout(resolve, getHeroDemoReplayDelayMs()));
    updateMessageArtifact(progressMessage.id, (artifact) => ({
      ...artifact,
      activeStepCount: Math.max(artifact.activeStepCount || 1, artifact.steps?.length || 1),
      currentProgressLine: "已完成：我已把最近一次入库的已保存机会卡整理成报告摘要。",
    }));
    const runId = `demo_replay_${Date.now().toString(36)}`;
    const reportId = `public_ai_events_report_${Date.now().toString(36)}`;
    const markdown = buildHeroDemoReplayMarkdown(feed, cards, version);
    heroRadarChatState.currentResult = {
      runId,
      reportId,
      description: draft.description,
      spec: confirmedSpec,
      profile: confirmedSpec.profile_summary || confirmedSpec.profile,
      radarVersion: draft.radarVersion,
      suggestedName: getDraftDisplayName(draft),
      opportunityCards: cards,
      sourceHintChecks: [],
      candidateAccounting: {
        rawCount: feed?.stats?.totalCount ?? cards.length,
        deduplicatedCount: feed?.stats?.databaseCount ?? cards.length,
        assessedCount: cards.length,
        acceptedCount: cards.length,
        rejectedCount: 0,
      },
      rawCandidates: items,
      executionLog: {
        mode: "demo_replay",
        source: "public_ai_events_database",
        message: "读取 AI 赛事雷达最近一次入库结果，没有触发本次 live search。",
      },
      runOutcome: {
        status: "succeeded",
        mode: "demo_replay",
        message: "已加载最近一次 AI 赛事雷达入库结果。",
      },
      searchMode: "demo_replay",
      markdown,
    };
    window.persistWatchResult?.(heroRadarChatState.currentResult);
    updateRadarChatWindow({
      latestRunId: runId,
      latestReportId: reportId,
      currentConfirmedRadarVersion: version,
      currentResultSnapshot: heroRadarChatState.currentResult,
    });
    addMessage("assistant", "我已按 AI 赛事雷达最近一次入库结果整理好本次报告。你可以先看摘要，也可以打开机会卡查看完整列表。", {
      type: "report",
      markdown,
      runId,
      reportId,
      cards,
    });
  }

  async function runHeroLiveSearch(draft, confirmedSpec, version, progressMessage) {
    const startedJob = await postJson("/api/radar-jobs/run", {
      spec: confirmedSpec,
      radar_type: "custom",
      query: draft.description || draft.radarVersion?.oneSentencePositioning || draft.suggestedName || "机会 合作 采购 招募 申请",
      ...(window.getChancePingSearchMode?.() ? { search_mode: window.getChancePingSearchMode() } : {}),
    });
    const jobId = startedJob.jobId || startedJob.id;
    if (!jobId) throw new Error("盯机会任务启动失败：没有返回任务编号。");
    updateMessageArtifact(progressMessage.id, (artifact) => ({
      ...artifact,
      currentProgressLine: startedJob.progressLine || "盯机会已启动任务，正在持续整理搜索进度。",
    }));
    const finishedJob = await waitForRadarRunJob(jobId, progressMessage);
    const search = finishedJob.result?.search || {};
    const cards = search.opportunityCards || [];
    const sourceHintChecks = search.sourceCoverage || search.sourceHintChecks || [];
    const report = finishedJob.result?.report || {};
    if (report.success === false) throw new Error(report.error || "报告生成失败");
    heroRadarChatState.currentResult = {
      runId: search.run?.id,
      reportId: report.reportId,
      description: draft.description,
      spec: confirmedSpec,
      profile: confirmedSpec.profile_summary || confirmedSpec.profile,
      radarVersion: draft.radarVersion,
      suggestedName: getDraftDisplayName(draft),
      opportunityCards: cards,
      sourceHintChecks,
      candidateAccounting: search.candidateAccounting,
      rawCandidates: search.rawCandidates || [],
      executionLog: search.executionLog,
      runOutcome: search.runOutcome,
      searchMode: window.getChancePingSearchMode?.(),
      markdown: report.markdown,
    };
    window.persistWatchResult?.(heroRadarChatState.currentResult);
    updateRadarChatWindow({
      latestRunId: search.run?.id,
      latestReportId: report.reportId,
      currentConfirmedRadarVersion: version,
    });
    updateMessageArtifact(progressMessage.id, (artifact) => ({
      ...artifact,
      activeStepCount: artifact.steps?.length || 1,
      currentProgressLine: "已完成：机会卡和 Markdown 报告已生成，可以先看摘要或打开完整结果。",
    }));
    addMessage("assistant", "本次机会雷达报告已生成。我先把 Markdown 发在这里，你也可以打开机会卡查看完整结果。", {
      type: "report",
      markdown: report.markdown,
      runId: search.run?.id,
      reportId: report.reportId,
      cards,
    });
  }

  async function waitForRadarRunJob(jobId, progressMessage) {
    const deadline = Date.now() + LONG_OPERATION_TIMEOUT_MS;
    let lastJob = null;
    while (Date.now() < deadline) {
      lastJob = await getJson(`/api/radar-jobs/${encodeURIComponent(jobId)}`, {
        timeoutMs: LONG_OPERATION_TIMEOUT_MS,
      });
      updateMessageArtifact(progressMessage.id, (artifact) => ({
        ...artifact,
        activeStepCount: Math.min((artifact.activeStepCount || 1) + 1, artifact.steps?.length || 1),
        currentProgressLine: lastJob.progressLine || artifact.currentProgressLine,
      }));
      if (lastJob.status === "succeeded") return lastJob;
      if (lastJob.status === "failed") {
        throw new Error(lastJob.error?.message || "这次搜索或报告生成失败，雷达已保留，可以调整后重试。");
      }
      await sleep(1600);
    }
    throw new Error("这次盯机会等待超过 10 分钟。雷达已保留，你可以稍后重试；如果线上仍反复超时，需要把线上网关等待时间延长到 10 分钟。");
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function renderRadarArtifact(message) {
    const artifact = message.artifact || {};
    const payload = artifact.payload || {};
    const diff = artifact.diff || {};
    const version = artifact.version || payload.version || "V1.0";
    const alreadyConfirmed = heroRadarChatState.confirmedVersion === version;
    const confirmed = alreadyConfirmed || artifact.status === "confirmed" || payload.confirmation_status?.user_confirmed === true;
    const currentVersion = heroRadarChatState.currentDraft?.radarVersion?.version;
    const isLatestDraft = currentVersion === version && !alreadyConfirmed && !heroRadarChatState.currentResult;
    const isReplacedDraft = !confirmed && currentVersion && currentVersion !== version;
    if (isReplacedDraft) {
      return `
        <article class="hero-radar-artifact compact" data-hero-radar-version="${escapeHtml(version)}">
          <div>
            <span class="hero-version-pill">${escapeHtml(version)}</span>
            <strong>${escapeHtml(payload.oneSentencePositioning || payload.name || getRadarKindLabel(payload))}</strong>
          </div>
          <span class="hero-artifact-note">已升级到 ${escapeHtml(currentVersion)}，请看下面的最新雷达。</span>
        </article>
      `;
    }
    return `
      <article class="hero-radar-artifact" data-hero-radar-version="${escapeHtml(version)}">
        <div class="hero-artifact-topline">
          <span class="hero-artifact-kicker">${escapeHtml(getRadarKindLabel(payload))}</span>
          <span class="hero-version-pill">${escapeHtml(version)}</span>
          <span class="hero-status-pill ${confirmed ? "confirmed" : "draft"}">${confirmed ? "已确认" : "待确认"}</span>
        </div>
        <h3>${escapeHtml(buildReadableRadarTitle(payload))}</h3>
        <p>${escapeHtml(payload.businessContext || payload.summary || "我会先把你的复杂需求整理成可执行的机会雷达。")}</p>
        <div class="hero-artifact-summary-grid">
          ${renderList("你是", payload.targetUser)}
          ${renderList("这版雷达会盯", payload.opportunityIntents)}
          ${renderList("不盯什么", payload.exclusionRules)}
        </div>
        ${diff && Object.keys(diff).length > 0 ? `
          <p class="hero-radar-diff-summary"><strong>本次主要修改：</strong>${escapeHtml(summarizeDiff(diff))}<span>查看本次修改</span></p>
        ` : ""}
        ${isLatestDraft ? `<p class="hero-next-step"><strong>现在只需要做一个选择：</strong>确认这版开始搜索，或者在下方继续告诉我哪里不准。</p>` : ""}
        <div class="hero-artifact-actions">
          <button class="secondary-btn" data-action="open-radar-modal" data-version="${escapeHtml(version)}" title="${escapeHtml(backendText("openRadarImage", "打开完整雷达画像"))}">${escapeHtml(backendText("openRadarImage", "打开雷达画像"))}</button>
          ${isLatestDraft
            ? `<button class="btn-primary hero-confirm-radar-btn" data-action="confirm-hero-radar">${escapeHtml(currentBackendLanguage() === "en" ? `Confirm ${version} and run` : `确认，按 ${version} 盯一次`)}</button>`
            : `<span class="hero-artifact-note">${confirmed ? `已按 ${escapeHtml(version)} 跑过一次。` : isReplacedDraft ? "这版已被新版替代，请确认最新雷达。" : "等待你确认新版雷达。"}</span>`}
          <span>不准的话，直接在聊天框继续说，我会先升级雷达。</span>
        </div>
      </article>
    `;
  }

  function renderReportArtifact(message) {
    const artifact = message.artifact || {};
    const summary = summarizeOpportunityCards(artifact.cards || heroRadarChatState.currentResult?.opportunityCards || []);
    const actionItems = buildHeroActionItems(summary);
    return `
      <article class="hero-report-artifact">
        <div class="hero-artifact-topline">
          <span class="hero-artifact-kicker">机会雷达报告</span>
          ${artifact.runId ? `<span class="hero-version-pill">${escapeHtml(artifact.runId)}</span>` : ""}
        </div>
        <div class="hero-report-summary">
          <strong>本轮结论：本次搜索出 ${escapeHtml(summary.total)} 条可查看机会</strong>
          <span>评级分布：${escapeHtml(summary.levelText)}。S 级优先行动，A 级优先复核，B/C 级先观察。</span>
          ${summary.topCards.length > 0 ? `
            <div class="hero-report-top-list">
              <p><strong>本次建议先看：</strong><span>${escapeHtml(buildReportRecommendation(summary))}</span></p>
              <ol>${summary.topCards.map((card) => `<li><span>${escapeHtml(card.level)} 级</span>${escapeHtml(card.title)}</li>`).join("")}</ol>
            </div>
          ` : `<p>本轮没有把观察信号冒充为重点机会。</p>`}
          <div class="hero-report-action-layer">
            <strong>先做这 3 件事</strong>
            <ol>${actionItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
          </div>
          <p><strong>待复核提醒：</strong>搜索发现，不等于已核验事实；报名资格、费用、截止时间和奖项义务都以官方页面为准。</p>
          <p><strong>完整来源和字段证据：</strong>请点“查看本次机会卡”，我会把来源入口、待复核字段和行动建议集中放在那里。</p>
          <p>结果不对？直接在下方告诉我，我会先升级雷达，再重新盯一次。</p>
        </div>
        <div class="hero-artifact-actions">
          <button class="secondary-btn" data-action="open-report-modal" data-message-id="${escapeHtml(message.id)}">${escapeHtml(backendText("openMarkdownReport", "查看完整 Markdown 报告"))}</button>
          <button class="btn-primary" data-action="view-hero-cards">${escapeHtml(backendText("viewCards", "查看本次机会卡"))}</button>
        </div>
      </article>
    `;
  }

  function renderProgressArtifact(message) {
    const steps = asArray(message.artifact?.steps);
    const activeStepCount = Math.max(1, Math.min(Number(message.artifact?.activeStepCount) || steps.length, steps.length));
    const currentProgressLine = message.artifact?.currentProgressLine || steps[activeStepCount - 1] || "正在处理本次机会雷达……";
    return `
      <article class="hero-progress-artifact" aria-live="polite">
        <div class="hero-progress-current" aria-label="当前工作状态">
          <span class="hero-progress-dot" aria-hidden="true"></span>
          <span>${escapeHtml(currentProgressLine)}</span>
        </div>
      </article>
    `;
  }

  function renderRadarModal(version) {
    const artifact = findRadarArtifactByVersion(version);
    if (!artifact) return "";
    const payload = artifact.payload || {};
    const diff = artifact.diff || {};
    return `
      <dialog class="hero-artifact-modal" open aria-label="雷达画像">
        <div class="hero-modal-card">
          <button class="hero-modal-close" type="button" data-action="close-hero-modal">关闭</button>
          <div class="hero-artifact-topline">
            <span class="hero-artifact-kicker">${escapeHtml(getRadarKindLabel(payload))}</span>
            <span class="hero-version-pill">${escapeHtml(version)}</span>
          </div>
          <h3>${escapeHtml(buildReadableRadarTitle(payload))}</h3>
          <div class="hero-artifact-grid">
            ${renderList("你是", payload.targetUser)}
            ${renderList("这版雷达会盯", payload.opportunityIntents)}
            ${renderList("什么算高价值", payload.highValueCriteria)}
            ${renderList("不盯什么", payload.exclusionRules)}
            ${renderList("优先看哪些来源", payload.prioritySourceArchetypes)}
            ${renderList("我会怎么找", payload.queryFamilies, [
              "从官方比赛页、云厂商开发者活动页和 Hackathon 平台开始",
              "优先寻找报名、提交作品、申请资源等行动入口",
            ])}
            ${renderList("为什么这样找", payload.searchThemes, [
              "这版雷达优先能报名、能提交作品、能申请资源的结果",
              "展会资讯、培训广告、学生专属和无行动入口页面会降权",
            ])}
            ${renderList("默认假设", payload.defaultAssumptions)}
            ${renderList("还缺哪些信息", payload.missingConfig)}
          </div>
          ${diff && Object.keys(diff).length > 0 ? `
            <div class="hero-radar-diff-body">
              <h4>本次主要修改 <span>查看本次修改</span></h4>
              ${renderDiffList("新增", diff.added)}
              ${renderDiffList("移除", diff.removed)}
              ${renderDiffList("提高权重", diff.upweighted)}
              ${renderDiffList("降低权重", diff.downweighted)}
              ${renderDiffList("查询变化", diff.queryShifts)}
              ${renderDiffList("来源变化", diff.sourceShifts)}
              ${renderDiffList("高价值标准变化", diff.highValueCriteriaChanges)}
              ${renderDiffList("排除规则变化", diff.exclusionChanges)}
            </div>
          ` : ""}
        </div>
      </dialog>
    `;
  }

  function renderReportModal(messageId) {
    const message = findMessageById(messageId);
    const markdown = message?.artifact?.markdown || "本次报告暂未生成。";
    return `
      <dialog class="hero-artifact-modal" open aria-label="Markdown 报告">
        <div class="hero-modal-card hero-report-modal-card">
          <button class="hero-modal-close" type="button" data-action="close-hero-modal">关闭</button>
          <div class="hero-artifact-topline">
            <span class="hero-artifact-kicker">完整 Markdown 报告</span>
          </div>
          <pre class="hero-report-markdown">${escapeHtml(markdown)}</pre>
        </div>
      </dialog>
    `;
  }

  function renderRenameWindowModal(modal) {
    const current = findSidebarWindow(modal?.chatWindowId || "");
    const currentTitle = current?.title || "机会雷达";
    return `
      <dialog class="hero-artifact-modal hero-window-action-modal" open aria-label="修改雷达名称">
        <form class="hero-modal-card hero-window-rename-form" data-chat-window-id="${escapeHtml(modal?.chatWindowId || "")}">
          <button class="hero-modal-close" type="button" data-action="close-hero-modal">关闭</button>
          <div class="hero-artifact-topline">
            <span class="hero-artifact-kicker">雷达窗口</span>
            <span class="hero-version-pill">改名</span>
          </div>
          <h3>给这个雷达起个更好记的名字</h3>
          <p class="hero-modal-helper">名字只影响左侧雷达列表入口，不会改变雷达画像。</p>
          <label class="hero-window-name-field">
            <span>雷达名称</span>
            <input name="title" value="${escapeHtml(currentTitle)}" maxlength="40" autocomplete="off" />
          </label>
          <div class="hero-window-modal-actions">
            <button type="button" class="secondary-btn" data-action="close-hero-modal">取消</button>
            <button type="submit" class="primary-btn" data-action="submit-window-rename">保存名称</button>
          </div>
        </form>
      </dialog>
    `;
  }

  function renderDeleteWindowModal(modal) {
    const current = findSidebarWindow(modal?.chatWindowId || "");
    const title = current?.title || "这个雷达窗口";
    return `
      <dialog class="hero-artifact-modal hero-window-action-modal" open aria-label="删除雷达窗口">
        <div class="hero-modal-card">
          <button class="hero-modal-close" type="button" data-action="close-hero-modal">关闭</button>
          <div class="hero-artifact-topline">
            <span class="hero-artifact-kicker">雷达窗口</span>
            <span class="hero-version-pill">删除</span>
          </div>
          <h3>删除「${escapeHtml(title)}」？</h3>
          <p class="hero-modal-helper">删除后将从列表移除，这个雷达窗口的聊天记录不再保留。全球 AI 赛事导航内置窗口不会被删除。</p>
          <div class="hero-window-modal-actions">
            <button type="button" class="secondary-btn" data-action="close-hero-modal">先不删除</button>
            <button type="button" class="danger-btn" data-action="confirm-window-delete" data-chat-window-id="${escapeHtml(modal?.chatWindowId || "")}">确认删除</button>
          </div>
        </div>
      </dialog>
    `;
  }

  function renderHeroSidebar() {
    const activeChatWindowId = heroRadarChatState.boundRadarId === AI_EVENT_SAMPLE_ROOM.id
      ? AI_EVENT_SAMPLE_ROOM.id
      : (heroRadarChatState.chatWindowId || heroRadarChatState.activeChatWindowId || AI_EVENT_SAMPLE_ROOM.id);
    const sidebarWindows = (Array.isArray(heroRadarChatState.chatWindows) && heroRadarChatState.chatWindows.length > 0)
      ? heroRadarChatState.chatWindows
      : [getSampleSidebarWindow()];
    const renderWindowRow = (windowData, options = {}) => {
      const isActive = windowData.id === activeChatWindowId;
      const version = windowData.draftRadarVersion || windowData.currentConfirmedRadarVersion || "V1.0";
      const archived = options.archived === true || windowData.status === "archived";
      const subline = windowData.isSampleRoom
        ? `${version} · ${backendText("builtInNavigator", "内置导航").replace(/^V1\.0\s*·\s*/, "")}`
        : `${version} · ${currentBackendLanguage() === "en" ? "Radar window" : "雷达窗口"}`;
      const actionButtons = windowData.isSampleRoom ? `
        <span class="hero-sidebar-window-note">${escapeHtml(backendText("builtInWindow", "内置"))}</span>
      ` : `
        <span class="hero-sidebar-window-actions" aria-label="雷达窗口操作">
          <button class="hero-sidebar-mini-btn" type="button" data-action="rename-hero-radar-window" data-chat-window-id="${escapeHtml(windowData.id)}">${escapeHtml(backendText("rename", "改名"))}</button>
          <button class="hero-sidebar-mini-btn danger" type="button" data-action="delete-hero-radar-window" data-chat-window-id="${escapeHtml(windowData.id)}">${escapeHtml(backendText("delete", "删除"))}</button>
        </span>
      `;
      return `
        <div class="hero-sidebar-radar-row ${isActive ? "active" : ""} ${archived ? "archived" : ""}">
          <button class="hero-sidebar-radar ${isActive ? "active" : ""}" type="button" data-action="switch-hero-radar-window" data-chat-window-id="${escapeHtml(windowData.id)}">
            <span>${escapeHtml(windowData.title || "机会雷达")}</span>
            <small>${escapeHtml(subline)}</small>
          </button>
          ${actionButtons}
        </div>
      `;
    };
    const rows = sidebarWindows.map((windowData) => renderWindowRow(windowData)).join("");
    const activeCustomCount = getActiveCustomWindowCount();
    const quotaFull = isChatWindowQuotaFull();
    return `
      <aside class="hero-radar-sidebar" aria-label="${escapeHtml(currentBackendLanguage() === "en" ? "Radar list" : "雷达列表")}">
        <div class="hero-sidebar-brand">
          <img src="/assets/logo.png?v=20260705" alt="" class="sidebar-brand-logo" />
          <div class="hero-sidebar-brand-text">
            <strong>ChancePing</strong>
            <span>${escapeHtml(backendText("chatProduct", "盯机会"))}</span>
          </div>
          <button class="hero-sidebar-collapse" type="button" data-action="toggle-sidebar" title="${escapeHtml(currentBackendLanguage() === "en" ? "Collapse or expand radar sidebar" : "折叠或展开雷达侧边栏")}" aria-label="${escapeHtml(currentBackendLanguage() === "en" ? "Collapse or expand radar sidebar" : "折叠或展开雷达侧边栏")}">☰</button>
        </div>
        <button class="hero-new-radar-btn ${quotaFull ? "disabled" : ""}" type="button" data-action="new-hero-radar-window" ${quotaFull ? 'data-quota-full="true"' : ""}>
          <span>＋ ${escapeHtml(backendText("newRadar", "新雷达"))}</span>
          <small>${escapeHtml(quotaFull
            ? (currentBackendLanguage() === "en" ? "Full. Delete an old radar window first." : "已满，先删除旧雷达窗口")
            : backendText("newRadarHint", "一个窗口只放一个雷达"))}</small>
        </button>
        <div class="hero-sidebar-quota ${quotaFull ? "full" : ""}" aria-label="${escapeHtml(currentBackendLanguage() === "en" ? "Custom radar window quota" : "自定义雷达窗口配额")}">
          <span>${escapeHtml(backendText("customRadarWindows", "自定义雷达窗口"))}</span>
          <strong>${activeCustomCount}/${CHAT_WINDOW_LIMIT}</strong>
        </div>
        <div class="hero-sidebar-section hero-sidebar-current-radar">
          <span class="hero-sidebar-label">${escapeHtml(backendText("currentRadar", "当前雷达"))}</span>
          ${rows}
        </div>
      </aside>
    `;
  }

  function renderMessage(message) {
    const roleClass = message.role === "user" ? "hero-chat-message user" : "hero-chat-message assistant";
    const artifactHtml = message.artifact?.type === "radar"
      ? renderRadarArtifact(message)
      : message.artifact?.type === "report"
        ? renderReportArtifact(message)
        : message.artifact?.type === "progress"
          ? renderProgressArtifact(message)
          : "";
    return `
      <div class="${roleClass}">
        <div class="hero-chat-bubble">
          ${message.content ? `<p>${escapeHtml(message.content)}</p>` : ""}
          ${artifactHtml}
        </div>
      </div>
    `;
  }

  function syncHeroEntryVisibility(options = {}) {
    const existingWorkspace = document.querySelector("#hero-radar-chat-root .hero-chat-workspace");
    const forceHomeEntry = options.forceHomeEntry === true;
    const chatStarted = !forceHomeEntry && (heroRadarChatState.messages.length > 0 || Boolean(existingWorkspace) || options.forceChatActive === true);
    const homeIsActive = document.getElementById("panel-home")?.classList.contains("active") !== false;
    document.body.classList.toggle("hero-chat-active", chatStarted && homeIsActive);
    document.body.classList.toggle("hero-home-shell", !chatStarted && homeIsActive);
    const examplesBlock = document.querySelector(".home-examples-block");
    if (examplesBlock) examplesBlock.hidden = true;
    const promptChips = document.querySelector(".hero-demo-prompts");
    if (promptChips) promptChips.hidden = true;
    [".home-hero", ".home-input-area", ".home-helper", ".home-ai-shell"].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.hidden = chatStarted;
    });
  }

  function showHeroHomeEntry() {
    heroRadarChatState.homeEntryMode = true;
    document.body.dataset.heroHomeEntry = "true";
    const root = document.getElementById("hero-radar-chat-root");
    if (root) root.innerHTML = "";
    syncHeroEntryVisibility({ forceHomeEntry: true });
    saveState();
    document.getElementById("home-input")?.focus();
  }

  function renderHeroRadarChat() {
    const root = document.getElementById("hero-radar-chat-root");
    if (!root) return;
    if (heroRadarChatState.homeEntryMode || document.body.dataset.heroHomeEntry === "true") {
      root.innerHTML = "";
      syncHeroEntryVisibility({ forceHomeEntry: true });
      return;
    }
    const chatStarted = heroRadarChatState.messages.length > 0;
    syncHeroEntryVisibility();
    if (!chatStarted) {
      root.innerHTML = "";
      return;
    }
    const messages = chatStarted
      ? heroRadarChatState.messages
      : [];
    root.innerHTML = `
      <section class="hero-chat-workspace ${heroRadarChatState.sidebarCollapsed ? "sidebar-collapsed hero-sidebar-collapsed" : ""}">
        ${renderHeroSidebar()}
        <div class="hero-chat-main">
          <div class="hero-chat-header" aria-label="1. 说需求 2. 看雷达 3. 确认后搜索">
            <div>
              <span>${escapeHtml(backendText("aiEventsNavigator", AI_EVENT_SAMPLE_ROOM.name))}</span>
              <strong>${escapeHtml(backendText("oneChatOneRadar", "一个聊天窗口，一个正在成长的雷达"))}</strong>
            </div>
            <button id="hero-chat-reset" class="hero-chat-reset" type="button">${escapeHtml(backendText("restart", "重新开始"))}</button>
          </div>
          <div class="hero-chat-messages">
            ${messages.map(renderMessage).join("")}
          </div>
          ${chatStarted && !heroRadarChatState.modal ? `<div class="hero-chat-input-row">
            <textarea id="hero-radar-chat-input" rows="2" placeholder="${escapeHtml(backendText("chatInputPlaceholder", "继续告诉我：你是谁、不要什么、什么结果才算有用"))}">${escapeHtml(heroRadarChatState.pendingFirstMessage || "")}</textarea>
            <button id="hero-radar-chat-send" class="primary-btn" ${heroRadarChatState.isBusy ? "disabled" : ""}>${escapeHtml(backendText("send", "发送"))}</button>
          </div>` : ""}
        </div>
        ${heroRadarChatState.modal?.type === "radar" ? renderRadarModal(heroRadarChatState.modal.version) : ""}
        ${heroRadarChatState.modal?.type === "report" ? renderReportModal(heroRadarChatState.modal.messageId) : ""}
        ${heroRadarChatState.modal?.type === "rename-window" ? renderRenameWindowModal(heroRadarChatState.modal) : ""}
        ${heroRadarChatState.modal?.type === "delete-window" ? renderDeleteWindowModal(heroRadarChatState.modal) : ""}
      </section>
    `;
    root.querySelector("#hero-chat-reset")?.addEventListener("click", resetHeroRadarChat);
    root.querySelector("[data-action='toggle-sidebar']")?.addEventListener("click", toggleHeroSidebar);
    root.querySelector("[data-action='new-hero-radar-window']")?.addEventListener("click", () => {
      if (isChatWindowQuotaFull()) {
        loadRadarChatWindows().finally(() => renderHeroRadarChat());
        window.showToast?.(`自定义雷达窗口已满 ${getActiveCustomWindowCount()}/${CHAT_WINDOW_LIMIT}，请先删除一个旧雷达窗口。`, "warning");
        return;
      }
      createNewHeroRadarWindow("").catch((err) => window.showToast?.(err.message || "新建雷达窗口失败", "error"));
    });
    root.querySelectorAll("[data-action='switch-hero-radar-window']").forEach((button) => {
      button.addEventListener("click", () => {
        switchHeroRadarWindow(button.dataset.chatWindowId || "").catch((err) => window.showToast?.(err.message || "打开雷达窗口失败", "error"));
      });
    });
    root.querySelectorAll("[data-action='rename-hero-radar-window']").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openRenameWindowModal(button.dataset.chatWindowId || "");
      });
    });
    root.querySelectorAll("[data-action='delete-hero-radar-window']").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openDeleteWindowModal(button.dataset.chatWindowId || "");
      });
    });
    root.querySelector("#hero-radar-chat-send")?.addEventListener("click", () => {
      const input = root.querySelector("#hero-radar-chat-input");
      const value = input?.value?.trim();
      if (!value) return;
      input.value = "";
      heroRadarChatState.pendingFirstMessage = "";
      startHeroRadarChat(value).catch((err) => window.showToast?.(err.message || "雷达修订失败", "error"));
    });
    root.querySelector("#hero-radar-chat-input")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        root.querySelector("#hero-radar-chat-send")?.click();
      }
    });
    root.querySelector("#hero-radar-chat-input")?.addEventListener("input", (event) => {
      syncPendingInputMessage(event.target?.value || "");
    });
    root.querySelectorAll("[data-action='confirm-hero-radar']").forEach((button) => {
      button.addEventListener("click", () => confirmHeroRadar());
    });
    root.querySelectorAll("[data-action='view-hero-cards']").forEach((button) => {
      button.addEventListener("click", () => viewHeroCards());
    });
    root.querySelectorAll("[data-action='open-radar-modal']").forEach((button) => {
      button.addEventListener("click", () => openHeroModal({ type: "radar", version: button.dataset.version || "" }));
    });
    root.querySelectorAll("[data-action='open-report-modal']").forEach((button) => {
      button.addEventListener("click", () => openHeroModal({ type: "report", messageId: button.dataset.messageId || "" }));
    });
    root.querySelectorAll("[data-action='close-hero-modal']").forEach((button) => {
      button.addEventListener("click", closeHeroModal);
    });
    root.querySelector(".hero-window-rename-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const title = String(new FormData(form).get("title") || "").trim();
      renameHeroRadarWindow(form.dataset.chatWindowId || "", title).catch((err) => window.showToast?.(err.message || "重命名失败", "error"));
    });
    root.querySelector("[data-action='confirm-window-delete']")?.addEventListener("click", (event) => {
      deleteHeroRadarWindow(event.currentTarget.dataset.chatWindowId || "").catch((err) => window.showToast?.(err.message || "删除失败", "error"));
    });
    root.querySelector(".hero-artifact-modal")?.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeHeroModal();
    });
    scrollHeroChatToLatest();
  }

  function scrollHeroChatToLatest() {
    window.requestAnimationFrame(() => {
      const messages = document.querySelector(".hero-chat-messages");
      if (messages) {
        messages.scrollTop = messages.scrollHeight;
      }
      const inputRow = document.querySelector(".hero-chat-input-row");
      if (inputRow && window.matchMedia("(max-width: 860px)").matches) {
        inputRow.scrollIntoView({ block: "end", behavior: "smooth" });
        return;
      }
      const latestMessage = document.querySelector(".hero-chat-message:last-of-type");
      if (!latestMessage) return;
      latestMessage.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }

  function clearHeroRadarConversation() {
    heroRadarChatState.messages = [];
    heroRadarChatState.currentDraft = null;
    heroRadarChatState.currentResult = null;
    heroRadarChatState.confirmedVersion = null;
    heroRadarChatState.copiedRadarId = null;
    heroRadarChatState.chatWindowId = null;
    heroRadarChatState.activeChatWindowId = AI_EVENT_SAMPLE_ROOM.id;
    heroRadarChatState.boundRadarId = AI_EVENT_SAMPLE_ROOM.id;
    heroRadarChatState.pendingFirstMessage = "";
    heroRadarChatState.modal = null;
    heroRadarChatState.isBusy = false;
    forgetLastChatWindow();
  }

  async function openHeroRadarWindow() {
    if (window.switchTab) window.switchTab("home");
    heroRadarChatState.homeEntryMode = false;
    delete document.body.dataset.heroHomeEntry;
    const wasCustomWindow = heroRadarChatState.boundRadarId !== AI_EVENT_SAMPLE_ROOM.id || (heroRadarChatState.chatWindowId && !isSampleRoomWindowId(heroRadarChatState.activeChatWindowId));
    if (wasCustomWindow) {
      clearHeroRadarConversation();
    }
    heroRadarChatState.boundRadarId = AI_EVENT_SAMPLE_ROOM.id;
    heroRadarChatState.activeChatWindowId = AI_EVENT_SAMPLE_ROOM.id;
    await loadRadarChatWindows();
    if (!heroRadarChatState.isBusy && !heroRadarChatState.pendingFirstMessage) {
      heroRadarChatState.pendingFirstMessage = HERO_DEMO_PROMPT;
    }
    if (heroRadarChatState.messages.length === 0) {
      addMessage("assistant", "继续编辑全球 AI 赛事导航。我已把默认需求放到底部输入框，你可以直接发送，也可以先改成自己的需求。");
    } else {
      saveState();
      renderHeroRadarChat();
    }
    saveState();
    window.setTimeout(() => document.getElementById("hero-radar-chat-input")?.focus(), 0);
  }

  async function openSampleRoomWithDraftPrompt(initialMessage) {
    if (window.switchTab) window.switchTab("home");
    heroRadarChatState.homeEntryMode = false;
    delete document.body.dataset.heroHomeEntry;
    clearHeroRadarConversation();
    heroRadarChatState.boundRadarId = AI_EVENT_SAMPLE_ROOM.id;
    heroRadarChatState.activeChatWindowId = AI_EVENT_SAMPLE_ROOM.id;
    heroRadarChatState.chatWindowId = null;
    heroRadarChatState.pendingFirstMessage = String(initialMessage || "").trim();
    await loadRadarChatWindows();
    addMessage(
      "assistant",
        `自定义雷达窗口已满 ${getActiveCustomWindowCount()}/${CHAT_WINDOW_LIMIT}。我先在全球 AI 赛事导航里承接这条需求；如果你想保存为新的长期雷达，请先在左侧删除一个旧窗口。`
    );
    saveState();
    window.setTimeout(() => document.getElementById("hero-radar-chat-input")?.focus(), 0);
    return true;
  }

  async function createNewHeroRadarWindow(initialMessage = "") {
    if (window.switchTab) window.switchTab("home");
    heroRadarChatState.homeEntryMode = false;
    delete document.body.dataset.heroHomeEntry;
    const text = String(initialMessage || "").trim();
    if (isChatWindowQuotaFull()) {
      if (text) {
        window.showToast?.(`自定义雷达窗口已满 ${getActiveCustomWindowCount()}/${CHAT_WINDOW_LIMIT}，先用全球 AI 赛事导航承接这条需求。`, "warning");
        return openSampleRoomWithDraftPrompt(text);
      }
      await loadRadarChatWindows();
      renderHeroRadarChat();
      window.showToast?.(`自定义雷达窗口已满 ${getActiveCustomWindowCount()}/${CHAT_WINDOW_LIMIT}，请先删除一个旧雷达窗口。`, "warning");
      return false;
    }
    clearHeroRadarConversation();
    heroRadarChatState.boundRadarId = null;
    heroRadarChatState.pendingFirstMessage = text;
    await createRadarChatWindowForDraft(text);
    addMessage("assistant", text
      ? "这会成为一个新的雷达窗口。我已经把你的需求放到下方输入框里，等你点击发送后，我再开始画雷达。"
      : "这会成为一个新的雷达窗口。请在下方输入你想找什么机会，我会先画雷达，再让你确认。");
    window.setTimeout(() => document.getElementById("hero-radar-chat-input")?.focus(), 0);
    return true;
  }

  function resetHeroRadarChat() {
    clearHeroRadarConversation();
    heroRadarChatState.homeEntryMode = true;
    document.body.dataset.heroHomeEntry = "true";
    sessionStorage.removeItem(STORAGE_KEY);
    const root = document.getElementById("hero-radar-chat-root");
    if (root) root.innerHTML = "";
    syncHeroEntryVisibility({ forceHomeEntry: true });
    document.getElementById("home-input")?.focus();
    window.showToast?.("已清空当前演示，可以重新描述需求", "success");
  }

  function toggleHeroSidebar() {
    heroRadarChatState.sidebarCollapsed = !heroRadarChatState.sidebarCollapsed;
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(heroRadarChatState.sidebarCollapsed));
    } catch {
      // UI still updates when storage is unavailable.
    }
    renderHeroRadarChat();
  }

  async function switchHeroRadarWindow(chatWindowId) {
    if (!chatWindowId || heroRadarChatState.isBusy) return false;
    heroRadarChatState.homeEntryMode = false;
    delete document.body.dataset.heroHomeEntry;
    if (isSampleRoomWindowId(chatWindowId)) {
      await openHeroRadarWindow();
      return true;
    }
    return restoreStateFromBackend(chatWindowId);
  }

  function findSidebarWindow(chatWindowId) {
    return (heroRadarChatState.chatWindows || []).find((item) => item.id === chatWindowId) || null;
  }

  function openRenameWindowModal(chatWindowId) {
    if (!chatWindowId) return false;
    if (isSampleRoomWindowId(chatWindowId)) {
      window.showToast?.("全球 AI 赛事导航是内置窗口，不能改名；你可以新建一个自己的雷达窗口。", "warning");
      return false;
    }
    openHeroModal({ type: "rename-window", chatWindowId });
    window.setTimeout(() => {
      const input = document.querySelector(".hero-window-rename-form input[name='title']");
      input?.focus();
      input?.select?.();
    }, 0);
    return true;
  }

  function openDeleteWindowModal(chatWindowId) {
    if (!chatWindowId) return false;
    if (isSampleRoomWindowId(chatWindowId)) {
      window.showToast?.("全球 AI 赛事导航是内置窗口，不能删除。", "warning");
      return false;
    }
    openHeroModal({ type: "delete-window", chatWindowId });
    return true;
  }

  async function renameHeroRadarWindow(chatWindowId, nextTitle) {
    if (!chatWindowId) return false;
    if (isSampleRoomWindowId(chatWindowId)) {
      window.showToast?.("全球 AI 赛事导航是内置窗口，不能改名；你可以新建一个自己的雷达窗口。", "warning");
      return false;
    }
    const title = String(nextTitle || "").trim();
    if (!title) return false;
    const updated = await patchJson(`/api/radar-chats/${chatWindowId}`, { title });
    heroRadarChatState.modal = null;
    if (heroRadarChatState.chatWindowId === chatWindowId) {
      heroRadarChatState.messages = heroRadarChatState.messages.map((message) => message);
    }
    await loadRadarChatWindows();
    if (updated?.id === heroRadarChatState.chatWindowId) {
      addMessage("assistant", `已把这个雷达窗口改名为「${title}」。`);
    } else {
      saveState();
      renderHeroRadarChat();
    }
    window.showToast?.("雷达窗口已改名", "success");
    return true;
  }

  async function deleteHeroRadarWindow(chatWindowId) {
    if (!chatWindowId) return false;
    if (isSampleRoomWindowId(chatWindowId)) {
      // sample room cannot be deleted
      window.showToast?.("全球 AI 赛事导航是内置窗口，不能删除。", "warning");
      return false;
    }
    await deleteJson(`/api/radar-chats/${chatWindowId}`);
    heroRadarChatState.modal = null;
    await loadRadarChatWindows();
    window.showToast?.("雷达窗口已删除，名额已释放", "success");
    if (heroRadarChatState.chatWindowId === chatWindowId || heroRadarChatState.activeChatWindowId === chatWindowId) {
      await openHeroRadarWindow();
    } else {
      renderHeroRadarChat();
    }
    return true;
  }

  async function createRadarChatWindowForDraft(initialMessage) {
    const title = inferRadarTitle(initialMessage);
    const windowData = await postJson("/api/radar-chats", {
      title,
      userId: HERO_CHAT_USER_ID,
      reuseByRadarId: false,
      draftRadarVersion: "V1.0",
      pendingMessage: String(initialMessage || ""),
    });
    heroRadarChatState.chatWindowId = windowData.id;
    heroRadarChatState.activeChatWindowId = windowData.id;
    heroRadarChatState.boundRadarId = null;
    rememberLastChatWindow(windowData.id);
    await loadRadarChatWindows();
    saveState();
    return windowData;
  }

  async function openHeroRadarForRadar(radar) {
    if (window.switchTab) window.switchTab("home");
    const radarId = radar?.id || radar?.radarId;
    if (!radarId) {
      window.showToast?.("这个雷达还没有可编辑的窗口", "warning");
      return false;
    }
    const existingWindows = await getJson(`/api/radar-chats?radar_id=${encodeURIComponent(radarId)}&user_id=${encodeURIComponent(HERO_CHAT_USER_ID)}`);
    const existing = Array.isArray(existingWindows) ? existingWindows.find((item) => item.status !== "archived") : null;
    const windowData = existing || await postJson("/api/radar-chats", {
      radarId,
      title: radar?.name || radar?.title || "机会雷达",
      userId: HERO_CHAT_USER_ID,
      draftRadarVersion: radar?.spec?.radar_version?.version || radar?.spec?.version || "V1.0",
    });
    await loadRadarChatWindows();
    await switchHeroRadarWindow(windowData.id);
    window.setTimeout(() => document.getElementById("hero-radar-chat-input")?.focus(), 0);
    return true;
  }

  function buildResultFeedbackMessage(result) {
    const titles = (result?.resultFeedback?.rejectedCardTitles || result?.opportunityCards || [])
      .slice(0, 3)
      .map((item) => typeof item === "string" ? item : item?.title)
      .filter(Boolean);
    const reason = result?.resultFeedback?.freeText
      || result?.resultFeedback?.rejectedReason
      || "这些结果不符合我想要的机会类型或行动入口";
    const titleText = titles.length ? `不满意结果：${titles.join("；")}` : "";
    return [
      "这次结果不对，请先修改雷达策略，再让我确认新版雷达。",
      reason,
      titleText,
    ].filter(Boolean).join("\n");
  }

  async function openHeroRadarFromResultFeedback(result) {
    if (!result) return false;
    const radarId = result.radarId || result.radar_id || result.sourceRadarId || result.spec?.radar_id;
    const suggestedName = result.suggestedName
      || result.radarVersion?.oneSentencePositioning
      || result.radarVersion?.name
      || "机会雷达";
    if (radarId) {
      await openHeroRadarForRadar({
        id: radarId,
        name: suggestedName,
        spec: result.spec,
      });
    } else {
      if (window.switchTab) window.switchTab("home");
      heroRadarChatState.currentDraft = {
        spec: result.spec || {},
        radarVersion: result.radarVersion || result.spec?.radar_version || null,
        radarDiff: null,
        suggestedName,
        description: result.description || "",
      };
      heroRadarChatState.currentResult = result;
      await ensureRadarChatWindow();
    }

    const feedbackMessage = buildResultFeedbackMessage(result);
    heroRadarChatState.pendingFirstMessage = feedbackMessage;
    heroRadarChatState.pendingRevisionTrigger = "result_feedback";
    updateRadarChatWindow({
      pendingMessage: feedbackMessage,
      memorySummary: {
        ...(heroRadarChatState.activeChatWindowId
          ? (heroRadarChatState.chatWindows.find((item) => item.id === heroRadarChatState.activeChatWindowId)?.memorySummary || {})
          : {}),
        lastFeedback: feedbackMessage,
      },
    });
    addMessage("assistant", "我已经把本次不满意的结果带回这个雷达窗口。你可以直接点发送，我会先升级雷达，再让你确认。");
    renderHeroRadarChat();
    window.setTimeout(() => {
      const input = document.getElementById("hero-radar-chat-input");
      if (input) {
        input.value = feedbackMessage;
        input.focus();
      }
    }, 0);
    return true;
  }

  function normalizeGenerateResult(data, description) {
    return {
      spec: data.spec,
      radarVersion: data.radarVersion || data.spec?.radar_version || {},
      radarDiff: data.radarDiff || null,
      suggestedName: data.suggestedName || data.spec?.name || inferRadarTitle(description),
      description,
    };
  }

  async function startHeroRadarChat(message, options = {}) {
    const text = String(message || "").trim();
    if (!text || heroRadarChatState.isBusy) return;
    if (options.autoSend === false && !heroRadarChatState.currentDraft) {
      heroRadarChatState.pendingFirstMessage = text;
      updateRadarChatWindow({ pendingMessage: text });
      if (heroRadarChatState.messages.length === 0) {
        addMessage("assistant", `我已经把你的需求放到下方输入框里。等待你点击发送后，我再开始理解需求并生成${isAiContestRadarText(text) ? " AI 赛事雷达" : "机会雷达"}。`);
      } else {
        saveState();
        renderHeroRadarChat();
      }
      const input = document.getElementById("hero-radar-chat-input");
      input?.focus();
      return;
    }
    heroRadarChatState.isBusy = true;
    heroRadarChatState.pendingFirstMessage = "";
    if (shouldDetachSampleRoomForMessage(text)) {
      await loadRadarChatWindows();
      if (isChatWindowQuotaFull()) {
        heroRadarChatState.isBusy = false;
        addMessage("assistant", `自定义雷达窗口已满 ${getActiveCustomWindowCount()}/${CHAT_WINDOW_LIMIT}，请先删除一个旧雷达窗口，再发送这条新需求。`);
        renderHeroRadarChat();
        return;
      }
      heroRadarChatState.messages = [];
      heroRadarChatState.currentDraft = null;
      heroRadarChatState.currentResult = null;
      heroRadarChatState.confirmedVersion = null;
      heroRadarChatState.copiedRadarId = null;
      heroRadarChatState.chatWindowId = null;
      heroRadarChatState.activeChatWindowId = null;
      heroRadarChatState.boundRadarId = null;
      heroRadarChatState.modal = null;
      await createRadarChatWindowForDraft(text);
    }
    addMessage("user", text);
    const chatWindowId = await ensureRadarChatWindow();
    if (heroRadarChatState.boundRadarId !== AI_EVENT_SAMPLE_ROOM.id && chatWindowId) {
      heroRadarChatState.activeChatWindowId = chatWindowId;
    }
    updateRadarChatWindow({ pendingMessage: "" });
    addMessage("assistant", heroRadarChatState.currentDraft
      ? "收到，盯机会正在理解这次修改，并重新画一版雷达草案；你确认后我才会搜索。"
      : `盯机会正在理解并生成雷达，我会先把复杂人话整理成${isAiContestRadarText(text) ? " AI 赛事雷达" : "机会雷达"} V1.0。`);
    try {
      if (!heroRadarChatState.currentDraft) {
        const data = await postJson("/api/radars/generate", { description: text, chatWindowId });
        heroRadarChatState.currentDraft = normalizeGenerateResult(data, text);
      } else {
        heroRadarChatState.confirmedVersion = null;
        heroRadarChatState.currentResult = null;
        const revisionTrigger = options.trigger || heroRadarChatState.pendingRevisionTrigger || "requirement_correction";
        heroRadarChatState.pendingRevisionTrigger = "";
        const data = await postJson("/api/radars/revise", {
          previousSpec: heroRadarChatState.currentDraft.spec,
          previousRadarVersion: heroRadarChatState.currentDraft.radarVersion,
          userMessage: text,
          trigger: revisionTrigger,
          revisionMode: options.revisionMode || "auto",
          chatWindowId,
        });
        heroRadarChatState.currentDraft = {
          spec: data.spec,
          radarVersion: data.radarVersion,
          radarDiff: data.radarDiff,
          suggestedName: data.suggestedName || getDraftDisplayName(heroRadarChatState.currentDraft),
          description: `${heroRadarChatState.currentDraft.description || ""}\n${text}`.trim(),
        };
      }
      heroRadarChatState.currentDraft = normalizeHeroDemoRadarVersion(heroRadarChatState.currentDraft);
      updateRadarChatWindow({
        title: getDraftDisplayName(heroRadarChatState.currentDraft),
        draftRadarVersion: heroRadarChatState.currentDraft.radarVersion?.version || "V1.0",
      });
      persistMemorySummary({ lastFeedback: text });
      addMessage("assistant", `盯机会正在画雷达：我把雷达更新为 ${heroRadarChatState.currentDraft.radarVersion?.version || "V1.0"}，你先确认这版是否准确。`, {
        type: "radar",
        version: heroRadarChatState.currentDraft.radarVersion?.version,
        status: "draft",
        payload: heroRadarChatState.currentDraft.radarVersion,
        diff: heroRadarChatState.currentDraft.radarDiff,
      });
    } catch (err) {
      const message = err?.message || "未知错误";
      addMessage("assistant", `雷达理解或修订失败：${message}。我没有开始搜索，也没有保存新版雷达；你可以稍后重试，或把需求说得更具体一点。`);
      if (window.showToast) window.showToast(message, "error");
    } finally {
      heroRadarChatState.isBusy = false;
      saveState();
      renderHeroRadarChat();
    }
  }

  function markSpecConfirmed(spec) {
    return {
      ...(spec || {}),
      confirmation_status: {
        ...(spec?.confirmation_status || {}),
        status: "confirmed",
        user_confirmed: true,
        confirmed_at: new Date().toISOString(),
      },
    };
  }

  function buildLiveProgressSteps() {
    if (shouldUseHeroDemoReplay()) {
      return [
        "正在读取 AI 赛事雷达最近一次入库结果……",
        "正在整理已保存机会卡：报名入口、截止时间、奖金和云资源字段……",
        "正在按当前雷达画像挑出最值得先看的机会……",
        "正在排除历史赛事和不适合 OPC 的弱线索……",
        "正在把最近一次报告整理成聊天摘要……",
        "正在生成本次演示报告和机会卡入口……",
      ];
    }
    const radarVersion = heroRadarChatState.currentDraft?.radarVersion || {};
    if (isAiContestRadarPayload(radarVersion)) {
      return [
        "盯机会正在搜索官方赛事页、云厂商开发者活动和 Hackathon 平台……",
        "盯机会正在读取优先来源正文：云厂商赛事页、Devpost、DoraHacks、Lablab、Kaggle 和官方报名页……",
        "正在筛选可报名、可提交作品、可申请资源的机会……",
        "正在排除展会资讯、培训广告和学生专属结果……",
        "正在核对来源可信度，避免把资讯当成机会……",
        "盯机会正在生成报告摘要、机会卡和 Markdown 报告……",
      ];
    }
    return [
      "盯机会正在按这版雷达搜索官方来源、采购/合作入口和行业平台……",
      "盯机会正在读取优先来源正文：官方公告、采购页面、协会目录、平台入口和可信媒体线索……",
      "盯机会正在筛选当前用户能行动的机会，排除纯资讯、广告和无行动入口页面……",
      "盯机会正在核对来源可信度，避免把观察信号包装成已确认机会……",
      "盯机会正在生成报告摘要、机会卡和 Markdown 报告……",
    ];
  }

  function buildLiveProgressLogMessages() {
    if (shouldUseHeroDemoReplay()) {
      return [
        "回放模式：正在读取 AI 赛事雷达最近一次入库结果；不用刷新页面，我会持续更新这里。",
        "数据整理：正在把已保存机会卡按截止时间、报名入口和奖励信息重新排序；不用刷新页面，我会持续更新这里。",
        "机会筛选：正在挑出适合 OPC / AI 创业者先看的比赛和 Hackathon；不用刷新页面，我会持续更新这里。",
        "报告整理：正在把最近一次报告压缩成聊天摘要、机会卡入口和本周行动建议；不用刷新页面，我会持续更新这里。",
      ];
    }
    const radarVersion = heroRadarChatState.currentDraft?.radarVersion || {};
    if (isAiContestRadarPayload(radarVersion)) {
      return [
        "盯机会正在执行 AI 赛事、Hackathon、云资源扶持等查询组合；不用刷新页面，我会持续更新这里。",
        "盯机会正在优先保留 Devpost、DoraHacks、Lablab、云厂商赛事页、TRAE 和官方报名页；不用刷新页面，我会持续更新这里。",
        "盯机会正在读取优先来源正文，跳过视频、社媒和泛资讯页面；不用刷新页面，我会持续更新这里。",
        "盯机会正在标记报名入口、截止时间、参赛资格和待复核字段；不用刷新页面，我会持续更新这里。",
        "盯机会正在排除展会资讯、培训广告、学生专属和已过期结果；不用刷新页面，我会持续更新这里。",
        "盯机会正在基于证据生成报告摘要、行动建议和风险提醒；不用刷新页面，我会持续更新这里。",
      ];
    }
    return [
      "盯机会正在按雷达画像执行多组行业查询；不用刷新页面，我会持续更新这里。",
      "盯机会正在优先读取官方来源、采购/合作入口和行业平台；不用刷新页面，我会持续更新这里。",
      "盯机会正在标记当前用户能行动的入口、待复核字段和来源类型；不用刷新页面，我会持续更新这里。",
      "盯机会正在排除广告、纯资讯、无行动入口和对象错配结果；不用刷新页面，我会持续更新这里。",
      "盯机会正在基于证据生成报告摘要、行动建议和风险提醒；不用刷新页面，我会持续更新这里。",
    ];
  }

  async function confirmHeroRadar() {
    if (!heroRadarChatState.currentDraft || heroRadarChatState.isBusy) return;
    heroRadarChatState.isBusy = true;
    const draft = heroRadarChatState.currentDraft;
    const version = draft.radarVersion?.version || "当前雷达";
    const alreadyConfirmed = heroRadarChatState.confirmedVersion === version && heroRadarChatState.currentResult;
    if (alreadyConfirmed) {
      heroRadarChatState.isBusy = false;
      addMessage("assistant", `这版 ${version} 已经跑过一次了。你可以查看本次机会卡，或继续告诉我哪里不准，我先升级雷达。`);
      return;
    }
    const confirmedSpec = markSpecConfirmed(draft.spec);
    heroRadarChatState.confirmedVersion = version;
    heroRadarChatState.currentDraft = {
      ...draft,
      spec: confirmedSpec,
    };
    updateRadarChatWindow({
      title: getDraftDisplayName(draft),
      currentConfirmedRadarVersion: version,
      draftRadarVersion: version,
    });
    persistMemorySummary();
    const progressSteps = buildLiveProgressSteps();
    const progressMessage = addMessage("assistant", `已确认 ${version}，我开始按这版雷达盯一次。`, {
      type: "progress",
      steps: progressSteps,
      activeStepCount: 1,
      currentProgressLine: "已收到确认，正在准备调用搜索和报告链路；不用刷新页面，我会持续更新这里……",
    });
    const progressTimer = startProgressTicker(progressMessage.id, progressSteps.length);
    try {
      if (shouldUseHeroDemoReplay()) {
        await runHeroDemoReplay(draft, confirmedSpec, version, progressMessage);
      } else {
        await runHeroLiveSearch(draft, confirmedSpec, version, progressMessage);
      }
    } catch (err) {
      updateMessageArtifact(progressMessage.id, (artifact) => ({
        ...artifact,
        currentProgressLine: "已停止：这次搜索或报告生成失败，雷达已保留，可以调整后重试。",
      }));
      addMessage("assistant", `这次盯机会失败：${err.message || "未知错误"}。雷达已经确认，你可以继续补充条件后再让我修订。`);
      if (window.showToast) window.showToast(err.message || "盯机会失败", "error");
    } finally {
      stopProgressTicker(progressTimer);
      heroRadarChatState.isBusy = false;
      saveState();
      renderHeroRadarChat();
    }
  }

  function startProgressTicker(messageId, maxSteps) {
    let activeStepCount = 1;
    let logIndex = 0;
    const progressLogMessages = buildLiveProgressLogMessages();
    const timerId = window.setInterval(() => {
      activeStepCount = Math.min(activeStepCount + 1, maxSteps);
      const nextLine = `${new Date().toLocaleTimeString()} ${progressLogMessages[logIndex % progressLogMessages.length]}`;
      logIndex += 1;
      updateMessageArtifact(messageId, (artifact) => ({
        ...artifact,
        activeStepCount,
        currentProgressLine: nextLine,
      }));
    }, 900);
    return timerId;
  }

  function stopProgressTicker(timerId) {
    if (timerId) window.clearInterval(timerId);
  }

  function findLatestReportArtifact() {
    for (let index = heroRadarChatState.messages.length - 1; index >= 0; index -= 1) {
      const artifact = heroRadarChatState.messages[index]?.artifact;
      if (artifact?.type === "report") return artifact;
    }
    return null;
  }

  function restoreCurrentResultFromReportArtifact() {
    const artifact = findLatestReportArtifact();
    const cards = Array.isArray(artifact?.cards) ? artifact.cards : [];
    if (!artifact || cards.length === 0) return null;
    const restored = {
      runId: artifact.runId || `restored_report_${Date.now().toString(36)}`,
      reportId: artifact.reportId || `restored_report_${Date.now().toString(36)}`,
      description: heroRadarChatState.currentDraft?.description || HERO_DEMO_PROMPT,
      spec: heroRadarChatState.currentDraft?.spec || {},
      profile: heroRadarChatState.currentDraft?.spec?.profile_summary || heroRadarChatState.currentDraft?.spec?.profile,
      radarVersion: heroRadarChatState.currentDraft?.radarVersion,
      suggestedName: getDraftDisplayName(heroRadarChatState.currentDraft),
      opportunityCards: cards,
      sourceHintChecks: [],
      candidateAccounting: {
        rawCount: cards.length,
        deduplicatedCount: cards.length,
        assessedCount: cards.length,
        acceptedCount: cards.length,
        rejectedCount: 0,
      },
      rawCandidates: [],
      executionLog: {
        mode: "demo_replay_restored",
        source: "chat_report_artifact",
        message: "从聊天报告 artifact 恢复机会卡，没有触发本次 live search。",
      },
      runOutcome: {
        status: "succeeded",
        mode: "demo_replay_restored",
        message: "已从聊天报告恢复 AI 赛事雷达机会卡。",
      },
      searchMode: "demo_replay_restored",
      markdown: artifact.markdown || "",
    };
    heroRadarChatState.currentResult = restored;
    window.persistWatchResult?.(restored);
    saveState();
    updateRadarChatWindow({ currentResultSnapshot: restored });
    return restored;
  }

  async function restoreCurrentResultFromPublicEvents() {
    if (!shouldUseHeroDemoReplay()) return null;
    const feed = await fetchPublicAiEventsForReplay();
    const items = Array.isArray(feed?.items) ? feed.items : [];
    if (items.length === 0) return null;
    const version = heroRadarChatState.currentDraft?.radarVersion?.version || heroRadarChatState.confirmedVersion || "V1.0";
    const cards = items.map(mapPublicAiEventToOpportunityCard);
    const restored = {
      runId: `demo_replay_restored_${Date.now().toString(36)}`,
      reportId: `public_ai_events_report_restored_${Date.now().toString(36)}`,
      description: heroRadarChatState.currentDraft?.description || HERO_DEMO_PROMPT,
      spec: heroRadarChatState.currentDraft?.spec || {},
      profile: heroRadarChatState.currentDraft?.spec?.profile_summary || heroRadarChatState.currentDraft?.spec?.profile,
      radarVersion: heroRadarChatState.currentDraft?.radarVersion,
      suggestedName: getDraftDisplayName(heroRadarChatState.currentDraft),
      opportunityCards: cards,
      sourceHintChecks: [],
      candidateAccounting: {
        rawCount: feed?.stats?.totalCount ?? cards.length,
        deduplicatedCount: feed?.stats?.databaseCount ?? cards.length,
        assessedCount: cards.length,
        acceptedCount: cards.length,
        rejectedCount: 0,
      },
      rawCandidates: items,
      executionLog: {
        mode: "demo_replay_restored",
        source: "public_ai_events_database",
        message: "从 AI Events 公共赛事库恢复机会卡，没有触发本次 live search。",
      },
      runOutcome: {
        status: "succeeded",
        mode: "demo_replay_restored",
        message: "已从 AI Events 公共赛事库恢复机会卡。",
      },
      searchMode: "demo_replay_restored",
      markdown: buildHeroDemoReplayMarkdown(feed, cards, version),
    };
    heroRadarChatState.currentResult = restored;
    window.persistWatchResult?.(restored);
    saveState();
    updateRadarChatWindow({ currentResultSnapshot: restored });
    return restored;
  }

  async function viewHeroCards() {
    let result = heroRadarChatState.currentResult;
    if (!result) result = restoreCurrentResultFromReportArtifact();
    if (!result) {
      try {
        result = await restoreCurrentResultFromPublicEvents();
      } catch {
        result = null;
      }
    }
    if (result && typeof window.showWatchResult === "function") {
      window.showWatchResult(result);
      return;
    }
    if (window.switchTab) window.switchTab("watch-result");
  }

  function openHeroRadarEditor(radar) {
    return openHeroRadarForRadar(radar);
  }

  document.addEventListener("DOMContentLoaded", () => {
    restoreState();
    loadRadarChatWindows().then(() => renderHeroRadarChat()).catch(() => {});
    renderHeroRadarChat();
    restoreStateFromBackend().catch(() => {
      // Session storage remains the primary fast path; backend recovery is best-effort.
    });
  });

  window.addEventListener("chanceping-backend-language-change", () => {
    renderHeroRadarChat();
  });

  window.heroRadarChatState = heroRadarChatState;
  window.CHANCEPING_AI_EVENT_DEMO_PROMPT = HERO_DEMO_PROMPT;
  window.renderRadarArtifact = renderRadarArtifact;
  window.renderReportArtifact = renderReportArtifact;
  window.renderHeroRadarChat = renderHeroRadarChat;
  window.showHeroHomeEntry = showHeroHomeEntry;
  window.restoreStateFromBackend = restoreStateFromBackend;
  window.syncHeroEntryVisibility = syncHeroEntryVisibility;
  window.resetHeroRadarChat = resetHeroRadarChat;
  window.toggleHeroSidebar = toggleHeroSidebar;
  window.loadRadarChatWindows = loadRadarChatWindows;
  window.switchHeroRadarWindow = switchHeroRadarWindow;
  window.renameHeroRadarWindow = renameHeroRadarWindow;
  window.deleteHeroRadarWindow = deleteHeroRadarWindow;
  window.syncPendingInputMessage = syncPendingInputMessage;
  window.openHeroRadarForRadar = openHeroRadarForRadar;
  window.openHeroRadarFromResultFeedback = openHeroRadarFromResultFeedback;
  window.openHeroRadarWindow = openHeroRadarWindow;
  window.createNewHeroRadarWindow = createNewHeroRadarWindow;
  window.startHeroRadarChat = startHeroRadarChat;
  window.confirmHeroRadar = confirmHeroRadar;
  window.viewHeroCards = viewHeroCards;
  window.openHeroRadarEditor = openHeroRadarEditor;
})();
