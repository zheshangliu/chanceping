(function () {
  "use strict";

  const STORAGE_KEY = "chanceping_hero_radar_chat_state";
  const LAST_CHAT_WINDOW_KEY = "chanceping_hero_radar_chat_window_id";
  const SIDEBAR_COLLAPSED_KEY = "chanceping-sidebar-collapsed";
  const HERO_DEMO_PROMPT = "我是大湾区的 OPC / AI 产品创业者，正在打磨 ChancePing AI 赛事雷达 Demo。我想找未来 30-60 天内仍可报名、可提交项目或作品、适合个人开发者或小团队参加的 AI 比赛、AI Agent Hackathon、AI 创作赛事、AI IDE / Vibe Coding 比赛、云厂商开发者挑战、创业扶持和产品展示机会。请优先搜索 Qwen Cloud Hackathon、TRAE、Devpost、DoraHacks、Lablab.ai、Kaggle、阿里云、腾讯云、AWS、Google Cloud、Microsoft、GitHub、Hugging Face、Product Hunt、AI Grant、粤港澳大湾区和海外线上比赛，以及官方报名页、赛事官网、云厂商活动页和主办方公告。请排除展会资讯、培训广告、学生专属且 OPC 不能参加的比赛、已截止活动、纯新闻转载、社媒转帖和没有报名入口的页面。报告里请按 S/A/B/C 评级，给我报名截止、奖金或云资源、参赛资格、适合 ChancePing 的打法、材料清单、风险提醒，并明确本周先做哪三件事。";
  const AI_EVENT_SAMPLE_ROOM = {
    id: "ai-event-sample-room",
    name: "AI 赛事雷达",
    version: "V1.0",
    isSampleRoom: true,
  };

  const heroRadarChatState = {
    messages: [],
    currentDraft: null,
    currentResult: null,
    confirmedVersion: null,
    copiedRadarId: null,
    chatWindowId: null,
    boundRadarId: AI_EVENT_SAMPLE_ROOM.id,
    pendingFirstMessage: "",
    sidebarCollapsed: false,
    modal: null,
    isBusy: false,
  };

  let pendingChatWindowRequest = null;

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

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "请求失败");
    return json.data;
  }

  async function getJson(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "请求失败");
    return json.data;
  }

  async function patchJson(url, body) {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "请求失败");
    return json.data;
  }

  async function putJson(url, body) {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "请求失败");
    return json.data;
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
      title: draft?.suggestedName || "AI 赛事雷达",
      draftRadarVersion: draft?.radarVersion?.version || "V1.0",
    })
      .then((windowData) => {
        heroRadarChatState.chatWindowId = windowData.id;
        if (windowData.radarId) heroRadarChatState.boundRadarId = windowData.radarId;
        rememberLastChatWindow(windowData.id);
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

  function buildMemorySummaryFromDraft(extra = {}) {
    const version = heroRadarChatState.currentDraft?.radarVersion || {};
    const summary = version.oneSentencePositioning || heroRadarChatState.currentDraft?.description || "AI 赛事雷达正在学习你的需求。";
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

  async function restoreStateFromBackend() {
    if (heroRadarChatState.messages.length > 0) return false;
    const chatWindowId = getLastChatWindowId();
    if (!chatWindowId) return false;
    const detail = await getJson(`/api/radar-chats/${encodeURIComponent(chatWindowId)}`);
    const windowData = detail.window;
    const messages = Array.isArray(detail.messages) ? detail.messages : [];
    if (!windowData || messages.length === 0) return false;
    heroRadarChatState.chatWindowId = windowData.id;
    heroRadarChatState.boundRadarId = windowData.radarId || heroRadarChatState.boundRadarId;
    heroRadarChatState.currentDraft = windowData.draftSnapshot || null;
    heroRadarChatState.currentResult = windowData.currentResultSnapshot || null;
    if (heroRadarChatState.currentResult) {
      window.persistWatchResult?.(heroRadarChatState.currentResult);
    }
    heroRadarChatState.confirmedVersion = windowData.currentConfirmedRadarVersion || null;
    heroRadarChatState.messages = messages.map(restoreMessageFromBackend);
    heroRadarChatState.pendingFirstMessage = "";
    heroRadarChatState.modal = null;
    heroRadarChatState.isBusy = false;
    rememberLastChatWindow(windowData.id);
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
    const rawTitle = String(payload?.oneSentencePositioning || payload?.name || "AI 赛事雷达")
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
      return `${cleanTarget} 的 AI 赛事雷达`.replace(/\s+/g, " ");
    }
    return rawTitle || "AI 赛事雷达";
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
        reason: card.match_reason || card.next_action || "与本版 AI 赛事雷达相关，建议打开来源复核。",
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
      suggestedName: draft.suggestedName || "AI 赛事雷达",
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
    const search = await postJson("/api/search", {
      spec: confirmedSpec,
      query: draft.description || draft.radarVersion?.oneSentencePositioning || "AI entrepreneur competition hackathon developer challenge cloud credits application",
      ...(window.getChancePingSearchMode?.() ? { search_mode: window.getChancePingSearchMode() } : {}),
    });
    const cards = search.opportunityCards || [];
    const sourceHintChecks = search.sourceCoverage || search.sourceHintChecks || [];
    const report = await postJson("/api/reports/generate", {
      spec: confirmedSpec,
      radar_type: "custom",
      opportunities: cards,
      sourceHintChecks,
      candidateAccounting: search.candidateAccounting,
      executionLog: search.executionLog,
      rawCandidates: search.rawCandidates || [],
      run_id: search.run?.id,
      profile: confirmedSpec.profile_summary || confirmedSpec.profile,
    });
    heroRadarChatState.currentResult = {
      runId: search.run?.id,
      reportId: report.reportId,
      description: draft.description,
      spec: confirmedSpec,
      profile: confirmedSpec.profile_summary || confirmedSpec.profile,
      radarVersion: draft.radarVersion,
      suggestedName: draft.suggestedName || "AI 赛事雷达",
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
            <strong>${escapeHtml(payload.oneSentencePositioning || payload.name || "AI 赛事雷达")}</strong>
          </div>
          <span class="hero-artifact-note">已升级到 ${escapeHtml(currentVersion)}，请看下面的最新雷达。</span>
        </article>
      `;
    }
    return `
      <article class="hero-radar-artifact" data-hero-radar-version="${escapeHtml(version)}">
        <div class="hero-artifact-topline">
          <span class="hero-artifact-kicker">AI 赛事雷达</span>
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
          <button class="secondary-btn" data-action="open-radar-modal" data-version="${escapeHtml(version)}" title="打开完整雷达画像">打开雷达画像</button>
          ${isLatestDraft
            ? `<button class="btn-primary hero-confirm-radar-btn" data-action="confirm-hero-radar">确认，按 ${escapeHtml(version)} 盯一次</button>`
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
          <button class="secondary-btn" data-action="open-report-modal" data-message-id="${escapeHtml(message.id)}">查看完整 Markdown 报告</button>
          <button class="btn-primary" data-action="view-hero-cards">查看本次机会卡</button>
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
            <span class="hero-artifact-kicker">AI 赛事雷达</span>
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

  function renderHeroSidebar() {
    const version = heroRadarChatState.currentDraft?.radarVersion?.version || "V1.0";
    const activeName = heroRadarChatState.currentDraft?.suggestedName || "AI 赛事雷达";
    const hasDraft = Boolean(heroRadarChatState.currentDraft);
    return `
      <aside class="hero-radar-sidebar" aria-label="雷达列表">
        <div class="hero-sidebar-brand">
          <img src="/assets/logo.png?v=20260705" alt="" class="sidebar-brand-logo" />
          <div class="hero-sidebar-brand-text">
            <strong>ChancePing</strong>
            <span>盯机会</span>
          </div>
          <button class="hero-sidebar-collapse" type="button" data-action="toggle-sidebar" title="折叠或展开雷达侧边栏" aria-label="折叠或展开雷达侧边栏">☰</button>
        </div>
        <div class="hero-sidebar-section hero-sidebar-current-radar">
          <span class="hero-sidebar-label">当前雷达</span>
          <button class="hero-sidebar-radar active" type="button" data-action="focus-hero-radar">
            <span>${escapeHtml(activeName)}</span>
            <small>${hasDraft ? `${escapeHtml(version)} · 正在成长` : `${escapeHtml(version)} · Hero Demo`}</small>
          </button>
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

  function syncHeroEntryVisibility() {
    const chatStarted = heroRadarChatState.messages.length > 0;
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

  function renderHeroRadarChat() {
    const root = document.getElementById("hero-radar-chat-root");
    if (!root) return;
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
              <span>AI 赛事雷达</span>
              <strong>一个聊天窗口，一个正在成长的雷达</strong>
            </div>
            <button id="hero-chat-reset" class="hero-chat-reset" type="button">重新开始</button>
          </div>
          <div class="hero-chat-messages">
            ${messages.map(renderMessage).join("")}
          </div>
          ${chatStarted ? `<div class="hero-chat-input-row">
            <textarea id="hero-radar-chat-input" rows="2" placeholder="继续告诉我：你是谁、不要什么、什么结果才算有用">${escapeHtml(heroRadarChatState.pendingFirstMessage || "")}</textarea>
            <button id="hero-radar-chat-send" class="primary-btn" ${heroRadarChatState.isBusy ? "disabled" : ""}>发送</button>
          </div>` : ""}
        </div>
        ${heroRadarChatState.modal?.type === "radar" ? renderRadarModal(heroRadarChatState.modal.version) : ""}
        ${heroRadarChatState.modal?.type === "report" ? renderReportModal(heroRadarChatState.modal.messageId) : ""}
      </section>
    `;
    root.querySelector("#hero-chat-reset")?.addEventListener("click", resetHeroRadarChat);
    root.querySelector("[data-action='toggle-sidebar']")?.addEventListener("click", toggleHeroSidebar);
    root.querySelector("[data-action='focus-hero-radar']")?.addEventListener("click", () => {
      root.querySelector("#hero-radar-chat-input")?.focus();
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
    root.querySelector(".hero-artifact-modal")?.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeHeroModal();
    });
    scrollHeroChatToLatest();
  }

  function scrollHeroChatToLatest() {
    window.requestAnimationFrame(() => {
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
    heroRadarChatState.boundRadarId = AI_EVENT_SAMPLE_ROOM.id;
    heroRadarChatState.pendingFirstMessage = "";
    heroRadarChatState.modal = null;
    heroRadarChatState.isBusy = false;
    forgetLastChatWindow();
  }

  async function openHeroRadarWindow() {
    if (window.switchTab) window.switchTab("home");
    heroRadarChatState.boundRadarId = AI_EVENT_SAMPLE_ROOM.id;
    if (heroRadarChatState.messages.length === 0) {
      heroRadarChatState.pendingFirstMessage = HERO_DEMO_PROMPT;
      addMessage("assistant", "继续编辑 AI 赛事雷达。我已把默认需求放到底部输入框，你可以直接发送，也可以先改成自己的需求。");
    } else {
      if (!heroRadarChatState.currentDraft && !heroRadarChatState.pendingFirstMessage) {
        heroRadarChatState.pendingFirstMessage = HERO_DEMO_PROMPT;
      }
      saveState();
      renderHeroRadarChat();
    }
    window.setTimeout(() => document.getElementById("hero-radar-chat-input")?.focus(), 0);
  }

  async function createNewHeroRadarWindow(initialMessage = "") {
    if (window.switchTab) window.switchTab("home");
    clearHeroRadarConversation();
    heroRadarChatState.boundRadarId = null;
    const text = String(initialMessage || "").trim();
    heroRadarChatState.pendingFirstMessage = text;
    addMessage("assistant", text
      ? "这会成为一个新的雷达窗口。我已经把你的需求放到下方输入框里，等你点击发送后，我再开始画雷达。"
      : "这会成为一个新的雷达窗口。请在下方输入你想找什么机会，我会先画雷达，再让你确认。");
    window.setTimeout(() => document.getElementById("hero-radar-chat-input")?.focus(), 0);
  }

  function resetHeroRadarChat() {
    clearHeroRadarConversation();
    sessionStorage.removeItem(STORAGE_KEY);
    renderHeroRadarChat();
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

  function normalizeGenerateResult(data, description) {
    return {
      spec: data.spec,
      radarVersion: data.radarVersion || data.spec?.radar_version || {},
      radarDiff: data.radarDiff || null,
      suggestedName: data.suggestedName || data.spec?.name || "AI 赛事雷达",
      description,
    };
  }

  async function startHeroRadarChat(message, options = {}) {
    const text = String(message || "").trim();
    if (!text || heroRadarChatState.isBusy) return;
    if (options.autoSend === false && !heroRadarChatState.currentDraft) {
      heroRadarChatState.pendingFirstMessage = text;
      if (heroRadarChatState.messages.length === 0) {
        addMessage("assistant", "我已经把你的需求放到下方输入框里。等待你点击发送后，我再开始理解需求并生成 AI 赛事雷达。");
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
    addMessage("user", text);
    const chatWindowId = await ensureRadarChatWindow();
    addMessage("assistant", heroRadarChatState.currentDraft
      ? "收到，我会先让 DeepSeek 理解这句话，生成新版雷达草案；你确认后我才会搜索。"
      : "我先让 DeepSeek 理解你的需求，把复杂人话整理成 AI 赛事雷达 V1.0。");
    try {
      if (!heroRadarChatState.currentDraft) {
        const data = await postJson("/api/radars/generate", { description: text, chatWindowId });
        heroRadarChatState.currentDraft = normalizeGenerateResult(data, text);
      } else {
        heroRadarChatState.confirmedVersion = null;
        heroRadarChatState.currentResult = null;
        const data = await postJson("/api/radars/revise", {
          previousSpec: heroRadarChatState.currentDraft.spec,
          previousRadarVersion: heroRadarChatState.currentDraft.radarVersion,
          userMessage: text,
          trigger: options.trigger || "requirement_correction",
          revisionMode: options.revisionMode || "auto",
          chatWindowId,
        });
        heroRadarChatState.currentDraft = {
          spec: data.spec,
          radarVersion: data.radarVersion,
          radarDiff: data.radarDiff,
          suggestedName: data.suggestedName || heroRadarChatState.currentDraft.suggestedName || "AI 赛事雷达",
          description: `${heroRadarChatState.currentDraft.description || ""}\n${text}`.trim(),
        };
      }
      heroRadarChatState.currentDraft = normalizeHeroDemoRadarVersion(heroRadarChatState.currentDraft);
      updateRadarChatWindow({
        title: heroRadarChatState.currentDraft.suggestedName || "AI 赛事雷达",
        draftRadarVersion: heroRadarChatState.currentDraft.radarVersion?.version || "V1.0",
      });
      persistMemorySummary({ lastFeedback: text });
      addMessage("assistant", `我把雷达更新为 ${heroRadarChatState.currentDraft.radarVersion?.version || "V1.0"}，你先确认这版是否准确。`, {
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
      title: draft.suggestedName || "AI 赛事雷达",
      currentConfirmedRadarVersion: version,
      draftRadarVersion: version,
    });
    persistMemorySummary();
    const progressSteps = [
      shouldUseHeroDemoReplay()
        ? "正在读取 AI 赛事雷达最近一次入库结果……"
        : "正在搜索官方赛事页、云厂商开发者活动和 Hackathon 平台……",
      shouldUseHeroDemoReplay()
        ? "正在整理已保存机会卡：报名入口、截止时间、奖金和云资源字段……"
        : "正在读取优先来源正文：Qwen、Devpost、DoraHacks、Lablab、Kaggle 和官方报名页……",
      shouldUseHeroDemoReplay()
        ? "正在按当前雷达画像挑出最值得先看的机会……"
        : "正在筛选可报名、可提交作品、可申请资源的机会……",
      shouldUseHeroDemoReplay()
        ? "正在排除历史赛事和不适合 OPC 的弱线索……"
        : "正在排除展会资讯、培训广告和学生专属结果……",
      shouldUseHeroDemoReplay()
        ? "正在把最近一次报告整理成聊天摘要……"
        : "正在核对来源可信度，避免把资讯当成机会……",
      shouldUseHeroDemoReplay()
        ? "正在生成本次演示报告和机会卡入口……"
        : "正在生成报告摘要、机会卡和 Markdown 报告……",
    ];
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
    const progressLogMessages = shouldUseHeroDemoReplay()
      ? [
        "回放模式：正在读取 AI 赛事雷达最近一次入库结果；不用刷新页面，我会持续更新这里。",
        "数据整理：正在把已保存机会卡按截止时间、报名入口和奖励信息重新排序；不用刷新页面，我会持续更新这里。",
        "机会筛选：正在挑出适合 OPC / AI 创业者先看的比赛和 Hackathon；不用刷新页面，我会持续更新这里。",
        "报告整理：正在把最近一次报告压缩成聊天摘要、机会卡入口和本周行动建议；不用刷新页面，我会持续更新这里。",
      ]
      : [
        "Serper：正在执行 AI 赛事、Hackathon、云资源扶持等查询组合；不用刷新页面，我会持续更新这里。",
        "搜索计划：优先保留 Devpost、DoraHacks、Lablab、Qwen Cloud、TRAE 和官方报名页；不用刷新页面，我会持续更新这里。",
        "网页读取：正在读取优先来源正文，跳过视频、社媒和泛资讯页面；不用刷新页面，我会持续更新这里。",
        "证据整理：正在标记报名入口、截止时间、参赛资格和待复核字段；不用刷新页面，我会持续更新这里。",
        "质量闸门：正在排除展会资讯、培训广告、学生专属和已过期结果；不用刷新页面，我会持续更新这里。",
        "DeepSeek：正在基于证据生成报告摘要、行动建议和风险提醒；不用刷新页面，我会持续更新这里。",
        "报告生成：正在汇总 S/A/B/C 评级、材料清单和本周行动步骤；不用刷新页面，我会持续更新这里。",
      ];
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
      suggestedName: heroRadarChatState.currentDraft?.suggestedName || "AI 赛事雷达",
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
      suggestedName: heroRadarChatState.currentDraft?.suggestedName || "AI 赛事雷达",
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
    if (window.switchTab) window.switchTab("home");
    if (radar?.id) {
      heroRadarChatState.chatWindowId = null;
      heroRadarChatState.boundRadarId = radar.id;
    }
    const name = radar?.name || "AI 赛事雷达";
    addMessage("assistant", `已打开「${name}」的雷达窗口。你可以直接告诉我哪里要改，我会先生成新版雷达给你确认。`);
    const input = document.getElementById("hero-radar-chat-input") || document.getElementById("home-input");
    input?.focus();
  }

  document.addEventListener("DOMContentLoaded", () => {
    restoreState();
    renderHeroRadarChat();
    restoreStateFromBackend().catch(() => {
      // Session storage remains the primary fast path; backend recovery is best-effort.
    });
  });

  window.heroRadarChatState = heroRadarChatState;
  window.CHANCEPING_AI_EVENT_DEMO_PROMPT = HERO_DEMO_PROMPT;
  window.renderRadarArtifact = renderRadarArtifact;
  window.renderReportArtifact = renderReportArtifact;
  window.renderHeroRadarChat = renderHeroRadarChat;
  window.restoreStateFromBackend = restoreStateFromBackend;
  window.syncHeroEntryVisibility = syncHeroEntryVisibility;
  window.resetHeroRadarChat = resetHeroRadarChat;
  window.toggleHeroSidebar = toggleHeroSidebar;
  window.openHeroRadarWindow = openHeroRadarWindow;
  window.createNewHeroRadarWindow = createNewHeroRadarWindow;
  window.startHeroRadarChat = startHeroRadarChat;
  window.confirmHeroRadar = confirmHeroRadar;
  window.viewHeroCards = viewHeroCards;
  window.openHeroRadarEditor = openHeroRadarEditor;
})();
