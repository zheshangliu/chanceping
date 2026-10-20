(() => {
  const root = document.querySelector("[data-ich-agent]");
  if (!root) return;
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const output = root.querySelector("[data-agent-results]");
  const status = root.querySelector("[data-agent-status]");
  const clearSession = root.querySelector("[data-agent-clear]");
  const mode = root.querySelector("select[name=mode]");
  const printSheet = document.querySelector("#ich-agent-print-sheet");
  const printText = document.querySelector("#ich-agent-print-text");
  let current = null;
  let shownAll = false;
  let selected = new Set();

  const node = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined && text !== null) item.textContent = String(text);
    return item;
  };
  const textOf = (value, fallback = "待核实") => value === null || value === undefined || value === "" ? fallback : String(value);
  const deadlineText = (fact) => {
    if (fact?.status === "conflict") return "日期有冲突，回原文核实";
    const value = textOf(fact?.value, "");
    if (!value) return "待核实";
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/u);
    return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : value;
  };
  const categoryText = (value) => ({ competition: "赛事 / 征集", procurement_project: "采购 / 订单", exhibition_market: "市集 / 展销", channel_collaboration: "渠道 / 合作", policy_funding: "资助 / 扶持", international: "研修 / 国际交流" })[value] || value || "机会";
  const evidenceFieldText = (value) => ({ title: "标题", source: "来源", summary: "摘要", deadline: "截止日期", money: "费用", eligibility: "申请资格", work_requirements: "作品要求" })[value] || value;
  const evidenceValueText = (evidence) => evidence.field === "deadline" ? deadlineText({ value: evidence.value, status: "recorded" }) : evidence.excerpt || evidence.value;
  const validHttpUrl = (raw) => {
    try {
      const url = new URL(raw);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : "";
    } catch { return ""; }
  };
  const requestId = () => `req-${crypto.randomUUID().replaceAll("-", "")}`;
  const factsBlock = (title, facts, format = (fact) => textOf(fact.value)) => {
    const section = node("section", "agent-fact");
    section.append(node("h4", "", title));
    const list = node("ul");
    (facts || []).forEach((fact) => list.append(node("li", fact.status === "unknown" ? "is-unknown" : "", format(fact))));
    section.append(list);
    return section;
  };
  const evidenceLink = (result, evidenceById) => {
    const container = node("div", "agent-evidence");
    (result.evidence_refs || []).map((id) => evidenceById.get(id)).filter(Boolean).forEach((evidence) => {
      const url = validHttpUrl(evidence.source_url);
      const row = node("div", "agent-evidence-row");
      row.append(node("span", "", `${evidenceFieldText(evidence.field)} · ${evidence.status === "pool_record" ? "机会库记录" : evidence.status === "source_excerpt" ? "来源摘录" : "搜索线索"}`));
      if (url) {
        const link = node("a", "", "查看证据原文");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer nofollow";
        row.append(link);
      }
      if (evidence.excerpt || evidence.value) row.append(node("p", "", evidenceValueText(evidence)));
      if (evidence.recorded_at) row.append(node("small", "", `记录时间：${new Date(evidence.recorded_at).toLocaleString("zh-CN")}`));
      container.append(row);
    });
    return container;
  };
  const updatePrintSheet = (results, evidences) => {
    printText.replaceChildren();
    const heading = node("h1", "", "盯非遗｜行动核对清单");
    printText.append(heading, node("p", "", `生成时间：${new Date().toLocaleString("zh-CN")}`));
    results.forEach((result, index) => {
      const section = node("section", "");
      section.append(node("h2", "", `${index + 1}. ${result.title_zh}`));
      section.append(node("p", "", `类型：${categoryText(result.opportunity_type)}　·　地区：${result.region}`));
      section.append(node("p", "", `截止：${deadlineText(result.deadline_fact)}`));
      section.append(node("p", "", `资格：${(result.eligibility_facts || []).map((fact) => textOf(fact.value)).join("；") || "待核实"}`));
      section.append(node("p", "", `费用：${(result.money_facts || []).map((fact) => textOf(fact.value)).join("；") || "待核实"}`));
      section.append(node("p", "", `作品 / 材料：${(result.work_requirements || []).map((fact) => textOf(fact.value)).join("；") || "待核实"}`));
      section.append(node("p", "", `下一步：${result.next_action}`));
      ["核实主办方和申请对象", "确认截止日期与所在时区", "核实报名、材料和运输费用", "逐项对照作品数量、尺寸和原创要求"].forEach((task) => section.append(node("p", "", `☐ ${task}`)));
      const source = validHttpUrl(result.original_url);
      if (source) section.append(node("p", "", `来源原文：${source}`));
      const proof = (result.evidence_refs || []).map((id) => evidences.get(id)).filter(Boolean);
      proof.forEach((item) => section.append(node("blockquote", "", `${evidenceFieldText(item.field)}：${evidenceValueText(item)}`)));
      printText.append(section);
    });
    printSheet.hidden = results.length === 0;
  };
  const buildChecklist = (results, evidenceById) => ["# 盯非遗｜行动核对清单", "", `生成时间：${new Date().toLocaleString("zh-CN")}`, "", ...results.flatMap((result, index) => {
    const proof = (result.evidence_refs || []).map((id) => evidenceById.get(id)).filter(Boolean).map((item) => `> ${evidenceFieldText(item.field)}：${evidenceValueText(item)}`);
    const source = validHttpUrl(result.original_url);
    return [`## ${index + 1}. ${result.title_zh}`, "", `- 类型：${categoryText(result.opportunity_type)}`, `- 地区：${result.region}`, `- 截止：${deadlineText(result.deadline_fact)}`, `- 资格：${(result.eligibility_facts || []).map((fact) => textOf(fact.value)).join("；") || "待核实"}`, `- 费用：${(result.money_facts || []).map((fact) => textOf(fact.value)).join("；") || "待核实"}`, `- 作品 / 材料：${(result.work_requirements || []).map((fact) => textOf(fact.value)).join("；") || "待核实"}`, `- 下一步：${result.next_action}`, "", "### 核对项", "- [ ] 主办方与申请对象", "- [ ] 截止日期及所在时区", "- [ ] 报名、材料和运输费用", "- [ ] 作品数量、尺寸和原创要求", ...(source ? [`- 来源原文：<${source}>`] : []), ...proof, ""];
  })].join("\n");
  const makeCard = (result, index, evidences) => {
    const article = node("article", "agent-result-card");
    const top = node("div", "agent-result-top");
    top.append(node("span", "agent-pill", result.source_kind === "library" ? "已收录机会" : "网上新发现 · 尚未入库"));
    if (result.title_translation === "original" && /[A-Za-z]{3,}/u.test(result.title_zh)) top.append(node("span", "agent-pill", "来源标题原文"));
    top.append(node("span", "agent-pill", categoryText(result.opportunity_type)));
    top.append(node("span", "agent-pill", result.lifecycle === "current" ? "当前开放" : result.lifecycle === "upcoming" ? "即将开始" : result.lifecycle === "historical" ? "已截止" : result.lifecycle === "cancelled" ? "已取消" : result.lifecycle === "conflict" ? "日期有冲突" : "状态待核"));
    article.append(top);
    article.append(node("h3", "", result.title_zh));
    if (result.original_title) article.append(node("p", "agent-original", `原文标题：${result.original_title}`));
    article.append(node("p", "agent-fit", result.fit_reason));
    const facts = node("div", "agent-facts");
    facts.append(factsBlock("截止日期", [result.deadline_fact], (fact) => deadlineText(fact)));
    facts.append(factsBlock("费用", result.money_facts));
    facts.append(factsBlock("申请资格", result.eligibility_facts));
    facts.append(factsBlock("作品 / 材料", result.work_requirements));
    article.append(facts);
    article.append(node("p", "agent-gap", `还需确认：${result.key_gap}`));
    article.append(evidenceLink(result, evidences));
    const actions = node("div", "agent-actions");
    const source = validHttpUrl(result.original_url);
    if (source) {
      const original = node("a", "agent-secondary", "打开来源原文");
      original.href = source;
      original.target = "_blank";
      original.rel = "noopener noreferrer nofollow";
      actions.append(original);
    }
    if (result.detail_url && result.opportunity_id) {
      const detail = node("a", "agent-secondary", "看完整详情");
      detail.href = result.detail_url;
      actions.append(detail);
    }
    const ask = node("button", "agent-secondary", "看报名要求");
    ask.type = "button";
    ask.addEventListener("click", () => submit(`请核对“${result.title_zh}”的报名资格、费用、截止日期和作品要求。`, { result_ref: result.result_ref, parent_turn_id: current?.turn_id }));
    actions.append(ask);
    const checkboxLabel = node("label", "agent-compare-select");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.has(result.result_ref);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked && selected.size < 3) selected.add(result.result_ref);
      else if (checkbox.checked) checkbox.checked = false;
      else selected.delete(result.result_ref);
      root.querySelector("[data-agent-compare]").disabled = selected.size < 2;
    });
    checkboxLabel.append(checkbox, document.createTextNode("加入对比"));
    actions.append(checkboxLabel);
    article.append(actions);
    return article;
  };
  const render = (payload) => {
    current = payload;
    shownAll = false;
    selected = new Set();
    output.replaceChildren();
    const evidenceById = new Map((payload.evidences || []).map((evidence) => [evidence.evidence_id, evidence]));
    const results = payload.results || [];
    results.slice(0, 3).forEach((result, index) => output.append(makeCard(result, index, evidenceById)));
    if (results.length > 3) {
      const more = node("button", "agent-more", `查看其他结果（还有 ${results.length - 3} 条）`);
      more.type = "button";
      more.addEventListener("click", () => {
        if (shownAll) return;
        results.slice(3).forEach((result, index) => output.insertBefore(makeCard(result, index + 3, evidenceById), more));
        more.remove();
        shownAll = true;
      });
      output.append(more);
    }
    if (!results.length) output.append(node("p", "agent-empty", "这次没有找到符合条件的已收录机会。您可以调整工艺或地区，也可以在高级选项中申请联网补查。"));
    if (payload.comparison?.length) {
      const comparison = node("section", "agent-comparison");
      comparison.append(node("h3", "", "所选机会对比"));
      payload.comparison.forEach((row) => {
        const block = node("article", "agent-result-card");
        block.append(node("h4", "", row.title_zh));
        block.append(node("p", "", `类型：${categoryText(row.opportunity_type)}`));
        block.append(node("p", "", `截止：${deadlineText(row.deadline)}`));
        block.append(node("p", "", `费用：${(row.money || []).map((fact) => textOf(fact.value)).join("；") || "待核实"}`));
        block.append(node("p", "", `资格：${(row.eligibility || []).map((fact) => textOf(fact.value)).join("；") || "待核实"}`));
        block.append(node("p", "", `作品：${(row.work_requirements || []).map((fact) => textOf(fact.value)).join("；") || "待核实"}`));
        block.append(node("p", "", row.key_gap));
        comparison.append(block);
      });
      output.append(comparison);
    }
    if (payload.notice) output.append(node("p", "agent-notice", payload.notice));
    if ((payload.partial_failures || []).length) output.append(node("p", "agent-notice", `部分补查未完成：${payload.partial_failures.join("；")}`));
    const actions = node("div", "agent-output-actions");
    const compare = node("button", "agent-secondary", "比较所选项目");
    compare.type = "button";
    compare.dataset.agentCompare = "";
    compare.disabled = true;
    compare.addEventListener("click", () => submit("请比较这些机会的截止、费用、资格和作品要求。", { compare_result_refs: [...selected], parent_turn_id: current?.turn_id, mode: "library" }));
    const saveMenu = node("div", "agent-save-menu");
    const save = node("button", "agent-secondary", "保存这份清单");
    save.type = "button";
    save.setAttribute("aria-expanded", "false");
    save.setAttribute("aria-controls", "ich-agent-save-options");
    const saveOptions = node("div", "agent-save-options");
    saveOptions.id = "ich-agent-save-options";
    saveOptions.hidden = true;
    save.addEventListener("click", () => {
      saveOptions.hidden = !saveOptions.hidden;
      save.setAttribute("aria-expanded", String(!saveOptions.hidden));
      save.textContent = saveOptions.hidden ? "保存这份清单" : "收起清单选项";
    });
    const download = node("button", "agent-secondary", "下载Markdown");
    download.type = "button";
    download.addEventListener("click", () => {
      updatePrintSheet(results, evidenceById);
      const data = buildChecklist(results, evidenceById);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([data], { type: "text/markdown;charset=utf-8" }));
      link.download = "盯非遗-行动核对清单.md";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    const copy = node("button", "agent-secondary", "复制文字");
    copy.type = "button";
    const copyStatus = node("span", "agent-copy-status");
    copyStatus.setAttribute("role", "status");
    copyStatus.setAttribute("aria-live", "polite");
    const copyFallback = node("textarea", "ich-reading-fallback");
    copyFallback.readOnly = true;
    copyFallback.hidden = true;
    copyFallback.setAttribute("aria-label", "行动清单文本，已全选，可复制");
    copy.addEventListener("click", async () => {
      const data = buildChecklist(results, evidenceById);
      try {
        if (!navigator.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
        await navigator.clipboard.writeText(data);
        copyFallback.hidden = true;
        copyStatus.textContent = "清单已复制。";
      } catch {
        copyFallback.value = data;
        copyFallback.hidden = false;
        copyFallback.focus();
        copyFallback.select();
        copyFallback.setSelectionRange(0, copyFallback.value.length);
        copyStatus.textContent = "浏览器未允许自动复制，清单文本已全选；请按 Ctrl+C（Mac 按 ⌘C）复制。";
      }
    });
    const print = node("button", "agent-secondary", "打印清单");
    print.type = "button";
    print.addEventListener("click", () => { updatePrintSheet(results, evidenceById); window.print(); });
    saveOptions.append(copy, download, print, copyStatus, copyFallback);
    saveMenu.append(save, saveOptions);
    actions.append(compare, saveMenu);
    if (results.length) output.append(actions);
    updatePrintSheet(results, evidenceById);
    status.textContent = `已查找 ${results.length} 条；${payload.tool_receipt?.library_used ? "已检查机会库" : "未查询机会库"}。${payload.as_of ? `核对时间：${new Date(payload.as_of).toLocaleString("zh-CN")}` : ""}`;
  };
  const submit = async (message, extra = {}) => {
    if (!message?.trim()) { input.focus(); return; }
    clearSession.hidden = false;
    status.textContent = "正在查找已收录机会…";
    root.querySelector("button[type=submit]").disabled = true;
    try {
      const response = await fetch("/api/public/ich/agent/query", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId(), message: message.slice(0, 2000), mode: mode?.value || "auto", ...extra }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.code || "REQUEST_FAILED");
      render(payload);
    } catch (error) {
      output.replaceChildren(node("p", "agent-error", error.message === "ORIGIN_NOT_ALLOWED" ? "请求来源未获允许，请刷新页面后重试。" : "暂时无法完成查找，请稍后再试。"));
      status.textContent = "查找未完成";
    } finally {
      root.querySelector("button[type=submit]").disabled = false;
    }
  };
  clearSession.addEventListener("click", async () => {
    if (!window.confirm("清空本次临时对话吗？只会清除当前临时结果，不会删除机会库记录。")) return;
    clearSession.disabled = true;
    try {
      const response = await fetch("/api/public/ich/agent/session", { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw new Error("CLEAR_FAILED");
      current = null;
      shownAll = false;
      selected = new Set();
      input.value = "";
      output.replaceChildren();
      printText.replaceChildren();
      printSheet.hidden = true;
      clearSession.hidden = true;
      status.textContent = "本次临时对话已清空；正式机会记录未受影响。";
      input.focus();
    } catch {
      status.textContent = "暂时无法清空本次对话，请稍后重试。";
    } finally { clearSession.disabled = false; }
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); submit(input.value); });
  input.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); submit(input.value); }
  });
  root.querySelectorAll("[data-agent-example]").forEach((button) => button.addEventListener("click", () => {
    input.value = button.dataset.agentExample || "";
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }));
  fetch("/api/public/ich/agent/status", { credentials: "same-origin" }).then((response) => response.json()).then((value) => {
    if (!value.enabled) status.textContent = "机会助手暂不可用。";
    else status.textContent = value.web_available ? "先查已收录机会；需要时可按当日预算联网补查。" : "先查已收录机会；联网补查尚未启用，不会产生外部调用费用。";
  }).catch(() => { status.textContent = "先查已收录机会；联网补查状态暂不可读取。"; });
})();
