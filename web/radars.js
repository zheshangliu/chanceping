/**
 * ChancePing 我的雷达 - 列表页逻辑
 * 来源：Task V1.5-04 第 3.4 节
 *
 * 职责：
 *   - 监听 tab-switched 事件（tab=radars）触发 loadRadarList()
 *   - 调用 GET /api/radars 获取雷达列表
 *   - 渲染雷达卡片（名称 + 类型徽章 + 内置角标 + 状态圆点 + 画像摘要 + 上次运行）
 *   - "创建雷达"按钮打开 modal（输入名称 + 选类型 + 填关键词）
 *   - 提交创建调用 POST /api/radars
 *   - 点击"详情"按钮切换到详情视图（由 radar-detail.js 接管）
 *
 * 纯 JS，无框架，无构建工具。复用全局 switchTab / showToast。
 */

(function () {
  "use strict";

  // ============================================================
  // 常量
  // ============================================================

  // 雷达类型 → 中文标签
  const RADAR_KIND_LABELS = {
    ai_competition: "AI 赛事",
    opc_policy: "OPC 政策",
    cultural_heritage: "文创非遗",
    custom: "自定义",
  };

  // 雷达状态 → 中文标签
  const RADAR_STATUS_LABELS = {
    draft: "草稿",
    active: "运行中",
    paused: "已暂停",
    archived: "已归档",
  };

  const PUBLIC_AI_EVENTS_RADAR_ID = "public_ai_events";

  // ============================================================
  // 工具函数
  // ============================================================

  /** HTML 转义，防止注入 */
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** 格式化 ISO 时间为 MM-DD HH:mm */
  function formatTime(iso) {
    if (!iso) return "从未运行";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "从未运行";
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${mm}-${dd} ${hh}:${mi}`;
    } catch {
      return "从未运行";
    }
  }

  function list(values) {
    return Array.from(new Set((Array.isArray(values) ? values : typeof values === "string" ? [values] : [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)));
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value) && value.length > 0) return value.map(String).join("、");
    }
    return "";
  }

  function kindToRadarType(kind) {
    if (kind === "opc_policy" || kind === "cultural_heritage" || kind === "custom") return kind;
    return "ai_competition";
  }

  function radarSearchText(radar) {
    const spec = radar?.spec || {};
    const chunks = [
      radar?.id,
      radar?.name,
      radar?.kind,
      spec.oneSentencePositioning,
      spec.profile_summary?.identity,
      spec.profile_summary?.target,
      spec.client_profile?.business_type,
      spec.client_profile?.client_type,
      spec.opportunity_scope?.primary_opportunity_types,
      spec.core_goals?.primary_goal,
    ];
    return chunks
      .flatMap((item) => Array.isArray(item) ? item : [item])
      .filter(Boolean)
      .map(String)
      .join(" ");
  }

  function isAiEventsHeroRadar(radar) {
    const text = radarSearchText(radar);
    const hasContestIntent = /AI\s*赛事|AI\s*比赛|比赛|赛事|Hackathon|黑客松|马拉松|开发者挑战|报名|参赛|提交作品/i.test(text);
    const hasAiOrHeroContext = /AI|OPC|个人开发者|云资源|开发者|Qwen|Devpost|DoraHacks|Lablab|Kaggle/i.test(text);
    return hasContestIntent && hasAiOrHeroContext;
  }

  function getOpportunityRadarIdForView(radar) {
    return isAiEventsHeroRadar(radar) ? PUBLIC_AI_EVENTS_RADAR_ID : radar?.id;
  }

  function getOpportunityPageSizeForView(radar) {
    return isAiEventsHeroRadar(radar) ? 1000 : 50;
  }

  function isCurrentPublicAiEventCard(card) {
    const lifecycle = String(card?.lifecycleStatus || card?.lifecycle_status || "").toLowerCase();
    const title = String(card?.title || "");
    if (lifecycle === "historical" || lifecycle === "expired") return false;
    if (/已截止|已结束|报名结束|closed|ended|past event|archive/i.test(title)) return false;
    return true;
  }

  function filterPublicAiEventCardsForView(cards, publicAiEventsBridge) {
    if (!publicAiEventsBridge) return cards;
    return cards.filter(isCurrentPublicAiEventCard);
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "请求失败");
    return json;
  }

  async function ensurePublicAiEventsSynced() {
    await postJson("/api/public/ai-events/sync", {});
  }

  async function getJson(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "请求失败");
    return json;
  }

  function getSearchModeRequest() {
    const mode = typeof window.getChancePingSearchMode === "function" ? window.getChancePingSearchMode() : undefined;
    return mode === "live" ? { search_mode: "live" } : {};
  }

  function buildProfileSummaryText(radar) {
    const spec = radar.spec || {};
    const summary = spec.profile_summary || {};
    const cp = spec.client_profile || {};
    const goals = spec.core_goals || {};
    const scope = spec.opportunity_scope || {};
    const region = spec.region_scope || {};
    const identity = firstNonEmpty(summary.identity, cp.business_type, cp.client_type, cp.industry);
    const target = firstNonEmpty(summary.target, scope.primary_opportunity_types, goals.primary_goal);
    const priorities = list(summary.priorities || scope.must_have_conditions || goals.priority_order).slice(0, 2);
    const regionsAndTime = firstNonEmpty(summary.regionsAndTime, region.primary_regions, cp.regions, goals.success_definition);
    const parts = [];
    if (identity) parts.push(`你是 ${identity}`);
    if (target) parts.push(`想盯 ${target}`);
    if (priorities.length > 0) parts.push(`优先看 ${priorities.join("、")}`);
    if (regionsAndTime) parts.push(regionsAndTime);
    return parts.length > 0 ? parts.join("；") : "按已确认画像持续寻找匹配机会。";
  }

  function getRadarVersionLabel(radar) {
    const version = radar?.spec?.radar_version?.version
      || radar?.spec?.radarVersion?.version
      || radar?.spec?.version
      || radar?.currentVersion
      || "V1.0";
    return String(version);
  }

  function getCustomerRadarStatusLabel(radar) {
    if (radar?.status === "archived") return "已删除";
    if (radar?.status === "paused") return "已暂停";
    if (radar?.lastRunAt) return "上次已完成";
    if (radar?.status === "draft") return "待确认";
    return "已保存";
  }

  function getRadarNewOpportunityCount(radar) {
    const candidates = [
      radar?.lastRunOpportunityCount,
      radar?.latestOpportunityCount,
      radar?.opportunityCount,
      radar?.stats?.acceptedCount,
      radar?.stats?.opportunityCount,
    ];
    for (const value of candidates) {
      if (Number.isFinite(Number(value))) return `${Number(value)} 条`;
    }
    return radar?.lastRunAt ? "待复核" : "待首次运行";
  }

  function getRadarHealthCopy(radar) {
    if (radar?.status === "archived") return "已归档，不再自动运行。";
    if (radar?.status === "paused") return "已暂停，需要恢复后再继续盯。";
    if (!radar?.lastRunAt) return "还没跑过，建议先点“再次盯机会”生成第一轮结果。";
    return "可以继续复跑，也可以进入聊天窗口调整雷达画像。";
  }

  // ============================================================
  // 加载雷达列表
  // ============================================================

  /**
   * 加载雷达列表（GET /api/radars）。
   * 成功后调用 renderRadarCards() 渲染，并加载配额信息。
   */
  async function loadRadarList() {
    const grid = document.getElementById("radar-cards-grid");
    if (!grid) return;
    grid.innerHTML = '<p class="placeholder">加载中...</p>';
    try {
      const res = await fetch("/api/radars?scope=mine");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        renderRadarCards(json.data.filter((radar) => radar.isBuiltin !== true));
        loadQuotaInfo();
      } else {
        grid.innerHTML = '<p class="placeholder">加载失败</p>';
        if (window.showToast) showToast("雷达列表加载失败", "error");
      }
    } catch (err) {
      grid.innerHTML = '<p class="placeholder">加载失败：网络错误</p>';
      if (window.showToast) showToast("雷达列表加载失败：网络错误", "error");
    }
  }

  /**
   * 加载配额信息（GET /api/radars/quota，V1.5-07 新增）。
   * 渲染配额条 + 控制"创建雷达"按钮禁用状态。
   */
  async function loadQuotaInfo() {
    try {
      const res = await fetch("/api/radars/quota");
      const json = await res.json();
      if (!json.success || !json.data) return;
      const { current, quota, plan, allowed } = json.data;
      const bar = document.getElementById("radar-quota-bar");
      if (bar) {
        const planLabel = { free: "免费版", basic: "基础版", pro: "专业版", enterprise: "企业版" }[plan] || plan;
        bar.textContent = `自定义雷达 ${current}/${quota}（${planLabel}）`;
        bar.className = "radar-quota-bar" + (allowed ? "" : " quota-full");
      }
      const createBtn = document.getElementById("btn-create-radar");
      if (createBtn) {
        createBtn.disabled = !allowed;
        createBtn.title = allowed ? "" : `已达到 ${quota} 个上限，请归档旧雷达或升级套餐`;
      }
    } catch {
      // 配额加载失败不阻断列表渲染
    }
  }

  /**
   * 渲染雷达卡片列表。
   * @param {Array} radars - Radar[]
   */
  function renderRadarCards(radars) {
    const grid = document.getElementById("radar-cards-grid");
    if (!grid) return;
    if (!radars || radars.length === 0) {
      grid.innerHTML = `
        <div class="radar-empty-state">
          <h4>还没有保存长期雷达</h4>
          <p>先告诉 AI 你想盯什么，看到有用的结果后再保存到这里。</p>
          <button class="btn-primary" id="btn-empty-create-radar">回首页建立雷达</button>
        </div>
      `;
      grid.querySelector("#btn-empty-create-radar")?.addEventListener("click", goToHomeForNewRadar);
      return;
    }
    grid.innerHTML = "";
    radars.forEach((radar) => {
      grid.appendChild(buildRadarCard(radar));
    });
  }

  /**
   * 构造单个雷达卡片 DOM 元素。
   * @param {Object} radar - Radar
   * @returns {HTMLElement}
   */
  function buildRadarCard(radar) {
    const card = document.createElement("div");
    card.className = "radar-card radar-command-card";
    card.dataset.radarId = radar.id || "";
    card.dataset.kind = radar.kind || "custom";
    card.dataset.status = radar.status || "draft";

    const kindLabel = RADAR_KIND_LABELS[radar.kind] || "自定义";
    const statusLabel = RADAR_STATUS_LABELS[radar.status] || radar.status;
    const customerStatusLabel = getCustomerRadarStatusLabel(radar);
    const builtinTag = radar.isBuiltin
      ? '<span class="builtin-tag">内置</span>'
      : "";
    const lastRun = formatTime(radar.lastRunAt);
    const profileSummary = buildProfileSummaryText(radar);
    const versionLabel = getRadarVersionLabel(radar);
    const newCount = getRadarNewOpportunityCount(radar);
    const canRerun = radar.status !== "archived";

    card.innerHTML = `
      ${builtinTag}
      <div class="radar-command-header">
        <div>
          <span class="radar-kind-badge kind-${escapeHtml(radar.kind || "custom")}">${escapeHtml(kindLabel)}</span>
          <h4 class="radar-name">${escapeHtml(radar.name || "未命名雷达")}</h4>
        </div>
        <span class="radar-command-state">
          <span class="radar-status-dot status-${escapeHtml(radar.status || "draft")}" title="${escapeHtml(statusLabel)}"></span>
          ${escapeHtml(customerStatusLabel)}
        </span>
      </div>
      <div class="radar-command-metrics" aria-label="雷达状态摘要">
        <div>
          <span>版本</span>
          <strong>${escapeHtml(versionLabel)}</strong>
        </div>
        <div>
          <span>状态</span>
          <strong>${escapeHtml(customerStatusLabel)}</strong>
        </div>
        <div>
          <span>上次运行</span>
          <strong>${escapeHtml(radar.lastRunAt ? lastRun : "还没跑过")}</strong>
        </div>
        <div>
          <span>本次新增</span>
          <strong>${escapeHtml(newCount)}</strong>
        </div>
      </div>
      <div class="radar-card-profile">
        <span class="radar-card-profile-label">情报流摘要</span>
        <p>${escapeHtml(profileSummary)}</p>
      </div>
      <p class="radar-card-next-step">${escapeHtml(getRadarHealthCopy(radar))}</p>
      <div class="radar-card-actions">
        <button class="btn-edit-radar" data-radar-id="${escapeAttr(radar.id)}">编辑雷达</button>
        <button class="btn-rerun-radar" data-radar-id="${escapeAttr(radar.id)}" ${canRerun ? "" : "disabled"}>再次盯机会</button>
        <button class="btn-view-radar-detail btn-detail" data-radar-id="${escapeAttr(radar.id)}">查看机会和报告</button>
        <button class="btn-delete-radar" data-radar-id="${escapeAttr(radar.id)}">删除雷达</button>
      </div>
      <div class="radar-rerun-status" aria-live="polite"></div>
    `;

    const editBtn = card.querySelector(".btn-edit-radar");
    if (editBtn) {
      editBtn.addEventListener("click", () => editRadarFromCard(radar));
    }
    const rerunBtn = card.querySelector(".btn-rerun-radar");
    if (rerunBtn) {
      rerunBtn.addEventListener("click", () => rerunRadarFromCard(radar, rerunBtn));
    }

    // 绑定详情按钮
    const detailBtn = card.querySelector(".btn-detail");
    if (detailBtn) {
      detailBtn.addEventListener("click", () => {
        viewRadarOpportunityResult(radar);
      });
    }
    const deleteBtn = card.querySelector(".btn-delete-radar");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => deleteRadarFromCard(radar.id, radar.name, deleteBtn));
    }
    return card;
  }

  function editRadarFromCard(radar) {
    if (window.openHeroRadarEditor) {
      window.openHeroRadarEditor(radar);
      return;
    }
    if (window.switchTab) window.switchTab("home");
    document.getElementById("home-input")?.focus();
  }

  async function deleteRadarFromCard(radarId, radarName, btn) {
    if (!radarId || !confirm(`确认删除“${radarName || "这个雷达"}”？删除后会从列表移除，但历史运行和报告仍会归档保留。`)) return;
    const previousText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "正在删除...";
    try {
      const res = await fetch(`/api/radars/${encodeURIComponent(radarId)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "删除失败");
      if (window.showToast) showToast("雷达已删除，免费名额已释放", "success");
      await loadRadarList();
    } catch (err) {
      if (window.showToast) showToast(`删除失败：${err instanceof Error ? err.message : "网络错误"}`, "error");
      btn.disabled = false;
      btn.textContent = previousText;
    }
  }

  function goToHomeForNewRadar() {
    if (window.switchTab) window.switchTab("home");
    document.getElementById("home-input")?.focus();
  }

  async function viewRadarOpportunityResult(radar) {
    if (!radar?.id) return;
    if (typeof window.showWatchResult !== "function") {
      goToDetail(radar.id);
      return;
    }
    try {
      const opportunityRadarId = getOpportunityRadarIdForView(radar);
      const publicAiEventsBridge = opportunityRadarId === PUBLIC_AI_EVENTS_RADAR_ID && opportunityRadarId !== radar.id;
      const opportunityPageSize = getOpportunityPageSizeForView(radar);
      if (publicAiEventsBridge) {
        await ensurePublicAiEventsSynced();
      }
      const [opportunities, runs, reports] = await Promise.all([
        getJson(`/api/opportunities?radar_id=${encodeURIComponent(opportunityRadarId)}&page_size=${opportunityPageSize}&sort_by=deadline&sort_order=asc`),
        getJson(`/api/radars/${encodeURIComponent(radar.id)}/runs?limit=1`),
        getJson(`/api/reports?radar_id=${encodeURIComponent(radar.id)}`),
      ]);
      const entries = opportunities.data?.entries || opportunities.data || [];
      const rawCards = (Array.isArray(entries) ? entries : [])
        .map((entry) => entry.card || entry)
        .filter(Boolean);
      const cards = filterPublicAiEventCardsForView(rawCards, publicAiEventsBridge);
      const latestRun = Array.isArray(runs.data) ? runs.data[0] : null;
      const latestReport = Array.isArray(reports.data) ? reports.data[0] : null;
      window.showWatchResult({
        radarId: radar.id,
        sourceRadarId: radar.id,
        opportunityRadarId,
        publicAiEventsBridge,
        runId: latestRun?.id,
        reportId: latestReport?.id || latestRun?.reportId,
        suggestedName: publicAiEventsBridge ? "AI 赛事雷达" : (radar.name || "我的机会雷达"),
        description: publicAiEventsBridge
          ? buildPublicAiEventsResultDescription(radar, cards)
          : (buildProfileSummaryText(radar) || "这是你保存的长期雷达，本页展示已入库机会和最新报告状态。"),
        opportunityCards: cards,
        markdown: buildRadarResultMarkdown(radar, cards, latestReport, latestRun, { publicAiEventsBridge, opportunityRadarId }),
        runOutcome: latestRun?.runOutcome || { status: cards.length > 0 ? "succeeded" : "no_results" },
        savedMessage: publicAiEventsBridge
          ? `这里展示 AI Events 公共赛事库中当前有效的 ${cards.length} 条机会；编辑和再次盯机会仍会回到你的长期雷达。`
          : "这是我的雷达中的已保存结果；需要继续优化时，可以调整雷达画像。",
      });
    } catch (err) {
      if (window.showToast) showToast(`加载机会和报告失败：${err instanceof Error ? err.message : "网络错误"}`, "error");
      goToDetail(radar.id);
    }
  }

  function buildPublicAiEventsResultDescription(radar, cards) {
    const currentCount = cards.filter((card) => {
      const lifecycle = String(card.lifecycleStatus || card.lifecycle_status || "").toLowerCase();
      return lifecycle !== "historical" && lifecycle !== "expired";
    }).length;
    return `这是 ${radar.name || "AI 赛事雷达"} 绑定的 AI Events 公共赛事库。本页展示后台已入库的当前有效 AI 赛事机会 ${currentCount || cards.length} 条；公共页 /aievents 也读取同一批数据。`;
  }

  function buildRadarResultMarkdown(radar, cards, latestReport, latestRun, options = {}) {
    const publicAiEventsBridge = options.publicAiEventsBridge === true;
    const lines = [
      `# ${publicAiEventsBridge ? "AI 赛事雷达" : (radar.name || "我的机会雷达")}｜机会和报告`,
      "",
      `- 雷达版本：${getRadarVersionLabel(radar)}`,
      publicAiEventsBridge ? `- 机会来源：AI Events 公共赛事库（${options.opportunityRadarId || PUBLIC_AI_EVENTS_RADAR_ID}）` : "",
      `- 已入库机会：${cards.length} 条`,
      latestRun?.id ? `- 最近运行：${latestRun.id}` : "- 最近运行：暂无",
      latestReport?.id ? `- 最新报告：${latestReport.id}` : "- 最新报告：暂无",
      "",
      "## 本次建议先看",
    ].filter((line) => line !== "");
    const topCards = cards.slice(0, 5);
    if (topCards.length === 0) {
      lines.push("- 暂无已入库机会，可以点击“再次盯机会”生成新一轮结果。");
    } else {
      for (const card of topCards) {
        lines.push(`- ${card.title || "未命名机会"}：${card.next_action || card.match_reason || "先打开来源确认行动入口。"}`);
      }
    }
    if (latestReport?.filename) {
      lines.push("", `完整报告可在雷达详情页下载：${latestReport.filename}`);
    }
    lines.push("", "需要继续调准？点击“调整雷达画像”，我会回到聊天窗口先升级雷达，再让你确认。");
    return lines.join("\n");
  }

  function setRerunStatus(btn, html) {
    const card = btn.closest(".radar-card");
    const status = card?.querySelector(".radar-rerun-status");
    if (status) status.innerHTML = html;
    return status;
  }

  async function generateReportForRun(radar, runData) {
    const runId = runData?.run?.id;
    const cards = runData?.opportunityCards || [];
    return postJson("/api/reports/generate", {
      radar_id: radar.id,
      run_id: runId,
      radar_type: kindToRadarType(radar.kind),
      spec: radar.spec,
      opportunities: cards,
      sourceHintChecks: runData?.sourceCoverage || runData?.sourceHintChecks || [],
      candidateAccounting: runData?.candidateAccounting,
      executionLog: runData?.executionLog,
      rawCandidates: runData?.rawCandidates || [],
    });
  }

  function bindViewLatestReport(btn, radarId) {
    const status = btn.closest(".radar-card")?.querySelector(".radar-rerun-status");
    const viewBtn = status?.querySelector(".btn-view-latest-report");
    if (viewBtn) {
      viewBtn.addEventListener("click", () => goToDetail(radarId));
    }
  }

  function bindRetryReport(btn, radar, runData) {
    const status = btn.closest(".radar-card")?.querySelector(".radar-rerun-status");
    const retryBtn = status?.querySelector(".btn-retry-rerun-report");
    if (!retryBtn) return;
    retryBtn.addEventListener("click", async () => {
      retryBtn.disabled = true;
      retryBtn.textContent = "正在生成报告";
      try {
        const report = await generateReportForRun(radar, runData);
        const reportId = report.data?.reportId || "";
        setRerunStatus(btn, `
          <span class="rerun-status-success">已生成新报告</span>
          <button class="btn-view-latest-report" data-report-id="${escapeAttr(reportId)}">查看本次报告</button>
        `);
        bindViewLatestReport(btn, radar.id);
        if (window.showToast) showToast("已生成新报告", "success");
      } catch (err) {
        retryBtn.disabled = false;
        retryBtn.textContent = "重试生成报告";
        if (window.showToast) showToast(`报告仍生成失败：${err instanceof Error ? err.message : "网络错误"}`, "error");
      }
    });
  }

  async function rerunRadarFromCard(radar, btn) {
    const radarId = radar?.id;
    if (!radarId) return;
    const previousText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "正在重新盯机会";
    setRerunStatus(btn, '<span class="rerun-status-running">正在重新盯机会</span>');
    try {
      const runJson = await postJson(`/api/radars/${encodeURIComponent(radarId)}/run`, getSearchModeRequest());
      const outcome = runJson.data?.runOutcome;
      if (outcome?.status && outcome.status !== "succeeded") {
        setRerunStatus(btn, `
          <span class="rerun-status-warning">${escapeHtml(outcome.message || "本轮结果不足，可重试搜索。")}</span>
          <button class="btn-retry-radar-run">重试搜索</button>
        `);
        const retryBtn = btn.closest(".radar-card")?.querySelector(".btn-retry-radar-run");
        retryBtn?.addEventListener("click", () => rerunRadarFromCard(radar, btn));
        if (window.showToast) showToast(outcome.message || "本轮结果不足，可稍后重试", "warning");
        return;
      }
      const count = (runJson.data?.opportunityCards || []).length;
      btn.textContent = "正在生成报告";
      setRerunStatus(btn, '<span class="rerun-status-running">正在生成报告</span>');

      try {
        const report = await generateReportForRun(radar, runJson.data);
        const reportId = report.data?.reportId || "";
        setRerunStatus(btn, `
          <span class="rerun-status-success">已生成新报告</span>
          <button class="btn-view-latest-report" data-report-id="${escapeAttr(reportId)}">查看本次报告</button>
        `);
        bindViewLatestReport(btn, radarId);
        if (window.showToast) showToast(`已生成新报告，本次发现 ${count} 个机会`, "success");
      } catch (reportErr) {
        setRerunStatus(btn, `
          <span class="rerun-status-warning">机会已更新，报告生成失败，可重试生成报告</span>
          <button class="btn-retry-rerun-report">重试生成报告</button>
        `);
        bindRetryReport(btn, radar, runJson.data);
        if (window.showToast) showToast(`机会已更新，报告生成失败：${reportErr instanceof Error ? reportErr.message : "网络错误"}`, "warning");
      }
    } catch {
      if (window.showToast) showToast("再次盯机会失败：网络错误", "error");
      setRerunStatus(btn, '<span class="rerun-status-error">再次盯机会失败，请稍后重试</span>');
    } finally {
      btn.disabled = false;
      btn.textContent = previousText;
    }
  }

  /** HTML 属性转义 */
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // ============================================================
  // 创建雷达 Modal
  // ============================================================

  /**
   * 打开创建雷达对话框。
   * 动态构造 modal DOM 并 append 到 body。
   */
  function openCreateModal() {
    // 若已存在，先移除
    const existing = document.getElementById("create-radar-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.className = "create-modal";
    modal.id = "create-radar-modal";
    modal.innerHTML = `
      <div class="create-modal-backdrop"></div>
      <div class="create-modal-dialog">
        <div class="create-modal-header">
          <h3>创建雷达</h3>
          <button class="create-modal-close" title="关闭">×</button>
        </div>
        <div class="create-modal-body">
          <label class="create-field">
            <span class="create-label">雷达名称 <span class="required">*</span></span>
            <input type="text" id="create-radar-name" placeholder="例如：我的 RPA 雷达" maxlength="20" required />
          </label>
          <label class="create-field">
            <span class="create-label">雷达类型</span>
            <select id="create-radar-kind">
              <option value="ai_competition">AI 赛事</option>
              <option value="opc_policy">OPC 政策</option>
              <option value="cultural_heritage">文创非遗</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          <label class="create-field">
            <span class="create-label">关键词（逗号分隔）</span>
            <input type="text" id="create-radar-keywords" placeholder="例如：RPA, 自动化, 比赛" />
          </label>
          <label class="create-field">
            <span class="create-label">地域（可选）</span>
            <input type="text" id="create-radar-region" placeholder="例如：全国" />
          </label>
        </div>
        <div class="create-modal-footer">
          <button class="btn-cancel" id="create-radar-cancel">取消</button>
          <button class="btn-primary" id="create-radar-submit">创建</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 关闭事件
    const close = () => modal.remove();
    modal.querySelector(".create-modal-close").addEventListener("click", close);
    modal.querySelector(".create-modal-backdrop").addEventListener("click", close);
    modal.querySelector("#create-radar-cancel").addEventListener("click", close);

    // 提交事件
    modal.querySelector("#create-radar-submit").addEventListener("click", () => {
      submitCreate(modal);
    });
  }

  /**
   * 提交创建雷达（POST /api/radars）。
   * @param {HTMLElement} modal - modal DOM
   */
  async function submitCreate(modal) {
    const nameEl = modal.querySelector("#create-radar-name");
    const kindEl = modal.querySelector("#create-radar-kind");
    const keywordsEl = modal.querySelector("#create-radar-keywords");
    const regionEl = modal.querySelector("#create-radar-region");

    const name = (nameEl.value || "").trim();
    if (!name) {
      if (window.showToast) showToast("请输入雷达名称", "warning");
      nameEl.focus();
      return;
    }
    const kind = kindEl.value || "custom";
    const keywords = (keywordsEl.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const region = (regionEl.value || "").trim();

    // 构造 spec（仅填充关键字段，后端会补全默认 spec）
    const spec = {
      keyword_strategy: {
        core_keywords_zh: keywords,
        core_keywords_en: [],
      },
      region_scope: {
        primary_regions: region ? [region] : [],
        secondary_regions: [],
        excluded_regions: [],
        global_allowed: false,
        overseas_allowed: false,
      },
    };

    const submitBtn = modal.querySelector("#create-radar-submit");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "创建中...";
    }

    try {
      const res = await fetch("/api/radars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind, spec }),
      });
      const json = await res.json();
      if (json.success) {
        modal.remove();
        if (window.showToast) showToast("雷达创建成功", "success");
        loadRadarList();
      } else {
        if (window.showToast) {
          const code = json.error?.code || "";
          const msg = json.error?.message || "创建失败";
          // V1.5-07：配额超限特殊提示
          if (code === "RADAR_QUOTA_EXCEEDED") {
            showToast("已达到免费用户上限，请归档旧雷达或升级套餐", "warning");
          } else {
            showToast(`创建失败：${msg}`, "error");
          }
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "创建";
        }
      }
    } catch (err) {
      if (window.showToast) showToast("创建失败：网络错误", "error");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "创建";
      }
    }
  }

  // ============================================================
  // 跳转详情视图
  // ============================================================

  /**
   * 切换到雷达详情视图。
   * 隐藏列表视图，显示详情视图，并调用 radar-detail.js 的 loadRadarDetail()。
   * @param {string} radarId - 雷达 ID
   */
  function goToDetail(radarId) {
    if (!radarId) return;
    const listView = document.getElementById("radars-list-view");
    const detailView = document.getElementById("radar-detail-view");
    if (listView) listView.style.display = "none";
    if (detailView) detailView.style.display = "block";
    // 调用 radar-detail.js 暴露的全局函数
    if (typeof window.loadRadarDetail === "function") {
      window.loadRadarDetail(radarId);
    }
  }

  /**
   * 返回列表视图（供 radar-detail.js 调用）。
   */
  function backToList() {
    const listView = document.getElementById("radars-list-view");
    const detailView = document.getElementById("radar-detail-view");
    if (detailView) {
      detailView.style.display = "none";
      detailView.innerHTML = "";
    }
    if (listView) listView.style.display = "block";
    // 刷新列表以反映最新状态（如刚运行/归档）
    loadRadarList();
  }

  // ============================================================
  // AI 生成雷达（V1.5-05 新增）
  // ============================================================

  /**
   * 打开 AI 生成对话框。
   * 用户输入自然语言描述，可选上传文件，点击生成后调 POST /api/radars/generate。
   */
  function openGenerateModal() {
    const existing = document.getElementById("ai-generate-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.className = "create-modal";
    modal.id = "ai-generate-modal";
    modal.innerHTML = `
      <div class="create-modal-backdrop"></div>
      <div class="create-modal-dialog create-modal-dialog-wide">
        <div class="create-modal-header">
          <h3>✨ AI 生成雷达</h3>
          <button class="create-modal-close" title="关闭">×</button>
        </div>
        <div class="create-modal-body">
          <label class="create-field">
            <span class="create-label">描述你想盯的机会 <span class="required">*</span></span>
            <textarea id="ai-generate-description" rows="3" placeholder="例如：我要盯 RPA 相关的比赛" style="resize:vertical;"></textarea>
          </label>
          <label class="create-field">
            <span class="create-label">上传文件文本（可选）</span>
            <input type="text" id="ai-generate-uploaded" placeholder="粘贴文件解析后的文本" />
          </label>
        </div>
        <div class="create-modal-footer">
          <button class="btn-cancel" id="ai-generate-cancel">取消</button>
          <button class="btn-primary" id="ai-generate-submit">生成</button>
        </div>
        <div id="ai-generate-result" style="display:none; padding: 0 20px 20px;"></div>
        <div id="ai-gen-error" style="display:none; padding: 0 20px 20px;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector(".create-modal-close").addEventListener("click", close);
    modal.querySelector(".create-modal-backdrop").addEventListener("click", close);
    modal.querySelector("#ai-generate-cancel").addEventListener("click", close);

    modal.querySelector("#ai-generate-submit").addEventListener("click", () => {
      submitGenerate(modal);
    });
  }

  /**
   * 提交 AI 生成请求（POST /api/radars/generate）。
   * @param {HTMLElement} modal - modal DOM
   */
  async function submitGenerate(modal) {
    const descEl = modal.querySelector("#ai-generate-description");
    const uploadedEl = modal.querySelector("#ai-generate-uploaded");
    const description = (descEl.value || "").trim();
    if (!description) {
      if (window.showToast) showToast("请输入机会描述", "warning");
      descEl.focus();
      return;
    }
    const uploadedText = (uploadedEl.value || "").trim() || undefined;

    const submitBtn = modal.querySelector("#ai-generate-submit");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "生成中...";
    }
    const resultDiv = modal.querySelector("#ai-generate-result");
    if (resultDiv) {
      resultDiv.style.display = "block";
      resultDiv.innerHTML = '<p class="placeholder">AI 正在生成雷达规格...</p>';
    }
    const errorDiv = modal.querySelector("#ai-gen-error");
    if (errorDiv) {
      errorDiv.style.display = "none";
      errorDiv.innerHTML = "";
    }

    try {
      const res = await fetch("/api/radars/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, uploaded_text: uploadedText }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        renderGenerateResult(modal, json.data, description);
      } else {
        // V1.6-09：展示失败原因 + 降级选项
        const msg = json.error?.message || "生成失败";
        showGenerateError(modal, msg, description);
        if (window.showToast) showToast(`生成失败：${msg}`, "error");
      }
    } catch (err) {
      // V1.6-09：网络错误等，同样展示降级选项
      const msg = (err && err.message) || "网络错误，请稍后重试";
      showGenerateError(modal, msg, description);
      if (window.showToast) showToast(`生成失败：${msg}`, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "生成";
      }
    }
  }

  /**
   * V1.6-09：展示 AI 生成失败原因 + 降级选项（重试/手动创建/转入一次一问）。
   * @param {HTMLElement} modal - modal DOM
   * @param {string} message - 失败原因
   * @param {string} description - 用户输入的需求描述（用于转入一次一问时预填）
   */
  function showGenerateError(modal, message, description) {
    const errorDiv = modal.querySelector("#ai-gen-error");
    if (!errorDiv) return;
    const resultDiv = modal.querySelector("#ai-generate-result");
    if (resultDiv) resultDiv.style.display = "none";
    errorDiv.innerHTML = `
      <div class="generate-error">
        <p class="error-message">AI 生成失败：${escapeHtml(message)}</p>
        <div class="error-actions">
          <button class="btn-primary" id="ai-gen-retry">重试</button>
          <button class="btn-cancel" id="ai-gen-manual">手动创建</button>
          <button class="btn-cancel" id="ai-gen-oneshot">转入一次一问</button>
        </div>
      </div>
    `;
    errorDiv.style.display = "block";
    errorDiv.querySelector("#ai-gen-retry").addEventListener("click", () => {
      errorDiv.style.display = "none";
      errorDiv.innerHTML = "";
      submitGenerate(modal);
    });
    errorDiv.querySelector("#ai-gen-manual").addEventListener("click", () => {
      modal.remove();
      openCreateModal();
    });
    errorDiv.querySelector("#ai-gen-oneshot").addEventListener("click", () => {
      modal.remove();
      if (window.switchTab) switchTab("chat");
      const chatInput = document.getElementById("chat-input");
      if (chatInput) chatInput.value = description;
    });
  }

  /**
   * 渲染 AI 生成结果（建议名称 + Spec 预览 + 完整率 + 确认创建按钮）。
   * @param {HTMLElement} modal - modal DOM
   * @param {Object} data - RadarGenerateResponseData
   * @param {string} originalDescription - 原始描述
   */
  function renderGenerateResult(modal, data, originalDescription) {
    const resultDiv = modal.querySelector("#ai-generate-result");
    if (!resultDiv) return;

    const spec = data.spec || {};
    const keywords = (spec.keyword_strategy && spec.keyword_strategy.core_keywords_zh) || [];
    const regions = (spec.region_scope && spec.region_scope.primary_regions) || [];
    const exclusions = (spec.filter_rules && spec.filter_rules.must_exclude) || [];
    const completeness = typeof data.completeness === "number" ? data.completeness : 0;
    const completenessColor = completeness >= 90 ? "var(--success)" : "var(--warning)";
    const suggestedName = data.suggestedName || "我的自定义雷达";

    resultDiv.innerHTML = `
      <div class="ai-generate-result">
        <h4>生成结果</h4>
        <label class="create-field">
          <span class="create-label">雷达名称（可编辑）</span>
          <input type="text" id="ai-result-name" value="${escapeAttr(suggestedName)}" maxlength="20" />
        </label>
        <div class="ai-spec-preview">
          <div class="info-row"><span class="info-label">关键词</span><span class="info-value">${keywords.length > 0 ? escapeHtml(keywords.join(", ")) : "—"}</span></div>
          <div class="info-row"><span class="info-label">地域</span><span class="info-value">${regions.length > 0 ? escapeHtml(regions.join(", ")) : "—"}</span></div>
          <div class="info-row"><span class="info-label">排除规则</span><span class="info-value">${exclusions.length > 0 ? escapeHtml(exclusions.join(", ")) : "—"}</span></div>
        </div>
        <div class="ai-completeness">
          <span class="info-label">字段完整率</span>
          <div class="completeness-bar">
            <div class="completeness-fill" style="width:${completeness}%; background-color:${completenessColor};"></div>
          </div>
          <span class="completeness-text" style="color:${completenessColor};">${completeness}%</span>
        </div>
        <div class="ai-confirm-actions">
          <button class="btn-primary" id="ai-confirm-create" ${completeness < 90 ? "disabled" : ""} title="${completeness < 90 ? "完整率 < 90%，不允许创建" : ""}">确认创建</button>
          <button class="btn-cancel" id="ai-regenerate">重新生成</button>
        </div>
      </div>
    `;

    // 确认创建
    const confirmBtn = resultDiv.querySelector("#ai-confirm-create");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        if (confirmBtn.disabled) return;
        const nameInput = resultDiv.querySelector("#ai-result-name");
        const name = (nameInput.value || "").trim() || suggestedName;
        confirmBtn.disabled = true;
        confirmBtn.textContent = "创建中...";

        try {
          const res = await fetch("/api/radars", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, kind: "custom", spec }),
          });
          const json = await res.json();
          if (json.success) {
            modal.remove();
            if (window.showToast) showToast("雷达创建成功", "success");
            loadRadarList();
          } else {
            const msg = json.error?.message || "创建失败";
            if (window.showToast) showToast(`创建失败：${msg}`, "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = "确认创建";
          }
        } catch (err) {
          if (window.showToast) showToast("创建失败：网络错误", "error");
          confirmBtn.disabled = false;
          confirmBtn.textContent = "确认创建";
        }
      });
    }

    // 重新生成
    const regenBtn = resultDiv.querySelector("#ai-regenerate");
    if (regenBtn) {
      regenBtn.addEventListener("click", () => {
        resultDiv.innerHTML = "";
        submitGenerate(modal);
      });
    }
  }

  // ============================================================
  // 事件绑定与初始化
  // ============================================================

  // Tab 切换监听：进入"我的雷达"Tab 时加载列表
  window.addEventListener("tab-switched", (e) => {
    if (e.detail && e.detail.tab === "radars") {
      loadRadarList();
    }
  });

  // DOMContentLoaded 后绑定按钮事件
  document.addEventListener("DOMContentLoaded", () => {
    const createBtn = document.getElementById("btn-create-radar");
    if (createBtn) createBtn.addEventListener("click", goToHomeForNewRadar);

    const refreshBtn = document.getElementById("btn-refresh-radars");
    if (refreshBtn) refreshBtn.addEventListener("click", loadRadarList);
  });

  // 暴露到全局（供 radar-detail.js 调用 backToList，以及 HTML 内联事件）
  window.loadRadarList = loadRadarList;
  window.renderRadarCards = renderRadarCards;
  window.openCreateModal = openCreateModal;
  window.submitCreate = submitCreate;
  window.goToDetail = goToDetail;
  window.backToList = backToList;
  window.openGenerateModal = openGenerateModal;
  window.submitGenerate = submitGenerate;
  window.renderGenerateResult = renderGenerateResult;
})();
