(function () {
  "use strict";

  const STORAGE_KEY = "chanceping_hero_radar_chat_state";

  const heroRadarChatState = {
    messages: [],
    currentDraft: null,
    currentResult: null,
    confirmedVersion: null,
    modal: null,
    isBusy: false,
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

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(heroRadarChatState));
    } catch {
      // Ignore storage limits; the in-memory chat state still works.
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
      heroRadarChatState.confirmedVersion = parsed.confirmedVersion || null;
      heroRadarChatState.modal = parsed.modal || null;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
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
    return message;
  }

  function updateMessageArtifact(messageId, updater) {
    const message = findMessageById(messageId);
    if (!message) return;
    message.artifact = typeof updater === "function" ? updater(message.artifact || {}) : updater;
    saveState();
    renderHeroRadarChat();
  }

  function renderList(title, items) {
    const list = [...new Set(asArray(items).map(formatReadableItem).filter(Boolean))];
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
      return String(item);
    }
    if (Array.isArray(item)) {
      return item.map(formatReadableItem).filter(Boolean).join(" / ");
    }
    if (typeof item === "object") {
      const title = item.themeName || item.queryFamily || item.name || item.label || item.sourceArchetype || item.intentType;
      const examples = asArray(item.queryExamples).slice(0, 2).map(formatReadableItem).filter(Boolean);
      const parts = [
        title,
        item.intentType && item.intentType !== title ? item.intentType : "",
        item.sourceArchetype && item.sourceArchetype !== title ? item.sourceArchetype : "",
        examples.length ? `例如：${examples.join("；")}` : "",
      ].filter(Boolean);
      if (parts.length > 0) return parts.join("｜");
      return Object.values(item).flatMap((value) => asArray(value).map(formatReadableItem)).filter(Boolean).slice(0, 3).join(" / ");
    }
    return String(item);
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
    const levelCounts = list.reduce((acc, card) => {
      const level = card.visible_level || card.level || "待复核";
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});
    const levelText = ["S", "A", "B", "C"]
      .map((level) => `${level} 级 ${levelCounts[level] || 0} 条`)
      .join("，");
    return {
      total: list.length,
      levelText,
      topTitle: list[0]?.title || "",
    };
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
          <span class="hero-artifact-kicker">机会雷达</span>
          <span class="hero-version-pill">${escapeHtml(version)}</span>
          <span class="hero-status-pill ${confirmed ? "confirmed" : "draft"}">${confirmed ? "已确认" : "待确认"}</span>
        </div>
        <h3>${escapeHtml(payload.oneSentencePositioning || payload.name || "AI 赛事雷达")}</h3>
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
          <button class="secondary-btn" data-action="open-radar-modal" data-version="${escapeHtml(version)}" title="查看完整雷达细节">查看雷达画像</button>
          ${isLatestDraft
            ? `<button class="btn-primary hero-confirm-radar-btn" data-action="confirm-hero-radar">确认，按 ${escapeHtml(version)} 盯一次</button>`
            : `<span class="hero-artifact-note">${confirmed ? `已按 ${escapeHtml(version)} 跑过一次。` : isReplacedDraft ? "这版已被新版替代，请确认最新雷达。" : "等待新版雷达确认。"}</span>`}
          <span>不准的话，直接在聊天框继续说，我会先升级雷达。</span>
        </div>
      </article>
    `;
  }

  function renderReportArtifact(message) {
    const artifact = message.artifact || {};
    const summary = summarizeOpportunityCards(artifact.cards || heroRadarChatState.currentResult?.opportunityCards || []);
    return `
      <article class="hero-report-artifact">
        <div class="hero-artifact-topline">
          <span class="hero-artifact-kicker">Markdown Report</span>
          ${artifact.runId ? `<span class="hero-version-pill">${escapeHtml(artifact.runId)}</span>` : ""}
        </div>
        <div class="hero-report-summary">
          <strong>本次搜索出 ${escapeHtml(summary.total)} 条有效机会</strong>
          <span>${escapeHtml(summary.levelText)}</span>
          ${summary.topTitle ? `<p>优先查看：${escapeHtml(summary.topTitle)}</p>` : `<p>本轮没有把观察信号冒充为重点机会。</p>`}
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
    return `
      <article class="hero-progress-artifact" aria-live="polite">
        ${steps.slice(0, activeStepCount).map((step, index) => `<p class="${index === activeStepCount - 1 ? "active" : ""}">${escapeHtml(step)}</p>`).join("")}
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
          <h3>${escapeHtml(payload.oneSentencePositioning || payload.name || "AI 赛事雷达")}</h3>
          <div class="hero-artifact-grid">
            ${renderList("你是", payload.targetUser)}
            ${renderList("这版雷达会盯", payload.opportunityIntents)}
            ${renderList("什么算高价值", payload.highValueCriteria)}
            ${renderList("不盯什么", payload.exclusionRules)}
            ${renderList("优先看哪些来源", payload.prioritySourceArchetypes)}
            ${renderList("会用哪些查询方向", payload.queryFamilies)}
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
            <span class="hero-artifact-kicker">Markdown Report</span>
          </div>
          <pre class="hero-report-markdown">${escapeHtml(markdown)}</pre>
        </div>
      </dialog>
    `;
  }

  function renderHeroSidebar() {
    const version = heroRadarChatState.currentDraft?.radarVersion?.version || "V1.0";
    const activeName = heroRadarChatState.currentDraft?.suggestedName || "AI 赛事雷达";
    return `
      <aside class="hero-radar-sidebar" aria-label="雷达列表">
        <div class="hero-sidebar-brand">
          <strong>ChancePing</strong>
          <span>盯机会</span>
        </div>
        <button class="hero-new-radar-btn" type="button" data-action="new-hero-radar">新雷达</button>
        <div class="hero-sidebar-section">
          <span class="hero-sidebar-label">我的雷达</span>
          <button class="hero-sidebar-radar active" type="button" data-action="focus-hero-radar">
            <span>${escapeHtml(activeName)}</span>
            <small>${escapeHtml(version)}</small>
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
    [".home-examples-block", ".hero-demo-prompts"].forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) element.hidden = true;
    });
    [".home-hero", ".home-input-area", ".home-helper"].forEach((selector) => {
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
      <section class="hero-chat-workspace">
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
            <textarea id="hero-radar-chat-input" rows="2" placeholder="继续告诉我：你是谁、不要什么、什么结果才算有用"></textarea>
            <button id="hero-radar-chat-send" class="primary-btn" ${heroRadarChatState.isBusy ? "disabled" : ""}>发送</button>
          </div>` : ""}
        </div>
        ${heroRadarChatState.modal?.type === "radar" ? renderRadarModal(heroRadarChatState.modal.version) : ""}
        ${heroRadarChatState.modal?.type === "report" ? renderReportModal(heroRadarChatState.modal.messageId) : ""}
      </section>
    `;
    root.querySelector("#hero-chat-reset")?.addEventListener("click", resetHeroRadarChat);
    root.querySelector("[data-action='new-hero-radar']")?.addEventListener("click", resetHeroRadarChat);
    root.querySelector("[data-action='focus-hero-radar']")?.addEventListener("click", () => {
      root.querySelector("#hero-radar-chat-input")?.focus();
    });
    root.querySelector("#hero-radar-chat-send")?.addEventListener("click", () => {
      const input = root.querySelector("#hero-radar-chat-input");
      const value = input?.value?.trim();
      if (!value) return;
      input.value = "";
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
  }

  function resetHeroRadarChat() {
    heroRadarChatState.messages = [];
    heroRadarChatState.currentDraft = null;
    heroRadarChatState.currentResult = null;
    heroRadarChatState.confirmedVersion = null;
    heroRadarChatState.modal = null;
    heroRadarChatState.isBusy = false;
    sessionStorage.removeItem(STORAGE_KEY);
    renderHeroRadarChat();
    document.getElementById("home-input")?.focus();
    window.showToast?.("已清空当前演示，可以重新描述需求", "success");
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
    heroRadarChatState.isBusy = true;
    addMessage("user", text);
    addMessage("assistant", heroRadarChatState.currentDraft
      ? "收到，我会先根据这句话升级雷达版本，确认后再搜索。"
      : "我先把你的需求整理成 AI 赛事雷达 V1.0。");
    try {
      if (!heroRadarChatState.currentDraft) {
        const data = await postJson("/api/radars/generate", { description: text });
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
        });
        heroRadarChatState.currentDraft = {
          spec: data.spec,
          radarVersion: data.radarVersion,
          radarDiff: data.radarDiff,
          suggestedName: data.suggestedName || heroRadarChatState.currentDraft.suggestedName || "AI 赛事雷达",
          description: `${heroRadarChatState.currentDraft.description || ""}\n${text}`.trim(),
        };
      }
      addMessage("assistant", `我把雷达更新为 ${heroRadarChatState.currentDraft.radarVersion?.version || "V1.0"}，你先确认这版是否准确。`, {
        type: "radar",
        version: heroRadarChatState.currentDraft.radarVersion?.version,
        status: "draft",
        payload: heroRadarChatState.currentDraft.radarVersion,
        diff: heroRadarChatState.currentDraft.radarDiff,
      });
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
    const progressSteps = [
      "正在搜索官方赛事页、云厂商开发者活动和 Hackathon 平台……",
      "正在筛选可报名、可提交作品、可申请资源的机会……",
      "正在排除展会资讯、培训广告和学生专属结果……",
      "正在生成机会卡和 Markdown 报告……",
    ];
    const progressMessage = addMessage("assistant", `已确认 ${version}，我开始按这版雷达盯一次。`, {
      type: "progress",
      steps: progressSteps,
      activeStepCount: 1,
    });
    const progressTimer = startProgressTicker(progressMessage.id, progressSteps.length);
    try {
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
      addMessage("assistant", "本次机会雷达报告已生成。我先把 Markdown 发在这里，你也可以打开机会卡查看完整结果。", {
        type: "report",
        markdown: report.markdown,
        runId: search.run?.id,
        reportId: report.reportId,
      });
    } catch (err) {
      addMessage("assistant", `这次盯机会失败：${err.message || "未知错误"}。雷达已经确认，你可以继续补充条件后再让我修订。`);
      if (window.showToast) window.showToast(err.message || "盯机会失败", "error");
    } finally {
      stopProgressTicker(progressTimer);
      updateMessageArtifact(progressMessage.id, (artifact) => ({
        ...artifact,
        activeStepCount: progressSteps.length,
      }));
      heroRadarChatState.isBusy = false;
      saveState();
      renderHeroRadarChat();
    }
  }

  function startProgressTicker(messageId, maxSteps) {
    let activeStepCount = 1;
    const timerId = window.setInterval(() => {
      activeStepCount = Math.min(activeStepCount + 1, maxSteps);
      updateMessageArtifact(messageId, (artifact) => ({
        ...artifact,
        activeStepCount,
      }));
      if (activeStepCount >= maxSteps) {
        // Keep the last line visible while search/report generation completes.
        window.clearInterval(timerId);
      }
    }, 900);
    return timerId;
  }

  function stopProgressTicker(timerId) {
    if (timerId) window.clearInterval(timerId);
  }

  function viewHeroCards() {
    if (heroRadarChatState.currentResult && typeof window.showWatchResult === "function") {
      window.showWatchResult(heroRadarChatState.currentResult);
      return;
    }
    if (window.switchTab) window.switchTab("watch-result");
  }

  function openHeroRadarEditor(radar) {
    if (window.switchTab) window.switchTab("home");
    const name = radar?.name || "AI 赛事雷达";
    addMessage("assistant", `已打开「${name}」的雷达窗口。你可以直接告诉我哪里要改，我会先生成新版雷达给你确认。`);
    const input = document.getElementById("hero-radar-chat-input") || document.getElementById("home-input");
    input?.focus();
  }

  document.addEventListener("DOMContentLoaded", () => {
    restoreState();
    renderHeroRadarChat();
  });

  window.heroRadarChatState = heroRadarChatState;
  window.renderRadarArtifact = renderRadarArtifact;
  window.renderReportArtifact = renderReportArtifact;
  window.renderHeroRadarChat = renderHeroRadarChat;
  window.syncHeroEntryVisibility = syncHeroEntryVisibility;
  window.resetHeroRadarChat = resetHeroRadarChat;
  window.startHeroRadarChat = startHeroRadarChat;
  window.confirmHeroRadar = confirmHeroRadar;
  window.viewHeroCards = viewHeroCards;
  window.openHeroRadarEditor = openHeroRadarEditor;
})();
