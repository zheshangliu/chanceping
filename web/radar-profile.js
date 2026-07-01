(function () {
  "use strict";

  let currentDraft = null;
  const CLARITY_DIRECT_THRESHOLD = 85;
  const CLARITY_BACKGROUND_THRESHOLD = 60;
  const MAX_CLARIFICATION_ROUNDS = 2;
  const MAX_VISIBLE_CLARIFICATION_QUESTIONS = 1;

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

  function arrayText(value) {
    return Array.isArray(value) ? value.filter(Boolean).join("、") : String(value || "未明确");
  }

  function uniqueTextList(items) {
    return Array.from(new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean)));
  }

  function profileFromSpec(spec, fallbackProfile) {
    if (fallbackProfile && typeof fallbackProfile === "object") return fallbackProfile;
    const cp = spec?.client_profile || {};
    const goals = spec?.core_goals || {};
    const scope = spec?.opportunity_scope || {};
    const region = spec?.region_scope || {};
    const filter = spec?.filter_rules || {};
    const sources = spec?.source_strategy || {};
    const sourceHints = uniqueTextList([
      ...(sources.user_supplied_sources || []).map((item) => item.source_url || item.source_name),
      ...(sources.manual_sources || []),
    ]);
    return {
      用户身份: cp.business_type || cp.client_type || "未明确",
      关注机会: uniqueTextList(scope.primary_opportunity_types || []),
      地域范围: uniqueTextList([...(region.primary_regions || []), ...(region.secondary_regions || [])]),
      时间范围: goals.success_definition || "近期可行动机会",
      指定信号源: sourceHints,
      排除内容: uniqueTextList([...(scope.excluded_opportunity_types || []), ...(filter.must_exclude || [])]),
      排序偏好: uniqueTextList(goals.priority_order || []),
    };
  }

  function profileFromBackendSummary(summary) {
    if (!summary || typeof summary !== "object") return null;
    return {
      用户身份: summary.identity || "未明确",
      关注机会: summary.target ? [summary.target] : [],
      地域范围: summary.regionsAndTime || "未明确",
      时间范围: summary.regionsAndTime || "近期可行动机会",
      指定信号源: summary.sourceHints || [],
      排除内容: summary.exclusions || [],
      排序偏好: summary.priorities || [],
      默认假设: summary.assumptions || [],
    };
  }

  function sourceHintTextFromProfile(profile) {
    const sources = profile?.指定信号源;
    return Array.isArray(sources) ? sources.join("\n") : String(sources || "");
  }

  function hasAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function assessRequirementClarity(description, generatedData) {
    const text = String(description || "");
    const backendCompleteness = Number(generatedData?.completeness || 0);
    const backendConfidence = Number(generatedData?.requirementConfidence || generatedData?.spec?.requirement_confidence?.total || 0);
    const signals = {
      identity: hasAny(text, [/我是|我们是|我代表|用户是/, /选手|学生|家长|公司|机构|团队|老师|顾问|猎头|财税|创业者|创作者/]),
      opportunityType: hasAny(text, [/比赛|竞赛|大赛|申报|补贴|客户线索|招聘|岗位|投标|展会|奖项|赛事/]),
      region: hasAny(text, [/中国|国内|国外|海外|全球|国际|城市|北京|上海|广州|深圳|杭州|香港|澳门|台湾|华东|华南|华北|国内外/]),
      timeWindow: hasAny(text, [/本周|本月|未来\s*\d+\s*天|未来30天|长期|每天|每周|近期|可报名|截止|即将/]),
      actionPurpose: hasAny(text, [/报名|参赛|申报|申请|销售|投递|联系|获客|做内容|投稿|收藏|跟进|监控/]),
      sourceOrExclude: hasAny(text, [/排除|不要|不想要|优先看|官网|平台|来源|指定|广告|ITTF|WTT|中国乒协|Kaggle|天池|政府|协会/]),
    };
    const frontendScore = [
      signals.identity ? 20 : 0,
      signals.opportunityType ? 20 : 0,
      signals.region ? 15 : 0,
      signals.timeWindow ? 15 : 0,
      signals.actionPurpose ? 15 : 0,
      signals.sourceOrExclude ? 15 : 0,
    ].reduce((sum, value) => sum + value, 0);
    const backendQuestions = normalizeBackendQuestions(generatedData?.questionsToConfirm || generatedData?.spec?.questions_to_confirm);
    const backendScore = Math.min(100, Math.max(backendCompleteness, backendConfidence || 0));
    const score = backendConfidence > 0 ? Math.round(backendConfidence) : Math.min(100, Math.round(Math.max(frontendScore, backendScore)));
    const fallbackQuestions = backendQuestions.length > 0 ? [] : buildFallbackQuestions(signals, score);
    const questions = [...backendQuestions, ...fallbackQuestions]
      .filter((question, index, arr) => arr.findIndex((item) => item.key === question.key || item.question === question.question) === index)
      .slice(0, MAX_VISIBLE_CLARIFICATION_QUESTIONS);
    return {
      score,
      signals,
      questions,
      shouldAsk: score < CLARITY_DIRECT_THRESHOLD && questions.length > 0,
      needsBackground: score < CLARITY_BACKGROUND_THRESHOLD,
      defaultAssumptions: buildDefaultAssumptions(signals),
    };
  }

  function normalizeBackendQuestions(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item, index) => ({
        key: item.id || item.related_field || item.field || `backend_${index}`,
        question: item.question || item.hint || String(item || ""),
      }))
      .filter((item) => item.question.trim());
  }

  function buildFallbackQuestions(signals, score) {
    const questions = [];
    if (!signals.identity) {
      questions.push({ key: "identity", question: "你是谁或代表什么角色？例如：乒乓球选手、学生家长、财税公司。" });
    }
    if (!signals.region || !signals.timeWindow) {
      questions.push({ key: "scope", question: "你希望优先看哪些地区和时间窗口？例如：国内外、未来30天、本周可报名。" });
    }
    if (!signals.actionPurpose || !signals.sourceOrExclude) {
      questions.push({ key: "action_source", question: "你希望拿到机会后做什么？有哪些官网、平台或排除条件要优先考虑？" });
    }
    if (score < CLARITY_BACKGROUND_THRESHOLD && questions.length < MAX_VISIBLE_CLARIFICATION_QUESTIONS) {
      questions.push({ key: "background", question: "请补充一句背景，让我知道你为什么要盯这些机会。" });
    }
    return questions.slice(0, MAX_VISIBLE_CLARIFICATION_QUESTIONS);
  }

  function buildDefaultAssumptions(signals) {
    const assumptions = [];
    if (!signals.identity) assumptions.push("默认你是个人用户或代表自己寻找机会");
    if (!signals.region) assumptions.push("默认同时关注中国和海外线上机会");
    if (!signals.timeWindow) assumptions.push("默认优先看未来30天内可行动机会");
    if (!signals.actionPurpose) assumptions.push("默认行动目的是报名、申请或进一步联系官方来源");
    if (!signals.sourceOrExclude) assumptions.push("默认排除广告、旧新闻和已截止信息");
    return assumptions;
  }

  function priorityText(profile) {
    const parts = [];
    const regionText = profile?.地域范围 ? arrayText(profile.地域范围) : "";
    const timeText = profile?.时间范围 ? arrayText(profile.时间范围) : "";
    if (regionText && regionText === timeText) {
      parts.push(`范围：${regionText}`);
    } else {
      if (regionText) parts.push(`地区：${regionText}`);
      if (timeText) parts.push(`时间：${timeText}`);
    }
    if (profile?.排序偏好) parts.push(`排序：${arrayText(profile.排序偏好)}`);
    return parts.length > 0 ? parts.join("；") : "本周可行动、来源可靠、适合你参与的机会";
  }

  function renderProfileCard(draft) {
    const root = document.getElementById("watch-result-root");
    if (!root) return;
    const profile = draft.profile || {};
    root.innerHTML = `
      <section class="radar-profile-card">
        <div class="watch-result-header">
          <h3>我理解你想建立这样的机会雷达</h3>
          <p>${escapeHtml(draft.description)}</p>
        </div>
        <div class="radar-profile-grid">
          ${renderProfileField("你是", profile.用户身份)}
          ${renderProfileField("你想盯", profile.关注机会)}
          ${renderProfileField("优先看", priorityText(profile))}
          ${renderProfileField("排除", profile.排除内容)}
          ${renderProfileField("指定信号源", profile.指定信号源)}
          ${(profile.默认假设 || []).length ? renderProfileField("默认假设", profile.默认假设) : ""}
        </div>
        <label class="source-hints-field" for="source-hints-input">
          <span>指定信号源（可选）</span>
          <textarea id="source-hints-input" rows="4" placeholder="每行一个官网、网址或平台名称&#10;https://www.ittf.com/&#10;https://worldtabletennis.com/&#10;中国乒协官网">${escapeHtml(sourceHintTextFromProfile(profile))}</textarea>
        </label>
        <div class="radar-profile-actions">
          <button id="btn-confirm-radar-profile" class="btn-primary">确认，开始盯机会</button>
          <button id="btn-edit-radar-profile">我再改一下</button>
        </div>
      </section>
    `;
    document.getElementById("btn-confirm-radar-profile")?.addEventListener("click", confirmRadarProfile);
    document.getElementById("btn-edit-radar-profile")?.addEventListener("click", () => {
      const input = document.getElementById("home-input");
      if (input) input.value = currentDraft?.description || "";
      if (window.switchTab) window.switchTab("home");
    });
  }

  function renderClarificationGate(draft) {
    const root = document.getElementById("watch-result-root");
    if (!root) return;
    const questions = (draft.clarification?.questions || []).slice(0, MAX_VISIBLE_CLARIFICATION_QUESTIONS);
    const guidance = draft.clarification?.needsBackground
      ? "你的描述还比较短，请补充一句背景；如果着急，也可以先按默认理解继续。"
      : "这样可以让机会雷达盯得更准";
    root.innerHTML = `
      <section class="radar-profile-card clarification-card">
        <div class="watch-result-header">
          <h3>我还需要确认几个关键点</h3>
          <p>${escapeHtml(guidance)}</p>
        </div>
        <div class="clarification-question-list">
          ${questions.map((item, index) => `
            <label class="clarification-question" for="clarification-answer">
              <span>${index + 1}. ${escapeHtml(item.question)}</span>
            </label>
          `).join("")}
        </div>
        <textarea id="clarification-answer" class="clarification-answer" rows="4" placeholder="例如：我是乒乓球选手，想看未来30天内国内外可报名比赛，优先 ITTF、WTT、中国乒协，排除培训广告"></textarea>
        <div class="radar-profile-actions">
          <button id="btn-submit-clarification" class="btn-primary">回答后生成雷达画像</button>
          <button id="btn-continue-default">先按默认理解继续</button>
        </div>
      </section>
    `;
    document.getElementById("btn-submit-clarification")?.addEventListener("click", submitClarificationAnswer);
    document.getElementById("btn-continue-default")?.addEventListener("click", continueWithDefaultUnderstanding);
  }

  function renderProfileField(label, value) {
    return `
      <div class="radar-profile-field">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(arrayText(value))}</strong>
      </div>
    `;
  }

  async function createRadarProfileDraft({ description }) {
    switchToResult();
    const root = document.getElementById("watch-result-root");
    if (root) {
      root.innerHTML = `
        <div class="watch-loading-card">
          <strong>正在理解你的需求</strong>
          <p>AI 正在把你的描述整理成可复用的机会雷达画像。</p>
        </div>
      `;
    }
    const gen = await postJson("/api/radars/generate", { description });
    const spec = gen.data.spec;
    const clarification = assessRequirementClarity(description, gen.data);
    currentDraft = {
      description,
      spec,
      profile: profileFromBackendSummary(gen.data.profileSummary) || profileFromSpec(spec),
      suggestedName: gen.data.suggestedName || "我的机会雷达",
      questions: gen.data.questionsToConfirm || spec.questions_to_confirm || [],
      clarification,
      clarificationRounds: 0,
    };
    if (clarification.shouldAsk) {
      renderClarificationGate(currentDraft);
      return;
    }
    renderProfileCard(currentDraft);
  }

  async function runTemplateWatch(template) {
    if (!template) return;
    const description = template.description || "";
    switchToResult();
    const gen = await postJson("/api/radars/generate", { description });
    const sourceText = sourceHintTextFromProfile(template.profile);
    const spec = window.applySourceHintsToSpec
      ? window.applySourceHintsToSpec(gen.data.spec, sourceText)
      : gen.data.spec;
    await window.runWatchNow?.({
      description,
      spec: markSpecConfirmed(spec),
      profile: template.profile || profileFromBackendSummary(gen.data.profileSummary) || profileFromSpec(spec),
      presetId: template.id,
      suggestedName: `${template.label || gen.data.suggestedName || "示例"}雷达`,
    });
  }

  async function confirmRadarProfile() {
    if (!currentDraft) return;
    const sourceHintText = document.getElementById("source-hints-input")?.value || "";
    const specWithSources = window.applySourceHintsToSpec
      ? window.applySourceHintsToSpec(currentDraft.spec, sourceHintText)
      : currentDraft.spec;
    const confirmedSpec = markSpecConfirmed(specWithSources);
    await window.runWatchNow?.({
      description: currentDraft.description,
      spec: confirmedSpec,
      profile: profileFromSpec(confirmedSpec, currentDraft.profile),
      suggestedName: currentDraft.suggestedName,
    });
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

  async function submitClarificationAnswer() {
    if (!currentDraft) return;
    const clarificationAnswer = document.getElementById("clarification-answer")?.value?.trim() || "";
    if (!clarificationAnswer && currentDraft.clarification?.needsBackground) {
      if (window.showToast) showToast("请先补充一句背景，或选择按默认理解继续", "warning");
      return;
    }
    const combinedDescription = clarificationAnswer
      ? `${currentDraft.description}\n\n[用户补充回答]\n${clarificationAnswer}`
      : currentDraft.description;
    const nextRounds = (currentDraft.clarificationRounds || 0) + 1;
    await regenerateProfileAfterClarification(combinedDescription, clarificationAnswer, nextRounds);
  }

  async function continueWithDefaultUnderstanding() {
    if (!currentDraft) return;
    const defaults = currentDraft.clarification?.defaultAssumptions || [];
    const combinedDescription = defaults.length > 0
      ? `${currentDraft.description}\n\n[默认假设]\n${defaults.join("；")}`
      : currentDraft.description;
    const nextRounds = (currentDraft.clarificationRounds || 0) + 1;
    await regenerateProfileAfterClarification(combinedDescription, defaults.join("；"), nextRounds, true);
  }

  async function regenerateProfileAfterClarification(description, clarificationAnswer, nextRounds, forceDefault) {
    const root = document.getElementById("watch-result-root");
    if (root) {
      root.innerHTML = `
        <div class="watch-loading-card">
          <strong>正在理解你的需求</strong>
          <p>我会把你的原始需求和补充回答合在一起，重新生成雷达画像。</p>
        </div>
      `;
    }
    const gen = await postJson("/api/radars/generate", { description });
    const spec = gen.data.spec;
    const clarification = assessRequirementClarity(description, gen.data);
    if (forceDefault || nextRounds >= MAX_CLARIFICATION_ROUNDS) {
      clarification.shouldAsk = false;
      clarification.defaultAssumptions = [
        ...(clarification.defaultAssumptions || []),
        "已达到两轮澄清上限，剩余不确定项按默认理解继续",
      ];
    }
    currentDraft = {
      description,
      clarificationAnswer,
      spec,
      profile: profileFromBackendSummary(gen.data.profileSummary) || profileFromSpec(spec),
      suggestedName: gen.data.suggestedName || currentDraft?.suggestedName || "我的机会雷达",
      questions: gen.data.questionsToConfirm || spec.questions_to_confirm || [],
      clarification,
      clarificationRounds: nextRounds || 0,
    };
    if (clarification.shouldAsk) {
      renderClarificationGate(currentDraft);
      return;
    }
    renderProfileCard(currentDraft);
  }

  function showRadarProfileDraftFromResult(result) {
    if (!result) return;
    switchToResult();
    currentDraft = {
      description: result.description || "",
      spec: result.spec,
      profile: result.profile || profileFromSpec(result.spec),
      suggestedName: result.suggestedName || "我的机会雷达",
      questions: [],
      clarification: { score: 100, questions: [], shouldAsk: false, needsBackground: false, defaultAssumptions: [] },
      clarificationRounds: 0,
    };
    renderProfileCard(currentDraft);
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

  window.createRadarProfileDraft = createRadarProfileDraft;
  window.confirmRadarProfile = confirmRadarProfile;
  window.runTemplateWatch = runTemplateWatch;
  window.showRadarProfileDraftFromResult = showRadarProfileDraftFromResult;
})();
