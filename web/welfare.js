(function () {
  "use strict";
  const state = { status: "current", page: 1, totalPages: 1, selected: null, data: null };
  const salesStorageKey = "chanceping:welfare:sales-follow-up:v1";
  const salesFollowUps = (() => { try { return JSON.parse(localStorage.getItem(salesStorageKey) || "{}"); } catch { return {}; } })();
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const fieldLabels = { buyer: "采购单位", budget: "预算", deadline: "截止", status: "状态", contactName: "联系人", contactPhone: "联系电话", contactAddress: "联系地址" };
  const typeLabels = { OPEN_PROCUREMENT: "公开采购", PROCUREMENT_INTENT: "采购意向", SUPPLIER_RECRUITMENT: "供应商征集", FRAMEWORK_AGREEMENT: "框架协议", CHANNEL_PARTNERSHIP: "渠道合作" };
  const verificationLabels = { CANDIDATE: "新发现", FIELD_VERIFIED: "部分字段待核验", STATUS_VERIFIED: "状态已核验", FULLY_VERIFIED: "信息完整" };
  const sourceGroups = [
    ["全国采购平台", (source) => source.code.startsWith("OFF-N-")],
    ["广东及深圳地方平台", (source) => /^(OFF-(GD|GZ|SZ)-)/.test(source.code)],
    ["高校与机构", (source) => source.code.startsWith("ORG-")],
    ["福利渠道", (source) => source.code.startsWith("WEL-")],
  ];

  function replaceOptions(select, items, placeholder) {
    const value = select.value;
    select.innerHTML = `<option value="all">${placeholder}</option>${items.map((item) => `<option value="${esc(item.id)}">${esc(item.label)}（${item.count}）</option>`).join("")}`;
    select.value = Array.from(select.options).some((option) => option.value === value) ? value : "all";
  }

  function renderMetrics(stats) {
    document.querySelector("#welfare-metrics").innerHTML = [[stats.currentCount, "当前有效"], [stats.knownDeadlineCount, "明确截止"], [stats.knownBudgetCount, "公开预算"], [stats.verifiedCount, "已核验"], [stats.totalCount, "全部收录"]]
      .map(([value, label]) => `<div class="welfare-metric"><strong>${value}</strong><span>${label}</span></div>`).join("");
  }

  function renderEvidence(item) {
    state.selected = item?.id ?? null;
    document.querySelectorAll(".welfare-decision-row").forEach((element) => element.classList.toggle("is-active", element.dataset.id === state.selected));
    const root = document.querySelector("#welfare-evidence");
    if (!item) { root.innerHTML = "<p>选择一条商机查看字段证据。</p>"; return; }
    root.innerHTML = `<h3>${esc(item.title)}</h3><div class="welfare-evidence-list">${item.evidenceFields.map((field) => `<div class="welfare-evidence-item ${field.state !== "verified" ? "is-unknown" : ""}"><b>${esc(fieldLabels[field.field] || field.field)} · ${field.state === "verified" ? "已核验" : field.state === "not_published" ? "未公开" : "待核验"}</b>${field.excerpt ? `<div>${esc(field.excerpt)}</div>` : ""}</div>`).join("")}</div>`;
  }

  function saveSalesFollowUp(id, patch) {
    salesFollowUps[id] = { ...(salesFollowUps[id] || {}), ...patch, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(salesStorageKey, JSON.stringify(salesFollowUps)); } catch { /* private browser storage may be unavailable */ }
  }

  function wireSalesControls(items) {
    document.querySelectorAll(".welfare-followup-status").forEach((select) => select.addEventListener("change", () => saveSalesFollowUp(select.dataset.id, { status: select.value })));
    document.querySelectorAll(".welfare-followup-note").forEach((input) => input.addEventListener("change", () => saveSalesFollowUp(input.dataset.id, { note: input.value })));
    document.querySelectorAll(".welfare-followup-save").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.id;
      const input = document.querySelector(`.welfare-followup-note[data-id="${CSS.escape(id)}"]`);
      saveSalesFollowUp(id, { note: input?.value || "" });
      button.textContent = "已保存";
      setTimeout(() => { button.textContent = "保存跟进记录"; }, 1200);
    }));
  }

  function renderSources(sources) {
    const active = sources.filter((source) => source.status === "active").length;
    const degraded = sources.filter((source) => source.status === "degraded").length;
    const empty = sources.filter((source) => source.status === "empty").length;
    document.querySelector("#welfare-source-summary").textContent = `${sources.length} 个来源 · ${active} 正常${degraded ? ` · ${degraded} 异常` : ""}${empty ? ` · ${empty} 暂无结果` : ""}`;
    const statusLabels = { active: "正常运行", degraded: "需要关注", empty: "暂无结果" };
    const groups = sourceGroups.map(([label, matches]) => [label, sources.filter(matches)]).filter(([, items]) => items.length);
    document.querySelector("#welfare-sources").innerHTML = groups.map(([label, items]) => `<details class="welfare-source-group"><summary><strong>${esc(label)}</strong><span>${items.length} 个来源</span></summary><div class="welfare-source-list">${items.map((source) => `<article class="welfare-source-item"><div><strong>${esc(source.name)}</strong><small>${esc(source.code)} · ${statusLabels[source.status] || source.status}${source.lastUpdatedAt ? ` · 更新于 ${esc(new Date(source.lastUpdatedAt).toLocaleString("zh-CN", { hour12: false }))}` : ""}</small></div><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">查看官方栏目</a></article>`).join("")}</div></details>`).join("");
  }

  function render(data) {
    state.data = data;
    state.totalPages = data.stats.totalPages;
    document.querySelector("#welfare-count").textContent = `${data.stats.filteredCount} 条`;
    document.querySelector("#welfare-list-title").textContent = state.status === "priority" ? "销售优先机会" : state.status === "current" ? "当前有效企业福利商机" : "历史企业福利商机";
    renderMetrics(data.stats);
    replaceOptions(document.querySelector("#welfare-type"), data.stats.typeFacets, "全部类型");
    replaceOptions(document.querySelector("#welfare-scene"), data.stats.sceneFacets, "全部场景");
    replaceOptions(document.querySelector("#welfare-region"), data.stats.regionFacets, "全部地区");
    replaceOptions(document.querySelector("#welfare-supplier"), data.stats.supplierFitFacets || [], "全部供应商类型");
    document.querySelector("#welfare-decision-list").innerHTML = data.items.length ? data.items.map((item) => `<button class="welfare-decision-row" data-id="${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.deadlineDisplay)}</span><span>${esc(item.buyer)} · ${esc(item.region)}</span><span>${esc(verificationLabels[item.verificationState] || "待核验")}</span></button>`).join("") : "<p style='padding:18px'>当前筛选没有匹配商机。</p>";
    document.querySelector("#welfare-grid").innerHTML = data.items.length ? data.items.map((item) => { const local = salesFollowUps[item.id] || {}; const status = local.status || item.followUpStatus || "待联系"; return `<article class="welfare-card"><div class="welfare-badges"><span class="welfare-badge">${esc(typeLabels[item.opportunityType] || item.opportunityType)}</span><span class="welfare-badge welfare-badge-status">${esc(item.salesPriority === "HIGH" ? "优先跟进" : item.salesPriority === "MEDIUM" ? "建议评估" : "信息跟踪")}</span><span class="welfare-badge">${esc(status)}</span>${item.welfareScenes.map((scene) => `<span class="welfare-badge">${esc(scene)}</span>`).join("")}</div><h3>${esc(item.title)}</h3><dl><dt>采购单位</dt><dd>${esc(item.buyer)}</dd><dt>联系人</dt><dd>${esc(item.contactName)}</dd><dt>电话</dt><dd>${esc(item.contactPhone)}</dd><dt>地址</dt><dd>${esc(item.contactAddress)}</dd><dt>地区</dt><dd>${esc(item.region)}</dd><dt>预算</dt><dd>${esc(item.budgetDisplay)}</dd><dt>截止</dt><dd>${esc(item.deadlineDisplay)}</dd><dt>匹配供应商</dt><dd>${esc((item.supplierMatches || []).join("、") || "待判断")}</dd></dl><p class="welfare-card-reason">${esc(item.reason)}</p><p class="welfare-card-next"><strong>销售建议</strong>${esc(item.salesAction || item.nextAction)}<br><small>${esc(item.followUpNextAction || "")}</small></p><div class="welfare-followup"><label>跟进状态<select class="welfare-followup-status" data-id="${esc(item.id)}"><option${status === "待联系" ? " selected" : ""}>待联系</option><option${status === "已联系" ? " selected" : ""}>已联系</option><option${status === "待报价" ? " selected" : ""}>待报价</option><option${status === "不跟进" ? " selected" : ""}>不跟进</option></select></label><input class="welfare-followup-note" data-id="${esc(item.id)}" value="${esc(local.note || "")}" placeholder="记录下一步或联系结果"><button class="welfare-followup-save" data-id="${esc(item.id)}" type="button">保存跟进记录</button></div><a href="${esc(item.officialUrl)}" target="_blank" rel="noopener noreferrer">打开官方原文</a></article>`; }).join("") : "<article class='welfare-card'>暂未发现符合当前筛选的商机。</article>";
    document.querySelector("#welfare-page-info").textContent = `第 ${data.stats.page} / ${data.stats.totalPages} 页`;
    document.querySelector("#welfare-prev").disabled = data.stats.page <= 1;
    document.querySelector("#welfare-next").disabled = data.stats.page >= data.stats.totalPages;
    renderSources(data.sources);
    document.querySelectorAll(".welfare-decision-row").forEach((button) => button.addEventListener("click", () => renderEvidence(data.items.find((item) => item.id === button.dataset.id))));
    renderEvidence(data.items.find((item) => item.id === state.selected) || data.items[0]);
    wireSalesControls(data.items);
  }

  function renderCandidates(data) {
    state.data = data; state.totalPages = data.stats.totalPages;
    document.querySelector("#welfare-count").textContent = `${data.stats.totalCount} 条`;
    document.querySelector("#welfare-list-title").textContent = "待核验销售线索";
    document.querySelector("#welfare-metrics").innerHTML = [[data.stats.totalCount, "待核验线索"], ["—", "不代表当前可投"], ["—", "需回溯官方原文"]].map(([value, label]) => `<div class="welfare-metric"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join("");
    document.querySelector("#welfare-decision-list").innerHTML = "<p style='padding:18px'>线索仅用于销售发现，不代表已核验机会。</p>";
    document.querySelector("#welfare-evidence").innerHTML = "<p>打开线索官方原文并完成核验。</p>";
    document.querySelector("#welfare-grid").innerHTML = data.items.length ? data.items.map((item) => `<article class="welfare-card"><div class="welfare-badges"><span class="welfare-badge">待核验线索</span><span class="welfare-badge welfare-badge-status">${esc(item.sourceCode)}</span></div><h3>${esc(item.title)}</h3><dl><dt>来源</dt><dd>${esc(item.sourceName)}</dd><dt>地区</dt><dd>${esc(item.region)}</dd><dt>发布时间</dt><dd>${esc(item.publishedAt.slice(0, 10))}</dd></dl><p class="welfare-card-reason">${esc(item.reason)}</p><p class="welfare-card-next"><strong>销售下一步</strong>${esc(item.nextAction)}</p><a href="${esc(item.officialUrl)}" target="_blank" rel="noopener noreferrer">打开官方原文</a></article>`).join("") : "<article class='welfare-card'>当前没有待核验线索。</article>";
    document.querySelector("#welfare-page-info").textContent = `第 ${data.stats.page} / ${data.stats.totalPages} 页`;
    document.querySelector("#welfare-prev").disabled = data.stats.page <= 1;
    document.querySelector("#welfare-next").disabled = data.stats.page >= data.stats.totalPages;
  }

  async function load() {
    const params = new URLSearchParams({ status: state.status === "priority" ? "current" : state.status, sort: state.status === "priority" ? "sales" : "deadline", page: String(state.page), page_size: "24", type: document.querySelector("#welfare-type").value, scene: document.querySelector("#welfare-scene").value, region: document.querySelector("#welfare-region").value, supplier_fit: document.querySelector("#welfare-supplier").value, contact: document.querySelector("#welfare-contact").value, deadline_window: document.querySelector("#welfare-deadline").value });
    try {
      const response = await fetch(state.status === "candidates" ? `/api/public/welfare/candidates?page=${state.page}&page_size=24` : `/api/public/welfare/opportunities?${params}`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error?.message || "加载失败");
      state.status === "candidates" ? renderCandidates(json.data) : render(json.data);
    } catch (error) {
      document.querySelector("#welfare-grid").innerHTML = `<article class="welfare-card">${esc(error.message || "加载失败")}</article>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll("[data-status]").forEach((item) => item.classList.remove("is-active")); button.classList.add("is-active"); state.status = button.dataset.status; state.page = 1; document.querySelectorAll(".welfare-filters select").forEach((select) => select.disabled = state.status === "candidates"); load(); }));
    ["#welfare-type", "#welfare-scene", "#welfare-region", "#welfare-supplier", "#welfare-contact", "#welfare-deadline"].forEach((id) => document.querySelector(id).addEventListener("change", () => { state.page = 1; load(); }));
    document.querySelector("#welfare-prev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; load(); } });
    document.querySelector("#welfare-next").addEventListener("click", () => { if (state.page < state.totalPages) { state.page += 1; load(); } });
    load();
  });
})();
