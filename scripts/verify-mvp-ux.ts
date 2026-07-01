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
const userContext = read("src/agents/user-context.ts");

check("首页标题更直白", html.includes("告诉我你想盯什么机会"));
check("首页副标题说明本周机会", html.includes("AI 会帮你找出本周值得行动的机会"));
check("首页主按钮文案为盯机会", html.includes("盯机会") || homeJs.includes("盯机会"));
check("首页含先看结果再保存的辅助文案", html.includes("先看结果，觉得有用再保存为长期雷达"));
check("首页说明可以直接说一段话", html.includes("你可以直接说一段话"));
check("首页不再显示选择雷达文案", !html.includes("选择雷达："));
check("附件按钮说明文件作为画像补充", homeJs.includes("文件会作为画像补充材料使用，不会直接当作机会结果。"));
check("模板入口文案为试试看这些例子", html.includes("试试看这些例子") || homeJs.includes("试试看这些例子"));
check(
  "可见主导航包含三个客户入口",
  /data-tab="home"/.test(html) && /data-tab="watch-result"/.test(html) && /data-tab="radars"/.test(html),
);
check("结果页 panel 存在", html.includes('id="panel-watch-result"'));
check("watch-result.js 被引入", html.includes("/watch-result.js"));
check("模板文件被引入", html.includes("/mvp-templates.js"));
check("画像确认脚本被引入", html.includes("/radar-profile.js"));
check("source hints 脚本被引入", html.includes("/source-hints.js"));
check("自由输入走画像确认", homeJs.includes("createRadarProfileDraft") || profileJs.includes("createRadarProfileDraft"));
check("模板含预置画像", templatesJs.includes("profile") && templatesJs.includes("用户身份"));
check("画像确认支持指定信号源", profileJs.includes("source-hints-input") || sourceHintsJs.includes("applySourceHintsToSpec"));
check("画像确认卡标题是自然语言理解", profileJs.includes("我理解你想建立这样的机会雷达"));
check("画像确认卡展示你是/你想盯/优先看/排除/指定信号源", ["你是", "你想盯", "优先看", "排除", "指定信号源"].every((text) => profileJs.includes(text)));
check("画像优先范围不重复显示", profileJs.includes("regionText === timeText") && profileJs.includes("范围："));
check("画像确认展示默认假设", profileJs.includes('renderProfileField("默认假设"'));
check("画像确认主按钮文案正确", profileJs.includes("确认，开始盯机会"));
check("画像确认次按钮文案正确", profileJs.includes("我再改一下"));
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
check("用户回答后重新生成画像", profileJs.includes("clarificationAnswer") && profileJs.includes("/api/radars/generate"));
check("结果页按画像运行", watchResultJs.includes("profile") && watchResultJs.includes("spec"));
check("模板路径允许调整画像", watchResultJs.includes("调整画像") && profileJs.includes("showRadarProfileDraftFromResult"));
check("含正在搜索机会 loading", watchResultJs.includes("正在搜索机会"));
check("含正在生成机会报告 loading", watchResultJs.includes("正在生成机会报告"));
check("机会卡片按用户关心顺序渲染", ["为什么适合你", "截止时间", "建议动作"].every((text) => watchResultJs.includes(text)));
check("机会卡片展示四维状态标签", ["watch-card-meta", "opportunity_kind", "evidence_status", "action_status"].every((text) => watchResultJs.includes(text)));
check("机会卡片能把 mock 显示为演示来源", watchResultJs.includes("演示来源，未真实核验") && watchResultJs.includes("来源说明"));
check("来源检查状态覆盖新旧口径", ["checked_with_results", "checked_no_results", "not_checked", "invalid_url", "name_only"].every((text) => watchResultJs.includes(text)));
check("Markdown 报告默认摘要并可展开", watchResultJs.includes("报告摘要") && watchResultJs.includes("查看完整 Markdown 报告"));
check("Markdown 支持复制", watchResultJs.includes("复制 Markdown"));
check("保存按钮文案说明持续盯", watchResultJs.includes("保存为长期雷达，之后持续盯"));
check("保存说明解释下次不用重新描述", watchResultJs.includes("下次不用重新描述，系统会按这个画像继续找机会"));
check("保存成功反馈说明绑定我的雷达", watchResultJs.includes("已保存为长期雷达。本次机会和报告已经绑定到我的雷达。") && watchResultJs.includes("save-success"));
check("保存成功后提供详情和列表两个选择", ["查看本次雷达详情", "返回我的雷达列表", "btn-view-saved-radar-detail", "btn-back-to-radar-list"].every((text) => watchResultJs.includes(text)));
check("保存成功后不自动跳转我的雷达", !watchResultJs.includes("已保存为长期雷达，并生成了绑定报告\", \"success\");\n      window.setTimeout"));
check("空结果页含可行动建议", ["放宽地区", "减少排除条件", "增加指定信号源", "保存为长期雷达继续监控"].every((text) => watchResultJs.includes(text)));
check("我的雷达卡片使用客户语言入口", ["画像摘要", "上次运行时间", "上次运行状态", "查看机会和报告", "再次盯机会"].every((text) => radarsJs.includes(text)));
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
check("结果页样式存在", styles.includes(".watch-result"));
check("详情页支持历史报告", radarDetailJs.includes("loadReportHistory"));
check("免费用户可拥有 3 个自定义雷达", userContext.includes("free: 3"));

console.log(`MVP UX: ${passed} PASS / ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
