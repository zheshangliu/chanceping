import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;

function read(rel: string): string {
  const abs = path.resolve(process.cwd(), rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : "";
}

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const html = read("web/index.html");
const homeJs = read("web/home.js");
const templatesJs = read("web/mvp-templates.js");
const profileJs = read("web/radar-profile.js");
const sourceHintsJs = read("web/source-hints.js");
const watchResultJs = read("web/watch-result.js");
const radarsJs = read("web/radars.js");
const styles = read("web/styles.css");
const radarDetailJs = read("web/radar-detail.js");
const reportGenerator = read("src/agents/radar-report-generator.ts");
const radarsRoute = read("src/api/routes/radars.ts");
const userContext = read("src/agents/user-context.ts");

check("首页聚焦 AI 赛事雷达", html.includes("AI 赛事雷达"));
check("首页主提示词直白", html.includes("今天你想找什么机会？"));
check("首页副标题说明聊天式机会雷达", html.includes("像聊天一样说清楚你想找的 AI 比赛"));
check("首页主按钮文案为开始画雷达", html.includes("开始画雷达") || homeJs.includes("开始画雷达"));
check("首页说明确认雷达后再搜索", html.includes("你确认雷达后，系统才会开始搜索"));
check("首页包含单雷达聊天工作台", html.includes("hero-radar-chat-root") && html.includes("/hero-radar-chat.js"));
check("首页不再显示选择雷达文案", !html.includes("选择雷达："));
check("首页主输入隐藏附件上传入口", /id="home-attach-btn"[^>]*hidden/.test(html));
check("旧模板入口不作为 Hero 主路径", homeJs.includes("hideLegacyTemplatesForHero();"));
check(
  "可见主导航包含三个客户入口",
  /data-tab="home"/.test(html) && /data-tab="watch-result"/.test(html) && /data-tab="radars"/.test(html),
);
check("结果页 panel 存在", html.includes('id="panel-watch-result"'));
check("watch-result.js 被引入", html.includes("/watch-result.js"));
check("模板文件被引入", html.includes("/mvp-templates.js"));
check("画像确认脚本被引入", html.includes("/radar-profile.js"));
check("source hints 脚本被引入", html.includes("/source-hints.js"));
check("自由输入优先进入 hero chat", homeJs.includes("window.startHeroRadarChat") && homeJs.includes("startHeroRadarChat(text"));
check("旧画像确认逻辑仍保留兼容", homeJs.includes("createRadarProfileDraft") || profileJs.includes("createRadarProfileDraft"));
check("模板含预置画像", templatesJs.includes("profile") && templatesJs.includes("用户身份"));
check("画像确认支持指定信号源", profileJs.includes("source-hints-input") || sourceHintsJs.includes("applySourceHintsToSpec"));
check("雷达版本卡标题升级为 V1.0 策略", profileJs.includes("雷达 V1.0 策略卡") || profileJs.includes("雷达 ${escapeHtml(radarVersion.version)} 策略卡"));
check("雷达版本卡展示执行策略", ["这版雷达会盯什么", "不盯什么", "优先看哪些来源", "什么算高价值", "会按哪些搜索主题去找", "缺哪些信息", "默认假设"].every((text) => profileJs.includes(text)));
check("画像优先范围不重复显示", profileJs.includes("regionText === timeText") && profileJs.includes("范围："));
check("画像确认展示默认假设", profileJs.includes('renderProfileField("默认假设"'));
check("雷达版本确认主按钮文案正确", profileJs.includes("确认，按 V1.0 盯一次") || profileJs.includes("确认，按 ${escapeHtml(radarVersion.version)} 盯一次"));
check("雷达版本确认次按钮文案正确", profileJs.includes("继续修改雷达"));
check("Q7 revision API is called from profile UI", profileJs.includes("/api/radars/revise"));
check("Q7 revision card explains version diff", profileJs.includes("本次版本变化") || profileJs.includes("radarDiff"));
check("Q7 continue modify explains radar upgrade", profileJs.includes("升级雷达") || profileJs.includes("先升级雷达"));
check("Q7 profile UI can receive result feedback", profileJs.includes("showRadarRevisionFromResultFeedback"));
check("画像确认不直接展示技术字段", !profileJs.includes("providerRouting") && !profileJs.includes("provider_routing"));
check("含正在理解你的需求 loading", profileJs.includes("正在理解你的需求"));
check("澄清闸门标题正确", profileJs.includes("我还需要确认几个关键点"));
check("澄清闸门说明正确", profileJs.includes("这样可以让机会雷达盯得更准"));
check("澄清闸门主按钮正确", profileJs.includes("回答后生成雷达画像"));
check("澄清闸门次按钮正确", profileJs.includes("先按默认理解继续"));
check("澄清闸门最多 2 轮", profileJs.includes("MAX_CLARIFICATION_ROUNDS = 2"));
check("澄清闸门一次只展示 1 个问题", profileJs.includes("MAX_VISIBLE_CLARIFICATION_QUESTIONS = 1") || profileJs.includes("slice(0, 1)"));
check("澄清闸门客户侧一次只展示 1 个自然追问", profileJs.includes("slice(0, 1)") || profileJs.includes("MAX_VISIBLE_CLARIFICATION_QUESTIONS"));
check("澄清闸门包含 85/60 阈值", profileJs.includes("CLARITY_DIRECT_THRESHOLD = 85") && profileJs.includes("CLARITY_BACKGROUND_THRESHOLD = 60"));
check("澄清闸门复用后端 questions_to_confirm", profileJs.includes("questions_to_confirm") && profileJs.includes("requirement_confidence"));
check("澄清闸门支持前端兜底问题", profileJs.includes("buildFallbackQuestions"));
check("澄清闸门优先策略型追问", profileJs.includes("buildStrategyClarificationQuestions") && profileJs.includes("搜索策略定准"));
check("用户回答后重新生成画像", profileJs.includes("clarificationAnswer") && profileJs.includes("/api/radars/generate"));
check("结果页按画像运行", watchResultJs.includes("profile") && watchResultJs.includes("spec"));
check("本地 live search 通过 URL/localStorage 显式开启", homeJs.includes("live_search") && homeJs.includes("chanceping_live_search") && homeJs.includes("getChancePingSearchMode"));
check("产品主路径可透传 search_mode=live", watchResultJs.includes("getSearchModeRequest") && watchResultJs.includes("search_mode: \"live\"") && radarsJs.includes("getSearchModeRequest") && radarDetailJs.includes("getSearchModeRequest"));
check("保存长期雷达会记住本地 live 试跑偏好", watchResultJs.includes("preferredSearchMode: \"live\"") && radarsRoute.includes("radar.preferredSearchMode"));
check("模板路径允许调整雷达画像", watchResultJs.includes("调整雷达画像") && profileJs.includes("showRadarProfileDraftFromResult"));
check("含正在搜索机会 loading", watchResultJs.includes("正在搜索机会"));
check("含正在生成机会报告 loading", watchResultJs.includes("正在生成机会报告"));
check("机会卡片按用户关心顺序渲染", [
  "为什么值得看",
  "本周先做",
  "截止时间",
  "来源入口",
].every((text) => watchResultJs.includes(text)));
check("机会卡片展示客户决策标签", ["watch-card-decision-row", "getPriorityCue", "优先复核"].every((text) => watchResultJs.includes(text)));
check("机会卡片能把 mock 显示为演示来源", watchResultJs.includes("演示来源，未真实核验") && watchResultJs.includes("来源入口"));
check("来源检查状态覆盖新旧口径", ["checked_with_results", "checked_no_results", "not_checked", "invalid_url", "name_only"].every((text) => watchResultJs.includes(text)));
check("live 失败或结果不足提示可切回演示数据", watchResultJs.includes("Live 真实搜索失败") && watchResultJs.includes("切回演示数据查看流程"));
check("失败或无结果仍可保存雷达", watchResultJs.includes("本轮真实搜索结果不足，但雷达已生成") && watchResultJs.includes("runOutcome") && watchResultJs.includes("保存为长期雷达"));
check("失败或无结果提供调整策略和重试搜索", watchResultJs.includes("调整雷达策略") && watchResultJs.includes("重试搜索"));
check("Q7 result page has unified radar feedback entry", watchResultJs.includes("调整雷达画像") && watchResultJs.includes("openRadarResultFeedback"));
check("Q7 result feedback dispatches radar revision", watchResultJs.includes("openRadarResultFeedback"));
check("Markdown 报告默认摘要并可展开", watchResultJs.includes("报告摘要") && watchResultJs.includes("查看完整 Markdown 报告"));
check("Markdown 支持复制", watchResultJs.includes("复制 Markdown"));
check("保存按钮文案说明持续盯", watchResultJs.includes("保存为长期雷达，之后持续盯"));
check("保存说明解释下次不用重新描述", watchResultJs.includes("下次不用重新描述，系统会按这个画像继续找机会"));
check("保存成功反馈说明绑定我的雷达", watchResultJs.includes("已保存为长期雷达。本次机会和报告已经绑定到我的雷达。") && watchResultJs.includes("save-success"));
check("保存成功后提供详情和列表两个选择", ["查看本次雷达详情", "返回我的雷达列表", "btn-view-saved-radar-detail", "btn-back-to-radar-list"].every((text) => watchResultJs.includes(text)));
check("保存成功后不自动跳转我的雷达", !watchResultJs.includes("已保存为长期雷达，并生成了绑定报告\", \"success\");\n      window.setTimeout"));
check("空结果页含可行动建议", ["放宽地区", "减少排除条件", "增加指定信号源", "保存为长期雷达继续监控"].every((text) => watchResultJs.includes(text)));
check(
  "我的雷达卡片使用客户语言入口",
  ["情报流摘要", "上次已完成", "还没跑过", "编辑雷达", "再次盯机会", "查看机会和报告", "删除雷达"].every((text) => radarsJs.includes(text))
    && !radarsJs.includes("上次运行状态")
);
check("我的雷达卡片不展示 Provider 调试字段", !radarsJs.includes("radar-providers"));
check("再次盯机会会自动生成报告", radarsJs.includes("/api/reports/generate") && radarsJs.includes("run_id") && radarsJs.includes("reportId"));
check("再次盯机会状态文案完整", ["正在重新盯机会", "正在生成报告", "已生成新报告", "查看本次报告"].every((text) => radarsJs.includes(text)));
check("再次盯机会报告失败不丢机会", radarsJs.includes("机会已更新，报告生成失败，可重试生成报告"));
check("雷达详情页有客户化再次盯入口", ["返回我的雷达", "再次盯机会", "正在生成报告", "/api/reports/generate"].every((text) => radarDetailJs.includes(text)));
check("我的雷达只请求当前用户长期雷达", radarsJs.includes("/api/radars?scope=mine"));
check("我的雷达额外过滤内置模板", radarsJs.includes("radar.isBuiltin !== true"));
check("我的雷达空状态引导回首页", radarsJs.includes("还没有保存长期雷达") && radarsJs.includes("回首页建立雷达"));
check("我的雷达旧创建入口改为建立新雷达", html.includes("建立新雷达") && !html.includes("+ 创建雷达") && !html.includes("✨ AI 生成"));
check("客户路径隔离隐藏旧模块", homeJs.includes("detachAdvancedPanelsForCustomerPath") && ["panel-chat", "panel-search", "panel-opportunities", "panel-reports", "panel-editor"].every((id) => homeJs.includes(id)));
check("我的雷达卡片支持软删除", radarsJs.includes("删除雷达") && radarsJs.includes('method: "DELETE"') && radarsJs.includes("confirm("));
check("删除雷达后刷新列表和配额", radarsJs.includes("loadRadarList()") && radarsJs.includes("loadQuotaInfo()"));
check("雷达详情展示画像机会报告", radarDetailJs.includes("雷达画像摘要") && radarDetailJs.includes("已入库机会") && radarDetailJs.includes("历史报告") && radarDetailJs.includes("reportId"));
check("雷达详情不会把 mock 来源渲染成可点击官网", radarDetailJs.includes("演示来源，未真实核验") && radarDetailJs.includes("source_disclaimer"));
check("报告模板包含雷达画像", reportGenerator.includes("## 1. 雷达画像"));
check("报告模板包含指定信号源", reportGenerator.includes("指定信号源"));
check("报告模板声明 mock 演示数据未真实核验", reportGenerator.includes("演示 / 测试数据") && reportGenerator.includes("未真实核验"));
check("报告模板区分搜索来源、已核验事实、模型判断、待复核项", ["### 搜索到的来源", "### 字段已核验事实", "### 模型判断", "### 待复核项"].every((text) => reportGenerator.includes(text)));
check("报告模板区分失败来源和未检查来源", ["### 失败来源", "### 未检查来源"].every((text) => reportGenerator.includes(text)));
check("报告模板区分低行动性观察来源", reportGenerator.includes("### 低行动性观察来源"));
check("结果页样式存在", styles.includes(".watch-result"));
check("详情页支持历史报告", radarDetailJs.includes("loadReportHistory"));
check("免费用户可拥有 3 个自定义雷达", userContext.includes("free: 3"));

console.log(`MVP UX: ${passed} PASS / ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
