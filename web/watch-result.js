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
    const runOutcome = result.runOutcome || {};
    const hasRunIssue = runOutcome.status && runOutcome.status !== "succeeded";
    const actionHtml = result.radarId ? `
      <div class="watch-action-row saved-radar-actions">
        <button id="btn-view-saved-radar-detail" class="btn-primary">查看本次雷达详情</button>
        <button id="btn-back-to-radar-list" class="btn-secondary">返回我的雷达列表</button>
        <button id="btn-adjust-watch-profile" class="btn-secondary">调整雷达画像</button>
      </div>
    ` : `
      <div class="watch-action-row">
        <button id="btn-save-watch-radar" class="btn-primary">保存为长期雷达，之后持续盯</button>
        <button id="btn-adjust-watch-profile" class="btn-secondary">调整雷达画像</button>
        ${hasRunIssue ? '<button id="btn-retry-watch-search" class="btn-secondary">重试搜索</button>' : ""}
      </div>
    `;
    root.innerHTML = `
      <div class="watch-result-header">
        <h3>${escapeHtml(getDisplayRadarTitle(result))}</h3>
        <p>${escapeHtml(result.description)}</p>
      </div>
      ${renderRunOutcomeNotice(result)}
      <div class="watch-result-actions">
        <div class="watch-save-copy">
          ${actionHtml}
          <p>下次不用重新描述，系统会按这个画像继续找机会。</p>
          ${result.savedMessage ? `<p class="save-success">${escapeHtml(result.savedMessage)}</p>` : ""}
        </div>
      </div>
      <div class="watch-result-grid">
        <section class="watch-opportunity-section">
          <h4>机会卡片</h4>
          ${renderTopActionStrip(cards)}
          ${renderOpportunityCardGrid(cards, result)}
        </section>
        <section class="watch-report-section">
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
    document.querySelectorAll("#btn-retry-watch-search").forEach((btn) => {
      btn.addEventListener("click", retryCurrentSearch);
    });
    document.getElementById("btn-adjust-watch-profile")?.addEventListener("click", () => {
      if (window.showRadarRevisionFromResultFeedback) {
        openRadarResultFeedback();
        return;
      }
      if (window.showRadarProfileDraftFromResult) window.showRadarProfileDraftFromResult(currentResult);
    });
    document.getElementById("btn-copy-markdown")?.addEventListener("click", () => copyMarkdown(markdown));
  }

  function getDisplayRadarTitle(result) {
    const radarVersionName = result?.radarVersion?.oneSentencePositioning || result?.radarVersion?.name || "";
    const suggested = result?.suggestedName || radarVersionName || "";
    if (/AI|赛事|Hackathon|马拉松|开发者挑战|云资源|OPC/i.test(`${suggested} ${result?.description || ""}`)) {
      return "AI 赛事雷达";
    }
    return suggested || "本次盯机会结果";
  }

  function openRadarResultFeedback() {
    if (!currentResult) return;
    const rejectedCardTitles = (currentResult.opportunityCards || [])
      .slice(0, 3)
      .map((card) => card.title)
      .filter(Boolean);
    if (window.showRadarRevisionFromResultFeedback) {
      window.showRadarRevisionFromResultFeedback({
        ...currentResult,
        resultFeedback: {
          rejectedCardTitles,
          rejectedReason: "这些结果不符合我想要的机会类型或行动入口",
          freeText: "这些结果不对，请先修改雷达策略，再让我确认新版雷达。",
        },
      });
    }
  }

  function renderRunOutcomeNotice(result) {
    const outcome = result?.runOutcome || {};
    if (!outcome.status || outcome.status === "succeeded") return "";
    const isLive = result?.searchMode === "live" || outcome.canSwitchToDemo;
    const message = outcome.message || (isLive
      ? "本轮真实搜索结果不足，但雷达已生成。你可以先保存这个雷达，之后继续盯机会。"
      : "本轮搜索结果不足，但雷达已生成。你可以先保存这个雷达，之后继续盯机会。");
    return `
      <div class="watch-run-outcome ${escapeHtml(outcome.status)}">
        <strong>${isLive ? "本轮真实搜索结果不足，但雷达已生成" : "本轮搜索结果不足，但雷达已生成"}</strong>
        <p>${escapeHtml(message)}</p>
        <p class="placeholder">可以选择保存为长期雷达、调整雷达策略，或重试搜索。</p>
      </div>
    `;
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

  function renderOpportunityCardGrid(cards, result) {
    if (!cards || cards.length === 0) return renderEmptyState(result);
    return `
      <div class="watch-opportunity-grid">
        ${cards.map(renderOpportunityCard).join("")}
      </div>
    `;
  }

  function renderTopActionStrip(cards) {
    const topCards = (cards || []).slice(0, 3);
    if (topCards.length === 0) return "";
    return `
      <div class="watch-top-actions" aria-label="先看这 3 个">
        <div>
          <strong>先看这 3 个</strong>
          <span>我把本轮最值得先打开复核的机会放在前面。</span>
        </div>
        <ol>
          ${topCards.map((card) => `
            <li>
              <span>${escapeHtml(card.visible_level || "C")} 级</span>
              <p>${escapeHtml(card.title || "未命名机会")}</p>
            </li>
          `).join("")}
        </ol>
      </div>
    `;
  }

  function renderOpportunityCard(card) {
    const url = card.official_source_url || card.url || "#";
    const isDemo = card.is_demo_data === true || card.data_mode === "mock" || /演示|测试数据|mock/i.test(`${card.risk_note || ""}${card.source_disclaimer || ""}`);
    const isLive = card.data_mode === "live" || /搜索发现|待复核/.test(`${card.source_disclaimer || ""}`);
    const sourceDomain = getSourceDomain(url);
    const source = isDemo
      ? "<span>演示来源，未真实核验</span>"
      : url && url !== "#"
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">打开来源${sourceDomain ? `：${escapeHtml(sourceDomain)}` : ""}</a>`
        : `<span>${isLive ? "搜索来源暂未明确" : "官方来源暂未明确"}</span>`;
    const opportunityKind = formatOpportunityKindForCustomer(card.opportunity_kind || card.opportunityKind || card.type || "机会");
    const evidenceStatus = formatEvidenceStatusForCustomer(card.evidence_status || card.evidenceStatus || "model_judgment");
    const actionStatus = formatActionStatusForCustomer(card.action_status || card.actionStatus || "prepare");
    const defaultAction = isDemo
      ? "先把这条当作演示样例；接入真实搜索后再复核来源和行动要求。"
      : "先打开来源页面，确认报名入口、截止时间、参赛资格和材料要求。";
    const reason = toCustomerEvidenceText(card.match_reason || card.fitReason || card.ai_analysis || card.relevance_reason || "与当前雷达画像匹配。");
    return `
      <article class="watch-opportunity-card">
        <header class="card-header">
          <span class="level-badge level-${escapeHtml((card.visible_level || "C").toLowerCase())}">${escapeHtml(card.visible_level || "C")} 级</span>
          ${isDemo || !url || url === "#"
            ? `<span>${escapeHtml(card.title || "未知机会")}</span>`
            : `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(card.title || "未知机会")}</a>`}
        </header>
        <div class="watch-card-decision-row" aria-label="本轮判断">
          <span>${escapeHtml(getPriorityCue(card.visible_level))}</span>
          <span>${escapeHtml(opportunityKind)}</span>
          <span>${escapeHtml(evidenceStatus)}</span>
        </div>
        <dl class="watch-card-fields">
          <div>
            <dt>为什么值得看</dt>
            <dd>${escapeHtml(reason)}</dd>
          </div>
          <div>
            <dt>本周先做</dt>
            <dd>${escapeHtml(card.next_action || (Array.isArray(card.recommendedActions) ? card.recommendedActions[0] : "") || defaultAction)}</dd>
          </div>
          <div>
            <dt>截止时间</dt>
            <dd>${escapeHtml(card.deadline || "暂未从来源中确认")}</dd>
          </div>
          <div>
            <dt>来源入口</dt>
            <dd>${source}</dd>
          </div>
        </dl>
      </article>
    `;
  }

  function getPriorityCue(level) {
    const normalized = String(level || "C").trim().toUpperCase();
    if (normalized === "S") return "强烈优先";
    if (normalized === "A") return "优先复核";
    if (normalized === "B") return "可以备选";
    return "先收藏观察";
  }

  function getSourceDomain(url) {
    try {
      if (!url || url === "#") return "";
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function formatOpportunityKindForCustomer(value) {
    const kind = String(value || "").trim();
    const labels = {
      direct_opportunity: "可报名 / 可行动赛事",
      business_lead: "需要联系确认的合作线索",
      channel_partner_lead: "潜在渠道或伙伴线索",
      customer_lead: "潜在客户线索",
      watch_signal: "观察信号",
      reference_case: "参考案例",
      rejected: "已降权结果",
    };
    return labels[kind] || kind.replace(/_/g, " ") || "机会";
  }

  function formatEvidenceStatusForCustomer(value) {
    const status = String(value || "").trim();
    const labels = {
      verified: "已读取来源，关键字段仍建议复核",
      partially_verified: "部分字段有来源支持",
      needs_review: "搜索发现，待打开官方页复核",
      model_judgment: "模型判断，待复核",
      unverified: "未核验，待复核",
      not_found: "未找到字段证据",
      failed: "来源读取失败",
    };
    return labels[status] || status.replace(/_/g, " ") || "待复核";
  }

  function formatActionStatusForCustomer(value) {
    const status = String(value || "").trim();
    const labels = {
      act_now: "优先打开官方入口",
      prepare: "准备材料并复核报名入口",
      monitor: "先收藏观察",
      drop: "暂不行动",
    };
    return labels[status] || status.replace(/_/g, " ") || "先复核来源";
  }

  function toCustomerEvidenceText(value) {
    const text = String(value || "").trim();
    if (!text) return "与当前雷达画像匹配。";
    if (/Live Evidence MVP|LLM\s*仍保持\s*mock|mock\s*轻量评估/i.test(text)) {
      if (/未读取正文|仅保留搜索发现|待复核/.test(text)) {
        return "搜索发现来源，尚未读取完整正文；请先打开官方入口复核报名、截止时间和参赛资格。";
      }
      if (/已有限读取|已读取网页正文/.test(text)) {
        return "已读取来源页面的部分正文；关键字段仍以官方页面复核为准。";
      }
      return "搜索发现来源，字段仍需复核；不要直接当作已确认机会。";
    }
    return text;
  }

  function getSearchModeRequest(preferredMode) {
    const mode = preferredMode || (typeof window.getChancePingSearchMode === "function" ? window.getChancePingSearchMode() : undefined);
    return mode === "live" ? { search_mode: "live" } : {};
  }

  function renderEmptyState(result) {
    const isLive = result?.searchMode === "live";
    const outcome = result?.runOutcome || {};
    return `
      <div class="watch-empty-state">
        <p>${outcome.message ? escapeHtml(outcome.message) : isLive ? "本次真实搜索结果不足，没有找到足够匹配的机会。" : "这次没有找到足够匹配的机会。"}你可以这样调整：</p>
        <ul>
          <li>放宽地区</li>
          <li>减少排除条件</li>
          <li>增加指定信号源</li>
          <li>保存为长期雷达继续监控</li>
        </ul>
        <div class="watch-action-row">
          <button id="btn-retry-watch-search" class="btn-secondary">重试搜索</button>
          ${isLive ? '<button id="btn-switch-demo-mode" class="btn-secondary">切回演示数据查看流程</button>' : ""}
        </div>
        ${isLive ? '<p class="placeholder">演示数据会明确标记为演示 / 测试数据，不代表真实机会。</p>' : ""}
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

  async function runWatchNow({ radarId, description, spec, profile, suggestedName, presetId, radarVersion }) {
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
      const runOutcome = search.data?.runOutcome;
      const runId = search.data?.run?.id;
      renderLoading(description, "正在生成机会报告");
      const report = await safeGenerateReport({
        spec,
        radar_type: "custom",
        opportunities: cards,
        sourceHintChecks,
        candidateAccounting,
        executionLog,
        rawCandidates,
        ...(radarId ? { radar_id: radarId, run_id: runId } : {}),
        profile,
      }, runOutcome);
      currentResult = {
        radarId,
        runId,
        description,
        spec,
        profile,
        radarVersion: radarVersion || spec?.radar_version,
        presetId,
        suggestedName: suggestedName || "本次盯机会结果",
        opportunityCards: cards,
        sourceHintChecks,
        candidateAccounting,
        rawCandidates,
        executionLog,
        runOutcome,
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

  async function safeGenerateReport(body, runOutcome) {
    try {
      return await postJson("/api/reports/generate", body);
    } catch (err) {
      return {
        data: {
          markdown: [
            "# ChancePing｜本轮机会雷达报告",
            "",
            "## 本轮结论",
            "",
            runOutcome?.message || `报告生成失败：${err.message || "未知错误"}`,
            "",
            "## 建议动作",
            "",
            "- 保存为长期雷达继续监控。",
            "- 调整雷达策略后重试搜索。",
            "- 增加指定信号源或放宽条件。",
            "",
          ].join("\n"),
        },
      };
    }
  }

  function retryCurrentSearch() {
    if (!currentResult?.spec) return;
    runWatchNow({
      description: currentResult.description,
      spec: currentResult.spec,
      profile: currentResult.profile,
      suggestedName: currentResult.suggestedName,
      presetId: currentResult.presetId,
      radarVersion: currentResult.radarVersion,
    }).catch((err) => {
      if (window.showToast) showToast(err.message || "重试搜索失败", "error");
    });
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
      let run = null;
      let report = null;
      try {
        run = await postJson(`/api/radars/${radarId}/run`, getSearchModeRequest(currentResult.searchMode));
        const runId = run.data?.run?.id;
        const cards = run.data?.opportunityCards || [];
        const sourceHintChecks = run.data?.sourceCoverage || run.data?.sourceHintChecks || [];
        const candidateAccounting = run.data?.candidateAccounting;
        const rawCandidates = run.data?.rawCandidates || [];
        const executionLog = run.data?.executionLog;
        if (cards.length > 0) {
          report = await postJson("/api/reports/generate", {
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
        }
      } catch (runErr) {
        run = {
          data: {
            runOutcome: {
              status: "failed",
              message: `本轮复跑失败：${runErr.message || "网络错误"}。雷达已保存，可稍后在我的雷达里重试。`,
              canRetry: true,
              canSaveRadar: true,
            },
          },
        };
      }
      const runId = run.data?.run?.id;
      const cards = run.data?.opportunityCards || currentResult.opportunityCards || [];
      const sourceHintChecks = run.data?.sourceCoverage || run.data?.sourceHintChecks || currentResult.sourceHintChecks || [];
      const candidateAccounting = run.data?.candidateAccounting || currentResult.candidateAccounting;
      const rawCandidates = run.data?.rawCandidates || currentResult.rawCandidates || [];
      const executionLog = run.data?.executionLog || currentResult.executionLog;
      const runOutcome = run.data?.runOutcome || currentResult.runOutcome;
      const reportMarkdown = report?.data?.markdown || currentResult.markdown;
      currentResult = {
        ...currentResult,
        radarId,
        runId,
        opportunityCards: cards,
        sourceHintChecks,
        candidateAccounting,
        rawCandidates,
        executionLog,
        runOutcome,
        markdown: reportMarkdown,
        reportId: report?.data?.reportId,
        savedMessage: report?.data?.reportId
          ? "已保存为长期雷达。本次机会和报告已经绑定到我的雷达。"
          : "已保存为长期雷达。本轮结果不足或报告尚未生成，可在我的雷达里再次盯机会。",
      };
      renderResult(currentResult);
      if (window.showToast) showToast(currentResult.reportId ? "已保存为长期雷达，并生成了绑定报告" : "已保存为长期雷达，可稍后再次盯机会", "success");
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

  function showWatchResult(result) {
    currentResult = result;
    switchToResult();
    renderResult(currentResult);
  }

  window.runWatchNow = runWatchNow;
  window.showWatchResult = showWatchResult;
})();
