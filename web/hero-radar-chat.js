(function () {
  "use strict";

  const STORAGE_KEY = "chanceping_hero_radar_chat_state";

  const heroRadarChatState = {
    messages: [],
    currentDraft: null,
    currentResult: null,
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
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  function addMessage(role, content, artifact) {
    heroRadarChatState.messages.push({
      id: uid(role),
      role,
      content,
      artifact,
      createdAt: new Date().toISOString(),
    });
    saveState();
    renderHeroRadarChat();
  }

  function renderList(title, items) {
    const list = asArray(items);
    if (list.length === 0) return "";
    return `
      <div class="hero-artifact-field">
        <strong>${escapeHtml(title)}</strong>
        <ul>${list.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    `;
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

  function renderRadarArtifact(message) {
    const artifact = message.artifact || {};
    const payload = artifact.payload || {};
    const diff = artifact.diff || {};
    const version = artifact.version || payload.version || "V1.0";
    const confirmed = artifact.status === "confirmed" || payload.confirmation_status?.user_confirmed === true;
    return `
      <article class="hero-radar-artifact" data-hero-radar-version="${escapeHtml(version)}">
        <div class="hero-artifact-topline">
          <span class="hero-artifact-kicker">Radar Artifact</span>
          <span class="hero-version-pill">${escapeHtml(version)}</span>
          <span class="hero-status-pill ${confirmed ? "confirmed" : "draft"}">${confirmed ? "已确认" : "待确认"}</span>
        </div>
        <h3>${escapeHtml(payload.oneSentencePositioning || payload.name || "AI 创业者机会雷达")}</h3>
        <p>${escapeHtml(payload.businessContext || payload.summary || "我会先把你的复杂需求整理成可执行的机会雷达。")}</p>
        <div class="hero-artifact-grid">
          ${renderList("你是", payload.targetUser)}
          ${renderList("这版雷达会盯", payload.opportunityIntents)}
          ${renderList("什么算高价值", payload.highValueCriteria)}
          ${renderList("不盯什么", payload.exclusionRules)}
          ${renderList("优先看哪些来源", payload.prioritySourceArchetypes)}
          ${renderList("会用哪些查询方向", payload.queryFamilies)}
          ${renderList("默认假设", payload.defaultAssumptions)}
        </div>
        ${diff && Object.keys(diff).length > 0 ? `
          <div class="hero-radar-diff">
            <strong>本次版本变化</strong>
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
        <div class="hero-artifact-actions">
          <button class="btn-primary hero-confirm-radar-btn" data-action="confirm-hero-radar">确认，按 ${escapeHtml(version)} 盯一次</button>
          <span>不准的话，直接在聊天框继续说，我会先升级雷达。</span>
        </div>
      </article>
    `;
  }

  function renderReportArtifact(message) {
    const artifact = message.artifact || {};
    const markdown = artifact.markdown || "本次报告暂未生成。";
    const summary = markdown.split("\n").filter((line) => line.trim()).slice(0, 12).join("\n");
    return `
      <article class="hero-report-artifact">
        <div class="hero-artifact-topline">
          <span class="hero-artifact-kicker">Markdown Report</span>
          ${artifact.runId ? `<span class="hero-version-pill">${escapeHtml(artifact.runId)}</span>` : ""}
        </div>
        <pre>${escapeHtml(summary)}</pre>
        <details>
          <summary>查看完整 Markdown 报告</summary>
          <pre>${escapeHtml(markdown)}</pre>
        </details>
        <button class="btn-primary" data-action="view-hero-cards">查看本次机会卡</button>
      </article>
    `;
  }

  function renderProgressArtifact(message) {
    const steps = asArray(message.artifact?.steps);
    return `
      <article class="hero-progress-artifact">
        ${steps.map((step) => `<p>${escapeHtml(step)}</p>`).join("")}
      </article>
    `;
  }

  function renderMessage(message) {
    const artifactHtml = message.artifact?.type === "radar"
      ? renderRadarArtifact(message)
      : message.artifact?.type === "report"
        ? renderReportArtifact(message)
        : message.artifact?.type === "progress"
          ? renderProgressArtifact(message)
          : "";
    return `
      <div class="hero-chat-message ${escapeHtml(message.role)}">
        <div class="hero-chat-bubble">
          ${message.content ? `<p>${escapeHtml(message.content)}</p>` : ""}
          ${artifactHtml}
        </div>
      </div>
    `;
  }

  function renderHeroRadarChat() {
    const root = document.getElementById("hero-radar-chat-root");
    if (!root) return;
    const messages = heroRadarChatState.messages.length > 0
      ? heroRadarChatState.messages
      : [{
        id: "hero_welcome",
        role: "assistant",
        content: "告诉我你的 AI 产品和你想找的机会，我会先帮你画一个可确认的机会雷达。",
        createdAt: new Date().toISOString(),
      }];
    root.innerHTML = `
      <section class="hero-chat-shell">
        <div class="hero-chat-header">
          <span>AI 创业者机会雷达</span>
          <strong>一个聊天窗口，一个正在成长的雷达</strong>
        </div>
        <div class="hero-chat-messages">
          ${messages.map(renderMessage).join("")}
        </div>
        <div class="hero-chat-input-row">
          <textarea id="hero-radar-chat-input" rows="2" placeholder="继续告诉我：你是谁、不要什么、什么结果才算有用"></textarea>
          <button id="hero-radar-chat-send" class="primary-btn" ${heroRadarChatState.isBusy ? "disabled" : ""}>发送</button>
        </div>
      </section>
    `;
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
  }

  function normalizeGenerateResult(data, description) {
    return {
      spec: data.spec,
      radarVersion: data.radarVersion || data.spec?.radar_version || {},
      radarDiff: data.radarDiff || null,
      suggestedName: data.suggestedName || data.spec?.name || "AI 创业者机会雷达",
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
      : "我先把你的需求整理成 AI 创业者机会雷达 V1.0。");
    try {
      if (!heroRadarChatState.currentDraft) {
        const data = await postJson("/api/radars/generate", { description: text });
        heroRadarChatState.currentDraft = normalizeGenerateResult(data, text);
      } else {
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
          suggestedName: data.suggestedName || heroRadarChatState.currentDraft.suggestedName || "AI 创业者机会雷达",
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
    heroRadarChatState.currentDraft.spec = markSpecConfirmed(heroRadarChatState.currentDraft.spec);
    addMessage("assistant", `已确认 ${heroRadarChatState.currentDraft.radarVersion?.version || "当前雷达"}。下一步会按这版雷达去盯机会。`, {
      type: "progress",
      steps: ["正在准备搜索计划……", "确认后才会调用搜索与报告生成。"],
    });
    saveState();
  }

  function viewHeroCards() {
    if (window.switchTab) window.switchTab("watch-result");
  }

  document.addEventListener("DOMContentLoaded", () => {
    restoreState();
    renderHeroRadarChat();
  });

  window.heroRadarChatState = heroRadarChatState;
  window.renderRadarArtifact = renderRadarArtifact;
  window.renderReportArtifact = renderReportArtifact;
  window.renderHeroRadarChat = renderHeroRadarChat;
  window.startHeroRadarChat = startHeroRadarChat;
  window.confirmHeroRadar = confirmHeroRadar;
  window.viewHeroCards = viewHeroCards;
})();
