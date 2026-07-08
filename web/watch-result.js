(function () {
  "use strict";

  const LAST_WATCH_RESULT_KEY = "chanceping:last-watch-result";
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

  function currentBackendLanguage() {
    return window.CHANCEPING_BACKEND_I18N?.getLanguage?.() || "zh";
  }

  function backendText(key, fallback) {
    return window.CHANCEPING_BACKEND_I18N?.t?.(key) || fallback || key;
  }

  function persistWatchResult(result) {
    if (!result) return;
    try {
      sessionStorage.setItem(LAST_WATCH_RESULT_KEY, JSON.stringify(result));
    } catch (err) {
      // 缓存失败不影响主链路，顶部结果页只是少一个恢复入口。
    }
  }

  function readPersistedWatchResult() {
    try {
      const raw = sessionStorage.getItem(LAST_WATCH_RESULT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function restoreLatestWatchResult() {
    if (currentResult) return currentResult;
    const persisted = readPersistedWatchResult();
    if (!persisted) return null;
    currentResult = persisted;
    renderResult(currentResult);
    return currentResult;
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
        <button id="btn-view-saved-radar-detail" class="btn-primary">${escapeHtml(backendText("viewRadarDetail", "查看本次雷达详情"))}</button>
        <button id="btn-back-to-radar-list" class="btn-secondary">${escapeHtml(backendText("backToRadarList", "返回我的雷达列表"))}</button>
        <button id="btn-adjust-watch-profile" class="btn-secondary">${escapeHtml(backendText("adjustRadarProfile", "调整雷达画像"))}</button>
      </div>
    ` : `
      <div class="watch-action-row">
        <button id="btn-save-watch-radar" class="btn-primary">${escapeHtml(currentBackendLanguage() === "en" ? "Save as long-term radar" : "保存为长期雷达，之后持续盯")}</button>
        <button id="btn-adjust-watch-profile" class="btn-secondary">${escapeHtml(backendText("adjustRadarProfile", "调整雷达画像"))}</button>
        ${hasRunIssue ? `<button id="btn-retry-watch-search" class="btn-secondary">${escapeHtml(backendText("retrySearch", "重试搜索"))}</button>` : ""}
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
          <p>${escapeHtml(backendText("saveHint", "下次不用重新描述，系统会按这个画像继续找机会。"))}</p>
          ${result.savedMessage ? `<p class="save-success">${escapeHtml(result.savedMessage)}</p>` : ""}
        </div>
      </div>
      <div class="watch-result-grid">
        <section class="watch-opportunity-section">
          <div class="watch-section-heading">
            <div>
              <h4>${escapeHtml(backendText("resultBoard", "机会管道看板"))}</h4>
              <p>${escapeHtml(backendText("resultBoardDesc", "先看能立刻行动的，再复核资格、持续观察，最后保留本轮降权原因。"))}</p>
            </div>
          </div>
          ${renderTopActionStrip(cards)}
          ${renderOpportunityPipeline(cards, result)}
          <details class="watch-all-cards-details">
            <summary>${escapeHtml(backendText("allCards", "查看全部机会卡"))}</summary>
            ${renderOpportunityCardGrid(cards, result)}
          </details>
        </section>
        <section class="watch-report-section">
          <div class="watch-report-title-row">
            <h4>${escapeHtml(backendText("reportSummary", "报告摘要"))}</h4>
            <button id="btn-copy-markdown" class="btn-secondary">${escapeHtml(backendText("copyMarkdown", "复制 Markdown"))}</button>
          </div>
          ${renderReportSummary(markdown, cards)}
          <details class="markdown-details">
            <summary>${escapeHtml(backendText("fullMarkdownReport", "查看完整 Markdown 报告"))}</summary>
            <pre class="watch-report-preview">${escapeHtml(markdown)}</pre>
          </details>
        </section>
        <section>
          <h4>${escapeHtml(backendText("sourceChecks", "本轮重点检查来源"))}</h4>
          ${sourceHintChecks.length === 0 ? `<p class="placeholder">${escapeHtml(backendText("noExtraSources", "本轮未指定额外信号源。"))}</p>` : sourceHintChecks.map(renderSourceHintCheck).join("")}
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
      if (window.openHeroRadarFromResultFeedback) {
        openRadarChatFromResultFeedback();
        return;
      }
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
      return "全球 AI 赛事导航";
    }
    return suggested || "本次盯机会结果";
  }

  function displayDeadline(value) {
    const text = String(value || "").trim();
    if (!text || text === "9999-12-31" || text === "0000-00-00" || /^9999-12-31/.test(text)) return currentBackendLanguage() === "en" ? "See official site" : "见官网";
    return text;
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

  function openRadarChatFromResultFeedback() {
    if (!currentResult || !window.openHeroRadarFromResultFeedback) return;
    const rejectedCardTitles = (currentResult.opportunityCards || [])
      .slice(0, 3)
      .map((card) => card.title)
      .filter(Boolean);
    window.openHeroRadarFromResultFeedback({
      ...currentResult,
      resultFeedback: {
        rejectedCardTitles,
        rejectedReason: "这些结果不符合我想要的机会类型或行动入口",
        freeText: "这些结果不对，请先修改雷达策略，再让我确认新版雷达。",
      },
    });
  }

  function renderRunOutcomeNotice(result) {
    const outcome = result?.runOutcome || {};
    if (!outcome.status || outcome.status === "succeeded") return "";
    const isLive = result?.searchMode === "live" || outcome.canSwitchToDemo;
    const isEnglish = currentBackendLanguage() === "en";
    const message = outcome.message || (isLive
      ? (isEnglish ? "This live run did not find enough matching results, but the radar was generated. You can save it and keep monitoring." : "本轮真实搜索结果不足，但雷达已生成。你可以先保存这个雷达，之后继续盯机会。")
      : (isEnglish ? "This run did not find enough matching results, but the radar was generated. You can save it and keep monitoring." : "本轮搜索结果不足，但雷达已生成。你可以先保存这个雷达，之后继续盯机会。"));
    return `
      <div class="watch-run-outcome ${escapeHtml(outcome.status)}">
        <strong>${escapeHtml(isLive
          ? (isEnglish ? "Live results were limited, but the radar was generated" : "本轮真实搜索结果不足，但雷达已生成")
          : (isEnglish ? "Results were limited, but the radar was generated" : "本轮搜索结果不足，但雷达已生成"))}</strong>
        <p>${escapeHtml(message)}</p>
        <p class="placeholder">${escapeHtml(isEnglish ? "You can save it as a long-term radar, adjust the radar strategy, or retry the search." : "可以选择保存为长期雷达、调整雷达策略，或重试搜索。")}</p>
      </div>
    `;
  }

  function renderSourceHintCheck(item) {
    const label = {
      checked: currentBackendLanguage() === "en" ? "Search discovery" : "搜索发现",
      no_results: currentBackendLanguage() === "en" ? "Needs review, no results" : "待复核，暂无结果",
      failed: currentBackendLanguage() === "en" ? "Needs review" : "待复核",
      invalid_url: currentBackendLanguage() === "en" ? "Needs review, invalid URL" : "待复核，无效网址",
      name_only: currentBackendLanguage() === "en" ? "Source name, needs review" : "来源名称，待复核",
      checked_with_results: currentBackendLanguage() === "en" ? "Search discovery, has results" : "搜索发现，有结果",
      checked_no_results: currentBackendLanguage() === "en" ? "Needs review, no results" : "待复核，暂无结果",
      not_checked: currentBackendLanguage() === "en" ? "Needs review, not checked" : "待复核，未检查",
    }[item.status] || item.status || (currentBackendLanguage() === "en" ? "Unknown" : "未知");
    const target = item.sourceUrl
      ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(item.sourceName || item.sourceUrl)}</a>`
      : `<span>${escapeHtml(item.sourceName || (currentBackendLanguage() === "en" ? "Unnamed source" : "未命名来源"))}</span>`;
    return `
      <div class="source-hint-check">
        ${target}
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(item.resultCount || 0)} ${escapeHtml(currentBackendLanguage() === "en" ? "results" : "条结果")}</small>
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

  function renderOpportunityPipeline(cards, result) {
    if (!cards || cards.length === 0) return renderEmptyState(result);
    const lanes = [
      {
        key: "immediate",
        title: backendText("immediateAction", "立即行动"),
        desc: backendText("immediateActionDesc", "建议本周优先打开官方入口，复核报名、提交作品或申请资源路径。"),
        items: [],
      },
      {
        key: "review",
        title: backendText("reviewEligibility", "复核资格"),
        desc: backendText("reviewEligibilityDesc", "方向匹配，但还需要确认资格、费用、截止时间或主办方字段。"),
        items: [],
      },
      {
        key: "monitor",
        title: backendText("monitorSignals", "持续观察"),
        desc: backendText("monitorSignalsDesc", "可作为下一轮监控线索，不直接包装成已确认机会。"),
        items: [],
      },
      {
        key: "rejected",
        title: backendText("downgradeReasons", "淘汰原因"),
        desc: backendText("downgradeReasonsDesc", "低行动性、弱页面、过期或与当前雷达不匹配的结果。"),
        items: [],
      },
    ];
    const laneMap = Object.fromEntries(lanes.map((lane) => [lane.key, lane]));
    cards.forEach((card, index) => {
      const key = classifyOpportunityLane(card, index);
      laneMap[key]?.items.push(card);
    });
    return `
      <div class="watch-pipeline-board" aria-label="${escapeHtml(backendText("resultBoard", "机会管道看板"))}">
        ${lanes.map((lane) => `
          <article class="watch-pipeline-lane lane-${escapeHtml(lane.key)}">
            <header>
              <div>
                <h5>${escapeHtml(lane.title)}</h5>
                <p>${escapeHtml(lane.desc)}</p>
              </div>
              <span>${lane.items.length}</span>
            </header>
            <div class="watch-pipeline-list">
              ${lane.items.length > 0
                ? lane.items.slice(0, 5).map((card) => renderPipelineCard(card, lane.key)).join("")
                : `<div class="watch-pipeline-empty">${escapeHtml(getPipelineEmptyCopy(lane.key))}</div>`}
            </div>
          </article>
        `).join("")}
      </div>
    `;
  }

  function classifyOpportunityLane(card, index) {
    const level = String(card.visible_level || card.level || "C").trim().toUpperCase();
    const semantic = String(card.semantic_type || card.opportunity_kind || card.opportunityKind || card.type || "").toLowerCase();
    const action = String(card.action_status || card.actionStatus || card.next_action || "").toLowerCase();
    const evidence = String(card.evidence_status || card.evidenceStatus || "").toLowerCase();
    const reason = String(card.rejection_reason || card.rejectedReason || card.risk_note || card.source_disclaimer || "").toLowerCase();
    if (/reject|rejected|淘汰|降权|low_action|not_for_current_user|mismatch/.test(`${semantic} ${action} ${reason}`)) {
      return "rejected";
    }
    if (/watch_signal|reference_case|observe|monitor|观察|参考/.test(`${semantic} ${action}`) || level === "C") {
      return "monitor";
    }
    if ((level === "S" || level === "A") && index < 5 && !/unverified|not_found|failed|unknown/.test(evidence)) {
      return "immediate";
    }
    if (/direct_opportunity|business_lead|channel_partner_lead|customer_lead|apply|register|submit|contact|bid|prepare/.test(`${semantic} ${action}`)) {
      return level === "B" || /needs_review|model_judgment|partially_verified|unverified|unknown/.test(evidence) ? "review" : "immediate";
    }
    return "review";
  }

  function renderPipelineCard(card, laneKey) {
    const url = card.official_source_url || card.url || "";
    const domain = getSourceDomain(url) || (currentBackendLanguage() === "en" ? "Source to review" : "待复核来源");
    const level = String(card.visible_level || "C").trim().toUpperCase();
    const title = card.title || (currentBackendLanguage() === "en" ? "Unnamed opportunity" : "未命名机会");
    const nextAction = card.next_action || (Array.isArray(card.recommendedActions) ? card.recommendedActions[0] : "") || getPipelineDefaultAction(laneKey);
    const reason = toCustomerEvidenceText(card.match_reason || card.fitReason || card.ai_analysis || card.relevance_reason || "");
    return `
      <div class="watch-pipeline-card level-${escapeHtml(level.toLowerCase())}">
        <div class="pipeline-card-top">
          <span>${escapeHtml(level)} 级</span>
          <small>${escapeHtml(domain)}</small>
        </div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(reason || getPipelineDefaultReason(laneKey))}</p>
        <em>${escapeHtml(nextAction)}</em>
      </div>
    `;
  }

  function getPipelineEmptyCopy(laneKey) {
    const copy = {
      immediate: currentBackendLanguage() === "en" ? "No strong action item this round." : "本轮暂未形成强行动项。",
      review: currentBackendLanguage() === "en" ? "No candidates need separate review." : "暂无需要单独复核的候选。",
      monitor: currentBackendLanguage() === "en" ? "No monitor signals." : "暂无观察信号。",
      rejected: currentBackendLanguage() === "en" ? "No clear downgrade items." : "暂无明确淘汰项。",
    };
    return copy[laneKey] || (currentBackendLanguage() === "en" ? "No results." : "暂无结果。");
  }

  function getPipelineDefaultAction(laneKey) {
    const copy = {
      immediate: currentBackendLanguage() === "en" ? "Open the source and verify entry path and deadline." : "打开来源，复核报名入口和截止时间。",
      review: currentBackendLanguage() === "en" ? "Review eligibility, fees, deadline, and organizer first." : "先复核资格、费用、截止时间和主办方。",
      monitor: currentBackendLanguage() === "en" ? "Add to next-round monitoring keywords." : "加入下一轮监控关键词。",
      rejected: currentBackendLanguage() === "en" ? "No action this round; keep only the reason." : "本轮不行动，仅保留原因。",
    };
    return copy[laneKey] || (currentBackendLanguage() === "en" ? "Review the source first." : "先复核来源。");
  }

  function getPipelineDefaultReason(laneKey) {
    const copy = {
      immediate: currentBackendLanguage() === "en" ? "Strong fit for this radar; review first." : "与当前雷达画像高度匹配，建议优先复核。",
      review: currentBackendLanguage() === "en" ? "Direction matches, but evidence fields need confirmation." : "方向匹配，但证据字段仍需确认。",
      monitor: currentBackendLanguage() === "en" ? "Keep watching as a trend or source clue." : "可作为趋势或来源线索继续观察。",
      rejected: currentBackendLanguage() === "en" ? "Evidence is insufficient or actionability is weak." : "当前证据不足或行动性偏弱。",
    };
    return copy[laneKey] || (currentBackendLanguage() === "en" ? "Relevant to this radar." : "与当前雷达画像相关。");
  }

  function renderTopActionStrip(cards) {
    const topCards = (cards || []).slice(0, 3);
    if (topCards.length === 0) return "";
    return `
      <div class="watch-top-actions" aria-label="${escapeHtml(backendText("topThree", "先看这 3 个"))}">
        <div>
          <strong>${escapeHtml(backendText("topThree", "先看这 3 个"))}</strong>
          <span>${escapeHtml(backendText("topThreeDesc", "我把本轮最值得先打开复核的机会放在前面。"))}</span>
        </div>
        <ol>
          ${topCards.map((card) => `
            <li>
              <span>${escapeHtml(card.visible_level || "C")} 级</span>
              <p>${escapeHtml(card.title || (currentBackendLanguage() === "en" ? "Unnamed opportunity" : "未命名机会"))}</p>
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
      ? `<span>${escapeHtml(currentBackendLanguage() === "en" ? "Demo source, not actually verified" : "演示来源，未真实核验")}</span>`
      : url && url !== "#"
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(currentBackendLanguage() === "en" ? "Open source" : "打开来源")}${sourceDomain ? `：${escapeHtml(sourceDomain)}` : ""}</a>`
        : `<span>${escapeHtml(isLive
          ? (currentBackendLanguage() === "en" ? "Search source not clear yet" : "搜索来源暂未明确")
          : (currentBackendLanguage() === "en" ? "Official source not clear yet" : "官方来源暂未明确"))}</span>`;
    const opportunityKind = formatOpportunityKindForCustomer(card.opportunity_kind || card.opportunityKind || card.type || "机会");
    const evidenceStatus = formatEvidenceStatusForCustomer(card.evidence_status || card.evidenceStatus || "model_judgment");
    const actionStatus = formatActionStatusForCustomer(card.action_status || card.actionStatus || "prepare");
    const defaultAction = isDemo
      ? (currentBackendLanguage() === "en" ? "Treat this as a demo sample first; verify source and action requirements after live search is connected." : "先把这条当作演示样例；接入真实搜索后再复核来源和行动要求。")
      : (currentBackendLanguage() === "en" ? "Open the source page first, then verify entry path, deadline, eligibility, and required materials." : "先打开来源页面，确认报名入口、截止时间、参赛资格和材料要求。");
    const reason = toCustomerEvidenceText(card.match_reason || card.fitReason || card.ai_analysis || card.relevance_reason || (currentBackendLanguage() === "en" ? "Matches the current radar profile." : "与当前雷达画像匹配。"));
    return `
      <article class="watch-opportunity-card">
        <header class="card-header">
          <span class="level-badge level-${escapeHtml((card.visible_level || "C").toLowerCase())}">${escapeHtml(card.visible_level || "C")} 级</span>
          ${isDemo || !url || url === "#"
            ? `<span>${escapeHtml(card.title || "未知机会")}</span>`
            : `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(card.title || "未知机会")}</a>`}
        </header>
        <div class="watch-card-decision-row" aria-label="${escapeHtml(currentBackendLanguage() === "en" ? "This round decision" : "本轮判断")}">
          <span>${escapeHtml(currentBackendLanguage() === "en" ? "Priority" : "建议")}：${escapeHtml(getPriorityCue(card.visible_level))}</span>
          <span>${escapeHtml(currentBackendLanguage() === "en" ? "Type" : "性质")}：${escapeHtml(opportunityKind)}</span>
          <span>${escapeHtml(currentBackendLanguage() === "en" ? "Evidence" : "证据")}：${escapeHtml(evidenceStatus)}</span>
        </div>
        <dl class="watch-card-fields">
          <div>
            <dt>${escapeHtml(currentBackendLanguage() === "en" ? "Why it matters" : "为什么值得看")}</dt>
            <dd>${escapeHtml(reason)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(currentBackendLanguage() === "en" ? "This week" : "本周先做")}</dt>
            <dd>${escapeHtml(card.next_action || (Array.isArray(card.recommendedActions) ? card.recommendedActions[0] : "") || defaultAction)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(currentBackendLanguage() === "en" ? "Deadline" : "截止时间")}</dt>
            <dd>${escapeHtml(displayDeadline(card.deadline))}</dd>
          </div>
          <div>
            <dt>${escapeHtml(currentBackendLanguage() === "en" ? "Source entry" : "来源入口")}</dt>
            <dd>${source}</dd>
          </div>
        </dl>
      </article>
    `;
  }

  function getPriorityCue(level) {
    const normalized = String(level || "C").trim().toUpperCase();
    const isEnglish = currentBackendLanguage() === "en";
    if (normalized === "S") return isEnglish ? "Strong priority" : "强烈优先";
    if (normalized === "A") return isEnglish ? "Review first" : "优先复核";
    if (normalized === "B") return isEnglish ? "Good backup" : "可以备选";
    return isEnglish ? "Save and monitor" : "先收藏观察";
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
    const labels = currentBackendLanguage() === "en" ? {
      direct_opportunity: "Direct actionable opportunity",
      business_lead: "Business lead to confirm",
      channel_partner_lead: "Potential channel or partner lead",
      customer_lead: "Potential customer lead",
      watch_signal: "Watch signal",
      reference_case: "Reference case",
      rejected: "Downgraded result",
    } : {
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
    const labels = currentBackendLanguage() === "en" ? {
      verified: "Source read; key fields still need review",
      partially_verified: "Some fields have source support",
      needs_review: "Search discovery; open official page to review",
      model_judgment: "Model judgment; needs review",
      unverified: "Unverified; needs review",
      not_found: "No field evidence found",
      failed: "Source read failed",
    } : {
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
    const labels = currentBackendLanguage() === "en" ? {
      act_now: "Open the official entry first",
      prepare: "Prepare materials and review entry path",
      monitor: "Save and monitor",
      drop: "No action this round",
    } : {
      act_now: "优先打开官方入口",
      prepare: "准备材料并复核报名入口",
      monitor: "先收藏观察",
      drop: "暂不行动",
    };
    return labels[status] || status.replace(/_/g, " ") || "先复核来源";
  }

  function toCustomerEvidenceText(value) {
    const text = String(value || "").trim();
    if (!text) return currentBackendLanguage() === "en" ? "Matches the current radar profile." : "与当前雷达画像匹配。";
    if (/Live Evidence MVP|LLM\s*仍保持\s*mock|mock\s*轻量评估/i.test(text)) {
      if (/未读取正文|仅保留搜索发现|待复核/.test(text)) {
        return currentBackendLanguage() === "en"
          ? "Search-discovered source; full page text was not read. Open the official entry first to review registration, deadline, and eligibility."
          : "搜索发现来源，尚未读取完整正文；请先打开官方入口复核报名、截止时间和参赛资格。";
      }
      if (/已有限读取|已读取网页正文/.test(text)) {
        return currentBackendLanguage() === "en"
          ? "Part of the source page was read; key fields should still be reviewed on the official page."
          : "已读取来源页面的部分正文；关键字段仍以官方页面复核为准。";
      }
      return currentBackendLanguage() === "en"
        ? "Search-discovered source; fields still need review and should not be treated as confirmed."
        : "搜索发现来源，字段仍需复核；不要直接当作已确认机会。";
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
    const isEnglish = currentBackendLanguage() === "en";
    return `
      <div class="watch-empty-state">
        <p>${outcome.message ? escapeHtml(outcome.message) : isLive
          ? escapeHtml(isEnglish ? "This live search did not find enough matching opportunities." : "本次真实搜索结果不足，没有找到足够匹配的机会。")
          : escapeHtml(isEnglish ? "This run did not find enough matching opportunities." : "这次没有找到足够匹配的机会。")}${escapeHtml(isEnglish ? " You can adjust it this way:" : "你可以这样调整：")}</p>
        <ul>
          <li>${escapeHtml(isEnglish ? "Widen the region" : "放宽地区")}</li>
          <li>${escapeHtml(isEnglish ? "Reduce exclusion rules" : "减少排除条件")}</li>
          <li>${escapeHtml(isEnglish ? "Add specific signal sources" : "增加指定信号源")}</li>
          <li>${escapeHtml(isEnglish ? "Save as a long-term radar for continued monitoring" : "保存为长期雷达继续监控")}</li>
        </ul>
        <div class="watch-action-row">
          <button id="btn-retry-watch-search" class="btn-secondary">${escapeHtml(backendText("retrySearch", "重试搜索"))}</button>
          ${isLive ? `<button id="btn-switch-demo-mode" class="btn-secondary">${escapeHtml(backendText("switchDemoMode", "切回演示数据查看流程"))}</button>` : ""}
        </div>
        ${isLive ? `<p class="placeholder">${escapeHtml(isEnglish ? "Demo data is clearly marked and does not represent real opportunities." : "演示数据会明确标记为演示 / 测试数据，不代表真实机会。")}</p>` : ""}
      </div>
    `;
  }

  function renderReportSummary(markdown, cards) {
    const lines = String(markdown || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("|") && !line.startsWith("-|-"));
    const summaryLine = lines.find((line) => !line.startsWith("- "))
      || (currentBackendLanguage() === "en"
        ? "This report has been generated. Review the opportunity cards first, then decide whether to save the radar."
        : "本轮报告已生成，建议先查看机会卡片，再决定是否保存长期雷达。");
    const topCards = cards.slice(0, 3).map((card) => card.title).filter(Boolean);
    return `
      <div class="report-summary">
        <p>${escapeHtml(summaryLine.replace(/^[-*]\s*/, ""))}</p>
        ${topCards.length > 0 ? `
          <ul>
            ${topCards.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}
          </ul>
        ` : ""}
        <p>${escapeHtml(currentBackendLanguage() === "en"
          ? "Open the cards above to review sources, field evidence, and downgrade reasons. Search discoveries are not verified facts."
          : "完整来源、字段证据和排除原因请点上方机会卡查看；搜索发现不等于已核验事实。")}</p>
      </div>
    `;
  }

  async function runWatchNow({ radarId, description, spec, profile, suggestedName, presetId, radarVersion }) {
    if (!spec) throw new Error("缺少已确认的雷达规格");
    switchToResult();
    renderLoading(description, "Serper 正在搜索机会，Qwen 随后整理证据");
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
      renderLoading(description, "Qwen 正在生成机会报告");
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
        const isEnglish = currentBackendLanguage() === "en";
        root.innerHTML = `
          <div class="watch-empty-state">
            <p>${escapeHtml(isLive
              ? (isEnglish ? "Live search failed: " : "Live 真实搜索失败：")
              : (isEnglish ? "Radar run failed: " : "盯机会失败："))}${escapeHtml(err.message)}</p>
            ${isLive ? `<button id="btn-switch-demo-mode" class="btn-secondary">${escapeHtml(backendText("switchDemoMode", "切回演示数据查看流程"))}</button><p class="placeholder">${escapeHtml(isEnglish ? "Demo data is clearly marked and will not be presented as real search results." : "演示数据会明确标记为演示 / 测试数据，不会伪装成真实搜索结果。")}</p>` : ""}
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
            currentBackendLanguage() === "en" ? "# ChancePing | Opportunity Radar Report" : "# ChancePing｜本轮机会雷达报告",
            "",
            currentBackendLanguage() === "en" ? "## Conclusion" : "## 本轮结论",
            "",
            runOutcome?.message || (currentBackendLanguage() === "en" ? `Report generation failed: ${err.message || "unknown error"}` : `报告生成失败：${err.message || "未知错误"}`),
            "",
            currentBackendLanguage() === "en" ? "## Suggested actions" : "## 建议动作",
            "",
            currentBackendLanguage() === "en" ? "- Save as a long-term radar and keep monitoring." : "- 保存为长期雷达继续监控。",
            currentBackendLanguage() === "en" ? "- Adjust the radar strategy, then retry search." : "- 调整雷达策略后重试搜索。",
            currentBackendLanguage() === "en" ? "- Add specific signal sources or loosen conditions." : "- 增加指定信号源或放宽条件。",
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
      if (window.showToast) showToast(err.message || (currentBackendLanguage() === "en" ? "Retry failed" : "重试搜索失败"), "error");
    });
  }

  function switchBackToDemoMode() {
    try {
      window.localStorage?.removeItem("chanceping_live_search");
    } catch {
      // ignore storage failures
    }
    if (window.showToast) showToast(currentBackendLanguage() === "en" ? "Switched to demo data mode" : "已切回演示数据模式", "success");
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
      btn.textContent = currentBackendLanguage() === "en" ? "Saving and starting long-term radar..." : "正在保存并启动长期雷达...";
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
              message: currentBackendLanguage() === "en"
                ? `This rerun failed: ${runErr.message || "network error"}. The radar is saved and can be retried later from My Radars.`
                : `本轮复跑失败：${runErr.message || "网络错误"}。雷达已保存，可稍后在我的雷达里重试。`,
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
          ? (currentBackendLanguage() === "en" ? "Saved as a long-term radar. This run's opportunities and report are linked to My Radars." : "已保存为长期雷达。本次机会和报告已经绑定到我的雷达。")
          : (currentBackendLanguage() === "en" ? "Saved as a long-term radar. This run had limited results or no report yet; you can rerun it from My Radars." : "已保存为长期雷达。本轮结果不足或报告尚未生成，可在我的雷达里再次盯机会。"),
      };
      renderResult(currentResult);
      if (window.showToast) showToast(currentResult.reportId
        ? (currentBackendLanguage() === "en" ? "Saved as a long-term radar with a linked report" : "已保存为长期雷达，并生成了绑定报告")
        : (currentBackendLanguage() === "en" ? "Saved as a long-term radar; you can rerun it later" : "已保存为长期雷达，可稍后再次盯机会"), "success");
    } catch (err) {
      if (window.showToast) showToast(err.message || (currentBackendLanguage() === "en" ? "Save failed" : "保存失败"), "error");
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
      if (window.showToast) showToast(currentBackendLanguage() === "en" ? "Markdown copied" : "Markdown 已复制", "success");
    } catch (err) {
      if (window.showToast) showToast(err.message || (currentBackendLanguage() === "en" ? "Copy failed" : "复制失败"), "error");
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
    persistWatchResult(currentResult);
    switchToResult();
    renderResult(currentResult);
  }

  window.addEventListener("tab-switched", (event) => {
    if (event?.detail?.tab === "watch-result") restoreLatestWatchResult();
  });
  document.addEventListener("DOMContentLoaded", () => {
    if (document.querySelector(".tab-btn.active")?.dataset?.tab === "watch-result") {
      restoreLatestWatchResult();
    }
  });

  window.runWatchNow = runWatchNow;
  window.showWatchResult = showWatchResult;
  window.persistWatchResult = persistWatchResult;
  window.restoreLatestWatchResult = restoreLatestWatchResult;
})();
