/**
 * ChancePing 我的雷达 - 详情页逻辑
 * 来源：Task V1.5-04 第 3.5 节
 *
 * 职责：
 *   - 加载雷达详情（GET /api/radars/:id）
 *   - 渲染基本信息 + Spec 摘要 + 操作按钮（运行/编辑/删除）
 *   - 手动运行（POST /api/radars/:id/run），展示返回的机会卡片
 *   - 历史报告展示
 *
 * 纯 JS，无框架，无构建工具。复用全局 showToast / backToList。
 */

(function () {
  "use strict";

  // ============================================================
  // 常量
  // ============================================================

  const RADAR_KIND_LABELS = {
    ai_competition: "AI 赛事",
    opc_policy: "OPC 政策",
    cultural_heritage: "文创非遗",
    custom: "自定义",
  };

  const RADAR_STATUS_LABELS = {
    draft: "草稿",
    active: "运行中",
    paused: "已暂停",
    archived: "已归档",
  };

  const PUBLIC_AI_EVENTS_RADAR_ID = "public_ai_events";

  // ============================================================
  // 状态
  // ============================================================

  let currentRadarId = null;
  let currentRadar = null;
  let currentRadarRuns = [];
  let currentOpportunityCards = [];

  // ============================================================
  // 工具函数
  // ============================================================

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    } catch {
      return "—";
    }
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

  function getSearchModeRequest() {
    const mode = typeof window.getChancePingSearchMode === "function" ? window.getChancePingSearchMode() : undefined;
    return mode === "live" ? { search_mode: "live" } : {};
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

  function displayDeadline(value) {
    const text = String(value || "").trim();
    if (!text || text === "9999-12-31" || text === "0000-00-00" || /^9999-12-31/.test(text)) return "见官网";
    return text;
  }

  function isCurrentPublicAiEventCard(card) {
    const lifecycle = String(card?.lifecycleStatus || card?.lifecycle_status || "").toLowerCase();
    const title = String(card?.title || "");
    if (lifecycle === "historical" || lifecycle === "expired") return false;
    if (/已截止|已结束|报名结束|closed|ended|past event|archive/i.test(title)) return false;
    return true;
  }

  function filterPublicAiEventCardsForView(entries, isPublicAiEventsBridge) {
    if (!isPublicAiEventsBridge) return entries;
    return entries.filter((entry) => isCurrentPublicAiEventCard(entry.card || entry));
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

  function renderInfoRow(label, value) {
    const normalized = Array.isArray(value) ? value.filter(Boolean).join("、") : value;
    return `<div class="info-row"><span class="info-label">${escapeHtml(label)}</span><span class="info-value">${normalized ? escapeHtml(normalized) : "—"}</span></div>`;
  }

  function renderRadarProfileSummary(radar) {
    const spec = radar.spec || {};
    const summary = spec.profile_summary || {};
    const cp = spec.client_profile || {};
    const goals = spec.core_goals || {};
    const scope = spec.opportunity_scope || {};
    const region = spec.region_scope || {};
    const filter = spec.filter_rules || {};
    const sourceStrategy = spec.source_strategy || {};
    const userSources = list([
      ...(sourceStrategy.user_supplied_sources || []).map((source) => source.source_url || source.source_name),
      ...(sourceStrategy.manual_sources || []),
      ...(sourceStrategy.official_sites || []),
      ...(sourceStrategy.platforms || []),
    ]);
    const profile = {
      identity: firstNonEmpty(summary.identity, cp.business_type, cp.client_type, cp.industry),
      target: firstNonEmpty(summary.target, scope.primary_opportunity_types, goals.primary_goal),
      priorities: list(summary.priorities || scope.must_have_conditions || goals.priority_order),
      regionsAndTime: firstNonEmpty(summary.regionsAndTime, region.primary_regions, cp.regions, goals.success_definition),
      exclusions: list(summary.exclusions || scope.excluded_opportunity_types || filter.must_exclude),
      sourceHints: list(summary.sourceHints || userSources),
      assumptions: list(summary.assumptions),
    };

    return `
      <div class="radar-detail-section radar-profile-summary">
        <h4>雷达画像摘要</h4>
        <div class="radar-detail-info">
          ${renderInfoRow("你是", profile.identity)}
          ${renderInfoRow("你想盯", profile.target)}
          ${renderInfoRow("优先看", profile.priorities)}
          ${renderInfoRow("地域 / 时间", profile.regionsAndTime)}
          ${renderInfoRow("排除", profile.exclusions)}
          ${renderInfoRow("指定信号源", profile.sourceHints)}
          ${profile.assumptions.length > 0 ? renderInfoRow("默认假设", profile.assumptions) : ""}
        </div>
      </div>
    `;
  }

  /** 从 spec 提取关键词 */
  function getKeywords(spec) {
    if (!spec) return [];
    const zh = (spec.keyword_strategy && spec.keyword_strategy.core_keywords_zh) || [];
    const en = (spec.keyword_strategy && spec.keyword_strategy.core_keywords_en) || [];
    return [...zh, ...en];
  }

  /** 从 spec 提取地域 */
  function getRegions(spec) {
    if (!spec || !spec.region_scope) return [];
    return spec.region_scope.primary_regions || [];
  }

  /** 从 spec 提取排除规则 */
  function getExclusions(spec) {
    if (!spec || !spec.filter_rules) return [];
    return spec.filter_rules.must_exclude || [];
  }

  /** 从 spec 提取评分规则摘要 */
  function getScoringSummary(spec) {
    if (!spec || !spec.scoring_rules || !spec.scoring_rules.weights) return "默认";
    const w = spec.scoring_rules.weights;
    const parts = [];
    if (w.match_score != null) parts.push(`匹配度 ${w.match_score}%`);
    if (w.business_value != null) parts.push(`价值 ${w.business_value}%`);
    if (w.timeliness != null) parts.push(`时效 ${w.timeliness}%`);
    if (w.credibility != null) parts.push(`可信 ${w.credibility}%`);
    if (w.actionability != null) parts.push(`可执行 ${w.actionability}%`);
    return parts.length > 0 ? parts.join(", ") : "默认";
  }

  // ============================================================
  // 加载雷达详情
  // ============================================================

  let loadDetailSeq = 0;

  /**
   * 加载雷达详情（GET /api/radars/:id）。
   * @param {string} radarId - 雷达 ID
   */
  async function loadRadarDetail(radarId) {
    if (!radarId) return;
    const seq = ++loadDetailSeq;
    currentRadarId = radarId;
    const container = document.getElementById("radar-detail-view");
    if (!container) return;
    container.innerHTML = '<p class="placeholder">加载中...</p>';

    try {
      const res = await fetch(`/api/radars/${encodeURIComponent(radarId)}`);
      const json = await res.json();
      if (seq !== loadDetailSeq) return; // 不是最新请求,丢弃
      if (json.success && json.data) {
        currentRadar = json.data;
        renderRadarDetail(currentRadar);
      } else {
        const msg = json.error?.message || "加载失败";
        container.innerHTML = `<p class="placeholder">加载失败：${escapeHtml(msg)}</p>`;
        if (window.showToast) showToast(`雷达详情加载失败：${msg}`, "error");
      }
    } catch (err) {
      if (seq !== loadDetailSeq) return; // 不是最新请求,丢弃
      container.innerHTML = '<p class="placeholder">加载失败：网络错误</p>';
      if (window.showToast) showToast("雷达详情加载失败：网络错误", "error");
    }
  }

  /**
   * 渲染雷达详情页。
   * @param {Object} radar - Radar
   */
  function renderRadarDetail(radar) {
    const container = document.getElementById("radar-detail-view");
    if (!container) return;

    const kindLabel = RADAR_KIND_LABELS[radar.kind] || "自定义";
    const statusLabel = RADAR_STATUS_LABELS[radar.status] || radar.status;
    const isBuiltin = !!radar.isBuiltin;
    const isDraft = radar.status === "draft";
    const isActive = radar.status === "active";
    const isArchived = radar.status === "archived";

    const keywords = getKeywords(radar.spec);
    const regions = getRegions(radar.spec);
    const exclusions = getExclusions(radar.spec);
    const scoringText = getScoringSummary(radar.spec);
    const lastRunText = radar.lastRunAt
      ? `${formatTime(radar.lastRunAt)} (${escapeHtml(radar.lastRunStatus || "—")})`
      : "从未运行";

    container.innerHTML = `
      <div class="radar-detail-container">
        <div class="radar-detail-topbar">
          <button class="btn-back" id="radar-back-btn">← 返回我的雷达</button>
          <h3 class="radar-detail-title">${escapeHtml(radar.name || "未命名雷达")}</h3>
        </div>

        <div class="radar-detail-summary">
          <span class="radar-kind-badge kind-${escapeHtml(radar.kind || "custom")}">${escapeHtml(kindLabel)}</span>
          ${isBuiltin ? '<span class="builtin-tag">内置</span>' : ""}
          <span class="radar-status-dot status-${escapeHtml(radar.status || "draft")}"></span>
          <div class="radar-detail-actions">
            <button class="btn-primary btn-run" id="radar-run-btn" ${!isActive ? "disabled" : ""} title="${!isActive ? "仅运行中状态可再次盯机会" : ""}">再次盯机会</button>
            <button class="btn-edit" id="radar-edit-btn" ${isBuiltin || isArchived ? "disabled" : ""} title="${isBuiltin ? "内置雷达不可编辑" : isArchived ? "该雷达已删除" : ""}">编辑雷达</button>
            <button class="btn-archive" id="radar-archive-btn" ${isBuiltin || isArchived ? "disabled" : ""} title="${isBuiltin ? "内置雷达不可删除" : isArchived ? "该雷达已删除" : ""}">删除雷达</button>
          </div>
          <div class="radar-rerun-status" id="radar-detail-rerun-status" aria-live="polite"></div>
        </div>

        <div class="radar-detail-section">
          <h4>基本信息</h4>
          <div class="radar-detail-info">
            <div class="info-row"><span class="info-label">名称</span><span class="info-value">${escapeHtml(radar.name || "—")}</span></div>
            <div class="info-row"><span class="info-label">类型</span><span class="info-value">${escapeHtml(kindLabel)}</span></div>
            <div class="info-row"><span class="info-label">状态</span><span class="info-value">${escapeHtml(statusLabel)}</span></div>
            <div class="info-row"><span class="info-label">创建时间</span><span class="info-value">${escapeHtml(formatTime(radar.createdAt))}</span></div>
            <div class="info-row"><span class="info-label">最后运行</span><span class="info-value">${lastRunText}</span></div>
          </div>
        </div>

        ${renderRadarProfileSummary(radar)}

        <div class="radar-detail-section">
          <h4>搜索重点</h4>
          <div class="radar-detail-info">
            <div class="info-row"><span class="info-label">关键词</span><span class="info-value">${keywords.length > 0 ? escapeHtml(keywords.join(", ")) : "—"}</span></div>
            <div class="info-row"><span class="info-label">地域</span><span class="info-value">${regions.length > 0 ? escapeHtml(regions.join(", ")) : "—"}</span></div>
            <div class="info-row"><span class="info-label">排除规则</span><span class="info-value">${exclusions.length > 0 ? escapeHtml(exclusions.join(", ")) : "—"}</span></div>
            <div class="info-row"><span class="info-label">评分规则</span><span class="info-value">${escapeHtml(scoringText)}</span></div>
          </div>
        </div>

        ${renderScheduleSection(radar)}

        <div class="radar-detail-section radar-run-result" id="radar-run-result-section" style="display:none;">
          <h4>本次运行结果</h4>
          <div id="radar-run-result-list"></div>
        </div>

        <div class="radar-detail-section radar-stored-opportunities">
          <h4>${isAiEventsHeroRadar(radar) ? "已入库机会（AI Events 公共赛事库）" : "已入库机会"}</h4>
          ${isAiEventsHeroRadar(radar) ? '<p class="placeholder">这里和公开页 /aievents 读取同一批公共赛事库机会；再次盯机会和编辑仍作用于你的长期雷达。</p>' : ""}
          <div id="radar-stored-opportunity-list">
            <p class="placeholder">加载中...</p>
          </div>
        </div>

        <div class="radar-detail-section radar-report-history">
          <div class="radar-section-heading">
            <h4>历史报告</h4>
          </div>
          <div id="radar-report-history-list">
            <p class="placeholder">加载中...</p>
          </div>
        </div>
      </div>
    `;

    bindDetailEvents(radar);
    loadRadarRuns(radar.id);
    loadRadarOpportunities(radar.id);
    loadReportHistory(radar.id);
  }

  /** 绑定详情页按钮事件 */
  function bindDetailEvents(radar) {
    const backBtn = document.getElementById("radar-back-btn");
    if (backBtn) backBtn.addEventListener("click", () => {
      if (typeof window.backToList === "function") window.backToList();
    });

    const runBtn = document.getElementById("radar-run-btn");
    if (runBtn) runBtn.addEventListener("click", () => {
      if (!runBtn.disabled) runRadar(radar.id);
    });

    const editBtn = document.getElementById("radar-edit-btn");
    if (editBtn) editBtn.addEventListener("click", () => {
      if (!editBtn.disabled && window.showToast) {
        showToast("编辑功能将在后续版本支持", "warning");
      }
    });

    const archiveBtn = document.getElementById("radar-archive-btn");
    if (archiveBtn) archiveBtn.addEventListener("click", () => {
      if (!archiveBtn.disabled) archiveRadar(radar.id);
    });

    // V1.6-05:定时设置区事件绑定
    bindScheduleEvents(radar);
  }

  // ============================================================
  // 定时设置（V1.6-05 新增）
  // ============================================================

  /**
   * 渲染定时设置区 HTML。
   * @param {Object} radar - Radar
   * @returns {string} HTML 字符串
   */
  function renderScheduleSection(radar) {
    const schedule = radar.schedule;
    const enabled = schedule?.enabled ?? false;
    const nextRun = schedule?.nextRunAt ? formatTime(schedule.nextRunAt) : "未设置";
    const frequency = schedule?.frequency ?? "daily";
    const time = schedule?.time ?? "08:00";
    const timezone = schedule?.timezone ?? "Asia/Shanghai";
    const weekdays = schedule?.weekdays ?? [];
    // 仅 active/paused 可设置定时(draft 不允许,archived 不允许)
    const canEdit = radar.status === "active" || radar.status === "paused";

    const weekdayButtons = [1, 2, 3, 4, 5, 6, 7]
      .map(
        (day) =>
          `<button type="button" class="weekday-btn ${weekdays.includes(day) ? "selected" : ""}" data-day="${day}">${["", "一", "二", "三", "四", "五", "六", "日"][day]}</button>`,
      )
      .join("");

    return `
      <div class="radar-detail-section radar-schedule-section">
        <h4>定时运行</h4>
        <div class="schedule-status">
          <span class="schedule-enabled ${enabled ? "active" : "inactive"}">${enabled ? "已启用" : "未启用"}</span>
          <span class="schedule-next">下次执行: ${escapeHtml(nextRun)}</span>
        </div>
        <div class="schedule-form" id="schedule-form">
          <label class="schedule-field">频率:
            <select id="schedule-frequency" ${!canEdit ? "disabled" : ""}>
              <option value="daily" ${frequency === "daily" ? "selected" : ""}>每天</option>
              <option value="weekly" ${frequency === "weekly" ? "selected" : ""}>每周</option>
            </select>
          </label>
          <label class="schedule-field">时间:
            <input type="time" id="schedule-time" value="${escapeHtml(time)}" ${!canEdit ? "disabled" : ""}>
          </label>
          <div id="weekday-picker" class="weekday-picker" style="display:${frequency === "weekly" ? "flex" : "none"};">
            <label class="schedule-field">周几:</label>
            ${weekdayButtons}
          </div>
          <label class="schedule-field">时区:
            <select id="schedule-timezone" ${!canEdit ? "disabled" : ""}>
              <option value="Asia/Shanghai" ${timezone === "Asia/Shanghai" ? "selected" : ""}>北京</option>
              <option value="Asia/Tokyo" ${timezone === "Asia/Tokyo" ? "selected" : ""}>东京</option>
              <option value="Asia/Hong_Kong" ${timezone === "Asia/Hong_Kong" ? "selected" : ""}>香港</option>
            </select>
          </label>
          <div class="schedule-actions">
            <button type="button" class="btn-primary" id="btn-save-schedule" ${!canEdit ? "disabled" : ""}>保存定时</button>
            <button type="button" class="btn-archive" id="btn-delete-schedule" ${!canEdit || !enabled ? "disabled" : ""}>清除定时</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 绑定定时设置区事件。
   * @param {Object} radar - Radar
   */
  function bindScheduleEvents(radar) {
    const freqSelect = document.getElementById("schedule-frequency");
    const weekdayPicker = document.getElementById("weekday-picker");
    if (freqSelect && weekdayPicker) {
      freqSelect.addEventListener("change", () => {
        weekdayPicker.style.display = freqSelect.value === "weekly" ? "flex" : "none";
      });
    }

    // 周几按钮切换
    const weekdayBtns = document.querySelectorAll(".weekday-btn");
    weekdayBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        btn.classList.toggle("selected");
      });
    });

    const saveBtn = document.getElementById("btn-save-schedule");
    if (saveBtn) saveBtn.addEventListener("click", () => {
      if (!saveBtn.disabled) saveSchedule(radar.id);
    });

    const deleteBtn = document.getElementById("btn-delete-schedule");
    if (deleteBtn) deleteBtn.addEventListener("click", () => {
      if (!deleteBtn.disabled) deleteSchedule(radar.id);
    });
  }

  /**
   * 保存定时（PUT /api/radars/:id/schedule）。
   * @param {string} radarId - 雷达 ID
   */
  async function saveSchedule(radarId) {
    if (!radarId) return;
    const frequency = document.getElementById("schedule-frequency")?.value ?? "daily";
    const time = document.getElementById("schedule-time")?.value ?? "08:00";
    const timezone = document.getElementById("schedule-timezone")?.value ?? "Asia/Shanghai";
    const weekdays =
      frequency === "weekly"
        ? [...document.querySelectorAll(".weekday-btn.selected")].map((b) => parseInt(b.dataset.day, 10))
        : undefined;

    if (frequency === "weekly" && (!weekdays || weekdays.length === 0)) {
      if (window.showToast) showToast("每周定时至少选择一个工作日", "warning");
      return;
    }

    try {
      const res = await fetch(`/api/radars/${encodeURIComponent(radarId)}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time, frequency, weekdays, timezone, enabled: true }),
      });
      const json = await res.json();
      if (json.success) {
        if (window.showToast) showToast("定时已保存", "success");
        loadRadarDetail(radarId);
      } else {
        const msg = json.error?.message || "保存失败";
        if (window.showToast) showToast(`定时保存失败：${msg}`, "error");
      }
    } catch (err) {
      if (window.showToast) showToast("定时保存失败：网络错误", "error");
    }
  }

  /**
   * 清除定时（DELETE /api/radars/:id/schedule）。
   * @param {string} radarId - 雷达 ID
   */
  async function deleteSchedule(radarId) {
    if (!radarId) return;
    if (!confirm("确认清除定时配置？")) return;
    try {
      const res = await fetch(`/api/radars/${encodeURIComponent(radarId)}/schedule`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        if (window.showToast) showToast("定时已清除", "success");
        loadRadarDetail(radarId);
      } else {
        const msg = json.error?.message || "清除失败";
        if (window.showToast) showToast(`定时清除失败：${msg}`, "error");
      }
    } catch (err) {
      if (window.showToast) showToast("定时清除失败：网络错误", "error");
    }
  }

  // ============================================================
  // 激活雷达
  // ============================================================

  /**
   * 激活雷达（POST /api/radars/:id/activate）。
   * @param {string} radarId - 雷达 ID
   */
  async function activateRadar(radarId) {
    if (!radarId) return;
    if (!confirm("确认激活此雷达？激活后可手动运行。")) return;
    try {
      const res = await fetch(`/api/radars/${encodeURIComponent(radarId)}/activate`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        if (window.showToast) showToast("雷达已激活", "success");
        loadRadarDetail(radarId);
      } else {
        const msg = json.error?.message || "激活失败";
        if (window.showToast) showToast(`激活失败：${msg}`, "error");
      }
    } catch (err) {
      if (window.showToast) showToast("激活失败：网络错误", "error");
    }
  }

  // ============================================================
  // 已入库机会 + 运行记录
  // ============================================================

  function kindToRadarType(kind) {
    if (kind === "opc_policy" || kind === "cultural_heritage" || kind === "custom") return kind;
    return "ai_competition";
  }

  function updateReportButtonState() {
    const btn = document.getElementById("radar-generate-report-btn");
    if (!btn) return;
    const latestRun = currentRadarRuns[0];
    const canGenerate =
      !!currentRadar &&
      !!latestRun &&
      latestRun.status === "succeeded" &&
      currentOpportunityCards.length > 0;
    btn.disabled = !canGenerate;
    btn.title = canGenerate ? "" : "需要先运行雷达并产生机会";
  }

  async function loadRadarRuns(radarId) {
    const container = document.getElementById("radar-run-history-list");
    if (!container) return;
    container.innerHTML = '<p class="placeholder">加载中...</p>';
    try {
      const res = await fetch(`/api/radars/${encodeURIComponent(radarId)}/runs`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        currentRadarRuns = json.data;
        renderRunHistory(currentRadarRuns);
      } else {
        currentRadarRuns = [];
        container.innerHTML = '<p class="placeholder">暂无运行记录</p>';
      }
    } catch (err) {
      currentRadarRuns = [];
      container.innerHTML = '<p class="placeholder">加载运行历史失败</p>';
    } finally {
      updateReportButtonState();
    }
  }

  function renderRunHistory(runs) {
    const container = document.getElementById("radar-run-history-list");
    if (!container) return;
    if (!runs || runs.length === 0) {
      container.innerHTML = '<p class="placeholder">暂无运行记录</p>';
      return;
    }
    const rows = runs.map((run) => `
      <tr>
        <td>${escapeHtml(formatTime(run.startedAt))}</td>
        <td>${escapeHtml(run.status || "—")}</td>
        <td>${run.totalScored ?? 0}</td>
        <td>${(run.opportunityKeys || []).length}</td>
        <td>${escapeHtml(run.reportId || "—")}</td>
      </tr>
    `).join("");
    container.innerHTML = `
      <table class="report-history-table">
        <thead><tr><th>开始时间</th><th>状态</th><th>机会数</th><th>记录数</th><th>报告</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  async function loadRadarOpportunities(radarId) {
    const list = document.getElementById("radar-stored-opportunity-list");
    if (!list) return;
    list.innerHTML = '<p class="placeholder">加载中...</p>';
    try {
      const opportunityRadarId = getOpportunityRadarIdForView(currentRadar) || radarId;
      const pageSize = opportunityRadarId === PUBLIC_AI_EVENTS_RADAR_ID ? 1000 : 20;
      if (opportunityRadarId === PUBLIC_AI_EVENTS_RADAR_ID) {
        list.innerHTML = '<p class="placeholder">正在同步 AI Events 公共赛事库...</p>';
        await ensurePublicAiEventsSynced();
      }
      const res = await fetch(`/api/opportunities?radar_id=${encodeURIComponent(opportunityRadarId)}&page_size=${pageSize}&sort_by=deadline&sort_order=asc`);
      const json = await res.json();
      if (json.success && json.data && Array.isArray(json.data.entries)) {
        const filteredEntries = filterPublicAiEventCardsForView(json.data.entries, opportunityRadarId === PUBLIC_AI_EVENTS_RADAR_ID);
        currentOpportunityCards = filteredEntries
          .map((entry) => entry.card)
          .filter(Boolean);
        renderStoredOpportunities(filteredEntries);
      } else {
        currentOpportunityCards = [];
        list.innerHTML = '<p class="placeholder">暂无入库机会</p>';
      }
    } catch (err) {
      currentOpportunityCards = [];
      list.innerHTML = '<p class="placeholder">加载机会失败</p>';
    } finally {
      updateReportButtonState();
    }
  }

  function renderStoredOpportunities(entries) {
    const list = document.getElementById("radar-stored-opportunity-list");
    if (!list) return;
    if (!entries || entries.length === 0) {
      list.innerHTML = '<p class="placeholder">暂无入库机会</p>';
      return;
    }
    list.innerHTML = "";
    entries.forEach((entry) => {
      list.appendChild(buildOppCard(entry));
    });
  }

  // ============================================================
  // 手动运行
  // ============================================================

  /**
   * 手动运行雷达（POST /api/radars/:id/run）。
   * 成功后渲染返回的机会卡片。
   * @param {string} radarId - 雷达 ID
   */
  async function runRadar(radarId) {
    if (!radarId) return;
    const runBtn = document.getElementById("radar-run-btn");
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = "运行中...";
    }
    const resultSection = document.getElementById("radar-run-result-section");
    const resultList = document.getElementById("radar-run-result-list");
    if (resultSection) resultSection.style.display = "block";
    if (resultList) resultList.innerHTML = '<p class="placeholder">正在搜索机会，请稍候...</p>';

    try {
      const status = document.getElementById("radar-detail-rerun-status");
      if (status) status.innerHTML = '<span class="rerun-status-running">正在重新盯机会</span>';
      const json = await postJson(`/api/radars/${encodeURIComponent(radarId)}/run`, getSearchModeRequest());
      const runData = json.data || {};
      const outcome = runData.runOutcome;
      if (outcome?.status && outcome.status !== "succeeded") {
        if (resultList) {
          resultList.innerHTML = `
            <div class="watch-empty-state">
              <p>${escapeHtml(outcome.message || "本轮结果不足，可重试搜索。")}</p>
              <button class="btn-secondary" id="radar-detail-retry-run">重试搜索</button>
            </div>
          `;
          document.getElementById("radar-detail-retry-run")?.addEventListener("click", () => runRadar(radarId));
        }
        if (status) status.innerHTML = `<span class="rerun-status-warning">${escapeHtml(outcome.message || "本轮结果不足，可重试搜索。")}</span>`;
        if (window.showToast) showToast(outcome.message || "本轮结果不足，可稍后重试", "warning");
        await loadRadarRuns(radarId);
        return;
      }
      const opportunities = runData.opportunityCards || runData.opportunities || [];
      renderRunResult(opportunities);
      if (resultList) {
        resultList.insertAdjacentHTML("afterbegin", '<p class="placeholder">正在生成报告...</p>');
      }
      if (status) status.innerHTML = '<span class="rerun-status-running">正在生成报告</span>';

      try {
        const report = await postJson("/api/reports/generate", {
          radar_id: radarId,
          run_id: runData.run?.id,
          radar_type: kindToRadarType(currentRadar?.kind),
          spec: currentRadar?.spec,
          opportunities,
          sourceHintChecks: runData.sourceCoverage || runData.sourceHintChecks || [],
          candidateAccounting: runData.candidateAccounting,
          executionLog: runData.executionLog,
          rawCandidates: runData.rawCandidates || [],
        });
        const reportId = report.data?.reportId || "";
        if (status) {
          status.innerHTML = `
            <span class="rerun-status-success">已生成新报告</span>
            <button class="btn-view-latest-report" id="radar-detail-view-latest-report" data-report-id="${escapeHtml(reportId)}">查看本次报告</button>
          `;
        }
        document.getElementById("radar-detail-view-latest-report")?.addEventListener("click", () => {
          document.getElementById("radar-report-history-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        if (window.showToast) showToast(`已生成新报告，本次发现 ${opportunities.length} 个机会`, "success");
      } catch (reportErr) {
        if (status) {
          status.innerHTML = '<span class="rerun-status-warning">机会已更新，报告生成失败，可重试生成报告</span>';
        }
        if (window.showToast) showToast(`机会已更新，报告生成失败：${reportErr instanceof Error ? reportErr.message : "网络错误"}`, "warning");
      }
      await loadRadarRuns(radarId);
      await loadRadarOpportunities(radarId);
      await loadReportHistory(radarId);
    } catch (err) {
      if (resultList) resultList.innerHTML = '<p class="placeholder">运行失败：网络错误</p>';
      if (window.showToast) showToast("运行失败：网络错误", "error");
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = "再次盯机会";
      }
    }
  }

  /**
   * 渲染运行结果机会卡片（最简版，复用 search.js 的卡片样式）。
   * @param {Array} opportunities - ScoredOpportunity[]（含 radarId）
   */
  function renderRunResult(opportunities) {
    const resultList = document.getElementById("radar-run-result-list");
    if (!resultList) return;
    if (!opportunities || opportunities.length === 0) {
      resultList.innerHTML = '<p class="placeholder">本次运行未发现机会</p>';
      return;
    }
    resultList.innerHTML = "";
    opportunities.forEach((opp) => {
      resultList.appendChild(buildOppCard(opp));
    });
  }

  /**
   * 构造单个机会卡片（最简版）。
   * 复用现有 .opp-card / .level-badge / .card-title 样式。
   * @param {Object} opp - ScoredOpportunity / OpportunityCard / StoreEntry
   * @returns {HTMLElement}
   */
  function buildOppCard(opp) {
    const card = document.createElement("div");
    card.className = "opp-card";
    const entry = opp && opp.card ? opp : null;
    const data = entry ? entry.card : opp;
    const searchResult = data.search_result || {};
    const level = data.visible_level || "C";
    const title = searchResult.title || data.title || "未知机会";
    const url = searchResult.url || data.official_source_url || "#";
    const isDemo = data.is_demo_data === true || data.data_mode === "mock" || /演示|测试数据|mock/i.test(`${data.risk_note || ""}${data.source_disclaimer || ""}`);
    const source = isDemo
      ? "演示来源，未真实核验"
      : searchResult.source_provider || data.source_name || data.source_type || "未知";
    const reason = data.relevance_reason || data.match_reason || data.ai_analysis || "";
    const recommendation = data.visible_level || data.score_label || "值得关注";
    const nextAction = data.next_action || (Array.isArray(data.recommendedActions) ? data.recommendedActions[0] : "") || "先打开来源确认行动入口。";
    const deadline = displayDeadline(data.deadline);

    card.innerHTML = `
      <div class="card-header">
        <span class="level-badge level-${level.toLowerCase()}">${escapeHtml(String(level))}</span>
        ${isDemo || !url || url === "#"
          ? `<span class="card-title">${escapeHtml(title)}</span>`
          : `<a class="card-title" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>`}
      </div>
      <div class="card-meta">
        <span class="card-source">${escapeHtml(source)}</span>
        <span class="card-radar-tag">推荐度：${escapeHtml(String(recommendation))}</span>
      </div>
      ${reason ? `<div class="card-reason">为什么值得看：${escapeHtml(reason)}</div>` : ""}
      <div class="card-reason">截止时间：${escapeHtml(deadline)}</div>
      <div class="card-reason">建议动作：${escapeHtml(nextAction)}</div>
    `;
    return card;
  }

  // ============================================================
  // 删除雷达
  // ============================================================

  /**
   * 删除雷达（DELETE /api/radars/:id）。
   * @param {string} radarId - 雷达 ID
   */
  async function archiveRadar(radarId) {
    if (!radarId) return;
    if (!confirm("确认删除这个雷达？删除后它会从“我的雷达”列表移除，历史机会和报告仍会保留。")) return;
    try {
      const res = await fetch(`/api/radars/${encodeURIComponent(radarId)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        if (window.showToast) showToast("雷达已删除", "success");
        if (typeof window.backToList === "function") window.backToList();
      } else {
        const msg = json.error?.message || "删除失败";
        if (window.showToast) showToast(`删除失败：${msg}`, "error");
      }
    } catch (err) {
      if (window.showToast) showToast("删除失败：网络错误", "error");
    }
  }

  // ============================================================
  // 历史报告（V1.5-08 新增）
  // ============================================================

  async function generateRadarReport(radarId) {
    if (!radarId || !currentRadar) return;
    const latestRun = currentRadarRuns[0];
    if (!latestRun || latestRun.status !== "succeeded") {
      if (window.showToast) showToast("请先成功运行一次雷达", "warning");
      return;
    }
    if (!currentOpportunityCards || currentOpportunityCards.length === 0) {
      if (window.showToast) showToast("当前雷达暂无可报告的机会", "warning");
      return;
    }

    const btn = document.getElementById("radar-generate-report-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "生成中...";
    }

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          radar_id: radarId,
          run_id: latestRun.id,
          radar_type: kindToRadarType(currentRadar.kind),
          spec: currentRadar.spec,
          opportunities: currentOpportunityCards,
        }),
      });
      const json = await res.json();
      if (json.success && json.data && json.data.reportId) {
        if (window.showToast) showToast("Markdown 报告已生成", "success");
        loadRadarRuns(radarId);
        loadReportHistory(radarId);
      } else {
        const msg = json.error?.message || "报告生成失败";
        if (window.showToast) showToast(`报告生成失败：${msg}`, "error");
      }
    } catch (err) {
      if (window.showToast) showToast("报告生成失败：网络错误", "error");
    } finally {
      if (btn) {
        btn.textContent = "生成报告";
      }
      updateReportButtonState();
    }
  }

  /**
   * 加载雷达的历史报告（GET /api/reports?radar_id=xxx）。
   * @param {string} radarId - 雷达 ID
   */
  async function loadReportHistory(radarId) {
    const container = document.getElementById("radar-report-history-list");
    if (!container) return;
    container.innerHTML = '<p class="placeholder">加载中...</p>';
    try {
      const res = await fetch(`/api/reports?radar_id=${encodeURIComponent(radarId)}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        renderReportList(json.data);
      } else {
        container.innerHTML = '<p class="placeholder">暂无历史报告</p>';
      }
    } catch (err) {
      container.innerHTML = '<p class="placeholder">加载历史报告失败</p>';
    }
  }

  /**
   * 渲染历史报告列表（表格形式）。
   * @param {Array} reports - ReportMeta[]
   */
  function renderReportList(reports) {
    const container = document.getElementById("radar-report-history-list");
    if (!container) return;
    if (!reports || reports.length === 0) {
      container.innerHTML = '<p class="placeholder">暂无历史报告</p>';
      return;
    }
    const rows = reports.map((r) => `
      <tr>
        <td>${escapeHtml(r.title || "—")}</td>
        <td>${escapeHtml(r.periodStart || "—")} ~ ${escapeHtml(r.periodEnd || "—")}</td>
        <td>${r.opportunityCount ?? 0}</td>
        <td>${escapeHtml(formatTime(r.createdAt))}</td>
        <td><a href="/api/reports/export/${encodeURIComponent(r.filename)}" target="_blank">下载</a></td>
      </tr>
    `).join("");
    container.innerHTML = `
      <table class="report-history-table">
        <thead><tr><th>标题</th><th>周期</th><th>机会数</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ============================================================
  // 暴露到全局
  // ============================================================

  window.loadRadarDetail = loadRadarDetail;
  window.renderRadarDetail = renderRadarDetail;
  window.activateRadar = activateRadar;
  window.runRadar = runRadar;
  window.renderRunResult = renderRunResult;
  window.loadRadarRuns = loadRadarRuns;
  window.loadRadarOpportunities = loadRadarOpportunities;
  window.generateRadarReport = generateRadarReport;
  window.loadReportHistory = loadReportHistory;
  window.renderReportList = renderReportList;
})();
