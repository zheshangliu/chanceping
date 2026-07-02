(function () {
  "use strict";

  let currentResult = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function switchToResult() {
    if (window.switchTab) window.switchTab("watch-result");
  }

  function renderLoading(description, step) {
    const root = document.getElementById("watch-result-root");
    if (!root) return;
    root.innerHTML = `
      <div class="watch-loading-card">
        <strong>${escapeHtml(step || "正在盯机会")}</strong>
        <p>${escapeHtml(description)}</p>
      </div>
    `;
  }

  function renderResult(result) {
    const root = document.getElementById("watch-result-root");
    if (!root) return;
    const cards = result.opportunityCards || [];
    const markdown = result.markdown || "";
    const sourceHintChecks = result.sourceHintChecks || [];
    const actionHtml = result.radarId ? `
      <div class="watch-action-row saved-radar-actions">
        <button id="btn-view-saved-radar-detail" class="btn-primary">查看本次雷达详情</button>
        <button id="btn-back-to-radar-list" class="btn-secondary">返回我的雷达列表</button>
      </div>
    ` : `
      <div class="watch-action-row">
        <button id="btn-save-watch-radar" class="btn-primary">保存为长期雷达，之后持续盯</button>
        <button id="btn-adjust-watch-profile" class="btn-secondary">调整画像</button>
      </div>
    `;
    root.innerHTML = `
      <div class="watch-result-header">
        <h3>${escapeHtml(result.suggestedName || "本次盯机会结果")}</h3>
        <p>${escapeHtml(result.description)}</p>
      </div>
      <div class="watch-result-actions">
        <div class="watch-save-copy">
          ${actionHtml}
          <p>下次不用重新描述，系统会按这个画像继续找机会。</p>
          ${result.savedMessage ? `<p class="save-success">${escapeHtml(result.savedMessage)}</p>` : ""}
        </div>
      </div>
      <div class="watch-result-grid">
        <section>
          <h4>机会卡片</h4>
          ${cards.length === 0 ? renderEmptyState(result) : cards.map(renderCard).join("")}
        </section>
        <section>
          <div class="watch-report-title-row">
            <h4>报告摘要</h4>
            <button id="btn-copy-markdown" class="btn-secondary">复制 Markdown</button>
          </div>
          ${renderReportSummary(markdown, cards)}
          <details class="markdown-details">
            <summary>查看完整 Markdown 报告</summary>
            <pre class="watch-report-preview">${escapeHtml(markdown)}</pre>
          </details>
        </section>
        <section>
          <h4>本轮重点检查来源</h4>
          ${sourceHintChecks.length === 0 ? '<p class="placeholder">本轮未指定额外信号源。</p>' : sourceHintChecks.map(renderSourceHintCheck).join("")}
        </section>
      </div>
    `;
    document.getElementById("btn-save-watch-radar")?.addEventListener("click", saveCurrentRadar);
    document.getElementById("btn-view-saved-radar-detail")?.addEventListener("click", viewSavedRadarDetail);
    document.getElementById("btn-back-to-radar-list")?.addEventListener("click", backToSavedRadarList);
    document.getElementById("btn-switch-demo-mode")?.addEventListener("click", switchBackToDemoMode);
    document.getElementById("btn-adjust-watch-profile")?.addEventListener("click", () => {
      if (window.showRadarProfileDraftFromResult) window.showRadarProfileDraftFromResult(currentResult);
    });
    document.getElementById("btn-copy-markdown")?.addEventListener("click", () => copyMarkdown(markdown));
  }

  function renderSourceHintCheck(item) {
    const label = {
      checked: "搜索发现",
      no_results: "待复核，暂无结果",
      failed: "待复核",
      invalid_url: "待复核，无效网址",
      name_only: "来源名称，待复核",
      checked_with_results: "搜索发现，有结果",
      checked_no_results: "待复核，暂无结果",
      not_checked: "待复核，未检查",
    }[item.status] || item.status || "未知";
    const target = item.sourceUrl
      ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(item.sourceName || item.sourceUrl)}</a>`
      : `<span>${escapeHtml(item.sourceName || "未命名来源")}</span>`;
    return `
      <div class="source-hint-check">
        ${target}
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(item.resultCount || 0)} 条结果</small>
      </div>
    `;
  }

  function renderCard(card) {
    const url = card.official_source_url || card.url || "#";
    const isDemo = card.is_demo_data === true || card.data_mode === "mock" || /演示|测试数据|mock/i.test(`${card.risk_note || ""}${card.source_disclaimer || ""}`);
    const isLive = card.data_mode === "live" || /搜索发现|待复核/.test(`${card.source_disclaimer || ""}`);
    const source = isDemo
      ? "<span>演示来源，未真实核验</span>"
      : url && url !== "#"
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${isLive ? "查看搜索发现来源" : "官方来源"}</a>`
        : `<span>${isLive ? "搜索来源暂未明确" : "官方来源暂未明确"}</span>`;
    const sourceLabel = isDemo ? "来源说明" : isLive ? "搜索发现来源" : "官方来源";
    const opportunityKind = card.opportunity_kind || card.opportunityKind || card.type || "机会";
    const evidenceStatus = card.evidence_status || card.evidenceStatus || "model_judgment";
    const actionStatus = card.action_status || card.actionStatus || "建议确认";
    const defaultAction = isDemo
      ? "先保存雷达验证流程；接入真实搜索后再复核来源和行动要求。"
      : "先打开官方来源确认报名要求。";
    return `
      <article class="watch-opportunity-card">
        <header class="card-header">
          <span class="level-badge level-${escapeHtml((card.visible_level || "C").toLowerCase())}">${escapeHtml(card.visible_level || "C")}</span>
          ${isDemo || !url || url === "#"
            ? `<span>${escapeHtml(card.title || "未知机会")}</span>`
            : `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(card.title || "未知机会")}</a>`}
        </header>
        <div class="watch-card-meta">
          <span data-field="opportunity_kind">类型：${escapeHtml(opportunityKind)}</span>
          <span data-field="evidence_status">证据：${escapeHtml(evidenceStatus)}</span>
          <span data-field="action_status">行动：${escapeHtml(actionStatus)}</span>
        </div>
        <dl class="watch-card-fields">
          <div>
            <dt>为什么适合你</dt>
            <dd>${escapeHtml(card.match_reason || card.fitReason || card.ai_analysis || card.relevance_reason || "与当前雷达画像匹配。")}</dd>
          </div>
          <div>
            <dt>截止时间</dt>
            <dd>${escapeHtml(card.deadline || "未明确")}</dd>
          </div>
          <div>
            <dt>建议动作</dt>
            <dd>${escapeHtml(card.next_action || (Array.isArray(card.recommendedActions) ? card.recommendedActions[0] : "") || defaultAction)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(sourceLabel)}</dt>
            <dd>${source}</dd>
          </div>
        </dl>
      </article>
    `;
  }

  function getSearchModeRequest(preferredMode) {
    const mode = preferredMode || (typeof window.getChancePingSearchMode === "function" ? window.getChancePingSearchMode() : undefined);
    return mode === "live" ? { search_mode: "live" } : {};
  }

  function renderEmptyState(result) {
    const isLive = result?.searchMode === "live";
    return `
      <div class="watch-empty-state">
        <p>${isLive ? "本次真实搜索结果不足，没有找到足够匹配的机会。" : "这次没有找到足够匹配的机会。"}你可以这样调整：</p>
        <ul>
          <li>放宽地区</li>
          <li>减少排除条件</li>
          <li>增加指定信号源</li>
          <li>保存为长期雷达继续监控</li>
        </ul>
        ${isLive ? '<button id="btn-switch-demo-mode" class="btn-secondary">切回演示数据查看流程</button><p class="placeholder">演示数据会明确标记为演示 / 测试数据，不代表真实机会。</p>' : ""}
      </div>
    `;
  }

  function renderReportSummary(markdown, cards) {
    const lines = String(markdown || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("|") && !line.startsWith("-|-"));
    const summaryLine = lines.find((line) => !line.startsWith("- ")) || "本轮报告已生成，建议先查看机会卡片，再决定是否保存长期雷达。";
    const topCards = cards.slice(0, 3).map((card) => card.title).filter(Boolean);
    return `
      <div class="report-summary">
        <p>${escapeHtml(summaryLine.replace(/^[-*]\s*/, ""))}</p>
        ${topCards.length > 0 ? `
          <ul>
            ${topCards.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}
          </ul>
        ` : ""}
      </div>
    `;
  }

  async function runWatchNow({ radarId, description, spec, profile, suggestedName, presetId }) {
    if (!spec) throw new Error("缺少已确认的雷达规格");
    switchToResult();
    renderLoading(description, "正在搜索机会");
    try {
      const search = radarId
        ? await postJson(`/api/radars/${radarId}/run`, getSearchModeRequest())
        : await postJson("/api/search", { spec, query: description, ...getSearchModeRequest() });
      const cards = search.data?.opportunityCards || [];
      const sourceHintChecks = search.data?.sourceCoverage || search.data?.sourceHintChecks || [];
      const candidateAccounting = search.data?.candidateAccounting;
      const rawCandidates = search.data?.rawCandidates || [];
      const executionLog = search.data?.executionLog;
      const runId = search.data?.run?.id;
      renderLoading(description, "正在生成机会报告");
      const report = await postJson("/api/reports/generate", {
        spec,
        radar_type: "custom",
        opportunities: cards,
        sourceHintChecks,
        candidateAccounting,
        executionLog,
        rawCandidates,
        ...(radarId ? { radar_id: radarId, run_id: runId } : {}),
        profile,
      });
      currentResult = {
        radarId,
        runId,
        description,
        spec,
        profile,
        presetId,
        suggestedName: suggestedName || "本次盯机会结果",
        opportunityCards: cards,
        sourceHintChecks,
        candidateAccounting,
        rawCandidates,
        executionLog,
        searchMode: getSearchModeRequest().search_mode,
        markdown: report.data.markdown,
      };
      renderResult(currentResult);
    } catch (err) {
      const root = document.getElementById("watch-result-root");
      if (root) {
        const isLive = getSearchModeRequest().search_mode === "live";
        root.innerHTML = `
          <div class="watch-empty-state">
            <p>${isLive ? "Live 真实搜索失败：" : "盯机会失败："}${escapeHtml(err.message)}</p>
            ${isLive ? '<button id="btn-switch-demo-mode" class="btn-secondary">切回演示数据查看流程</button><p class="placeholder">演示数据会明确标记为演示 / 测试数据，不会伪装成真实搜索结果。</p>' : ""}
          </div>
        `;
        document.getElementById("btn-switch-demo-mode")?.addEventListener("click", switchBackToDemoMode);
      }
    }
  }

  function switchBackToDemoMode() {
    try {
      window.localStorage?.removeItem("chanceping_live_search");
    } catch {
      // ignore storage failures
    }
    if (window.showToast) showToast("已切回演示数据模式", "success");
    if (window.switchTab) window.switchTab("home");
  }

  async function saveCurrentRadar() {
    if (!currentResult) return;
    if (currentResult.radarId) {
      backToSavedRadarList();
      return;
    }
    const btn = document.getElementById("btn-save-watch-radar");
    const previousText = btn?.textContent || "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "正在保存并启动长期雷达...";
    }
    try {
      const name = currentResult.suggestedName || "我的机会雷达";
      const created = await postJson("/api/radars", {
        name,
        kind: "custom",
        spec: currentResult.spec,
        ...(currentResult.searchMode === "live" ? { preferredSearchMode: "live" } : {}),
      });
      const radarId = created.data.id;
      await postJson(`/api/radars/${radarId}/activate`, {});
      const run = await postJson(`/api/radars/${radarId}/run`, getSearchModeRequest(currentResult.searchMode));
      const runId = run.data?.run?.id;
      const cards = run.data?.opportunityCards || [];
      const sourceHintChecks = run.data?.sourceCoverage || run.data?.sourceHintChecks || [];
      const candidateAccounting = run.data?.candidateAccounting;
      const rawCandidates = run.data?.rawCandidates || [];
      const executionLog = run.data?.executionLog;
      const report = await postJson("/api/reports/generate", {
        spec: currentResult.spec,
        radar_type: "custom",
        opportunities: cards,
        sourceHintChecks,
        candidateAccounting,
        executionLog,
        rawCandidates,
        radar_id: radarId,
        run_id: runId,
        profile: currentResult.profile,
      });
      currentResult = {
        ...currentResult,
        radarId,
        runId,
        opportunityCards: cards,
        sourceHintChecks,
        candidateAccounting,
        rawCandidates,
        executionLog,
        markdown: report.data.markdown,
        reportId: report.data.reportId,
        savedMessage: "已保存为长期雷达。本次机会和报告已经绑定到我的雷达。",
      };
      renderResult(currentResult);
      if (window.showToast) showToast("已保存为长期雷达，并生成了绑定报告", "success");
    } catch (err) {
      if (window.showToast) showToast(err.message || "保存失败", "error");
      if (btn) {
        btn.disabled = false;
        btn.textContent = previousText;
      }
    }
  }

  function viewSavedRadarDetail() {
    const radarId = currentResult?.radarId;
    if (!radarId) return;
    if (window.switchTab) window.switchTab("radars");
    window.setTimeout(() => {
      if (typeof window.goToDetail === "function") {
        window.goToDetail(radarId);
      }
    }, 0);
  }

  function backToSavedRadarList() {
    if (window.switchTab) window.switchTab("radars");
    window.setTimeout(() => {
      if (typeof window.backToList === "function") {
        window.backToList();
      } else if (typeof window.loadRadarList === "function") {
        window.loadRadarList();
      }
    }, 0);
  }

  async function copyMarkdown(markdown) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown || "");
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = markdown || "";
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      if (window.showToast) showToast("Markdown 已复制", "success");
    } catch (err) {
      if (window.showToast) showToast(err.message || "复制失败", "error");
    }
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "请求失败");
    return json;
  }

  window.runWatchNow = runWatchNow;
})();
