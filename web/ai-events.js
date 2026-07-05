(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toCustomerReason(value) {
    const text = String(value || "").trim();
    if (!text) return "与 AI 赛事雷达相关，建议打开官方入口进一步复核。";
    if (/Live Evidence MVP|LLM\s*仍保持\s*mock|mock\s*轻量评估/i.test(text)) {
      if (/未读取正文|仅保留搜索发现|待复核/.test(text)) {
        return "搜索发现来源，尚未读取完整正文；请打开官方入口复核报名、截止时间和参赛资格。";
      }
      if (/已有限读取|已读取网页正文/.test(text)) {
        return "已读取来源页面的部分正文；报名资格、费用、截止时间和提交要求仍以官方页面为准。";
      }
      return "搜索发现来源，字段仍需复核；不要直接当作已确认报名机会。";
    }
    return text;
  }

  function renderItem(item) {
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 4) : [];
    const url = item.officialUrl || "";
    return `
      <article class="ai-event-card">
        <div class="ai-event-card-top">
          <span>${escapeHtml(item.statusLabel || "待复核")}</span>
          <small>${escapeHtml(item.platform || "待识别")}</small>
        </div>
        <h3>${escapeHtml(item.title || "未命名赛事")}</h3>
        <p>${escapeHtml(toCustomerReason(item.reason))}</p>
        <dl>
          <div><dt>截止</dt><dd>${escapeHtml(item.deadline || "待复核")}</dd></div>
          <div><dt>价值</dt><dd>${escapeHtml(item.reward || "待复核")}</dd></div>
        </dl>
        ${tags.length > 0 ? `<div class="ai-event-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        ${url ? `<a class="ai-event-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">打开官方入口</a>` : '<span class="ai-event-link disabled">来源待复核</span>'}
      </article>
    `;
  }

  async function loadAiEvents() {
    const grid = document.getElementById("ai-events-grid");
    const count = document.getElementById("ai-events-count");
    if (!grid) return;
    try {
      const res = await fetch("/api/public/ai-events");
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "加载失败");
      const items = Array.isArray(json.data?.items) ? json.data.items : [];
      if (count) count.textContent = `${items.length} 条`;
      grid.innerHTML = items.length > 0
        ? items.map(renderItem).join("")
        : '<article class="ai-event-card ai-event-card-loading">暂未收录公开 AI 赛事机会。先创建我的 AI 赛事雷达，运行后这里会出现清洗后的公开卡片。</article>';
    } catch (err) {
      if (count) count.textContent = "加载失败";
      grid.innerHTML = `<article class="ai-event-card ai-event-card-loading">加载失败：${escapeHtml(err instanceof Error ? err.message : "网络错误")}</article>`;
    }
  }

  document.addEventListener("DOMContentLoaded", loadAiEvents);
})();
