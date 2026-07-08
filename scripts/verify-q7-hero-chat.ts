import { existsSync, readFileSync } from "node:fs";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

async function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  const response = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json() as { success: boolean; data?: any; error?: any };
  check(`${path} returns 200`, response.status === 200, String(response.status));
  check(`${path} succeeds`, json.success === true, JSON.stringify(json.error ?? {}));
  return json.data;
}

async function run() {
  const html = read("web/index.html");
  const heroChatJs = read("web/hero-radar-chat.js");
  const homeJs = read("web/home.js");
  const radarsJs = read("web/radars.js");
  const watchResultJs = read("web/watch-result.js");
  const radarProfileJs = read("web/radar-profile.js");
  const searchJs = read("web/search.js");
  const watchRulesEditorJs = read("web/watch-rules-editor.js");
  const radarDetailJs = read("web/radar-detail.js");
  const styles = read("web/styles.css");
  const webUiRoute = read("src/api/routes/web-ui.ts");
  const apiApp = read("src/api/app.ts");
  const radarJobsRoute = read("src/api/routes/radar-jobs.ts");

  check("hero chat script exists", existsSync("web/hero-radar-chat.js"));
  check("index loads hero chat script", html.includes("/hero-radar-chat.js"));
  check("web UI serves hero chat script", webUiRoute.includes("/hero-radar-chat.js") && webUiRoute.includes('serveFile("hero-radar-chat.js"'));
  check("index has hero chat root", html.includes("hero-radar-chat-root"));
  check("hero chat root is visible in primary path", /id="hero-radar-chat-root"[^>]*>/.test(html) && !/id="hero-radar-chat-root"[^>]*hidden/.test(html));
  check("home copy uses AI event radar hero demo", html.includes("AI 赛事雷达"));
  check("homepage primary prompt is direct", html.includes("今天你想找什么机会？"));
  const homeInputCount = (html.match(/id="home-input"/g) || []).length;
  check("homepage has exactly one primary home input", homeInputCount === 1, String(homeInputCount));
  check("homepage old chat confirmation input is not part of customer primary path", html.includes('class="tab-btn advanced-tab" data-tab="chat" hidden>需求确认</button>'));
  check("home watch button says AI radar action", html.includes("开始画雷达") || html.includes("开始盯机会"));
  check("homepage includes total-console style radar sidebar", html.includes("home-radar-sidebar") && html.includes("新雷达") && html.includes("全球 AI 赛事导航"));
  check("homepage built-in AI events radar uses customer-facing label", html.includes("V1.0 · 内置导航") && !html.includes("V1.0 · Hero Demo"));
  check("homepage keeps global banner and customer tabs", html.includes('class="top-bar"') && html.includes('data-tab="home"') && html.includes('data-tab="radars"'));
  check("global banner uses full Chinese logo asset", html.includes("ChancePing_cn_logo_transparent.png") && styles.includes("width: 92px"));
  check("Q7G uses blue tech primary token", styles.includes("--accent: #2563eb") && styles.includes("--accent-hover: #1d4ed8") && styles.includes("--signal-cyan: #06b6d4"));
  check("Q7G no longer uses pink as brand primary", !styles.includes("--accent: #e94560") && !styles.includes("rgba(233, 69, 96"));
  check("homepage composer is large enough for natural language", styles.includes(".home-input-area") && styles.includes("min-height: 108px") && styles.includes("width: min(820px, 100%)"));
  check("homepage textarea has GPT-like desktop height", /\.home-input-area textarea\s*\{[\s\S]*?min-height:\s*88px/.test(styles));
  check("mobile homepage stage keeps composer above the fold", /@media \(max-width: 768px\)\s*\{[\s\S]*?\.home-main-stage\s*\{[\s\S]*?justify-content:\s*flex-start/.test(styles));
  check("chat composer is large enough on desktop and mobile", styles.includes("min-height: 88px") && styles.includes("min-height: 108px") && styles.includes("border-radius: 18px"));
  check("toast does not block mobile composer clicks", styles.includes(".toast") && styles.includes("pointer-events: none"));
  check("homepage composer keeps file upload hidden for Q7G", html.includes('id="home-attach-btn"') && /id="home-attach-btn"[^>]*hidden/.test(html));
  check("homepage does not render middle hero radar card board", !html.includes("home-radar-board") && !html.includes("继续你的雷达"));
  const homeRadarCardCount = (html.match(/class="home-radar-card/g) || []).length;
  check("homepage does not render middle template cards", homeRadarCardCount === 0, String(homeRadarCardCount));
  check("homepage hides demo prompt chips from primary path", html.includes("hero-demo-prompts") && /class="hero-demo-prompts"[^>]*hidden/.test(html) && html.includes("AI 赛事雷达 Demo") && html.includes("OPC 创业者") && html.includes("只要报名入口"));
  check("homepage has product preview tray", html.includes("home-preview-tray") && html.includes("雷达画像") && html.includes("运行进度") && html.includes("先看这 3 个") && html.includes("Markdown 报告"));
  check("homepage AI event radar opens existing chat window", html.includes('data-action="open-ai-event-radar"') && homeJs.includes("openHeroRadarWindow"));
  check("homepage AI event radar click has delegated fallback binding", homeJs.includes('document.addEventListener("click"') && homeJs.includes("[data-action='open-ai-event-radar']") && homeJs.includes("[data-action='create-new-radar']"));
  check("homepage start button creates a new radar window", homeJs.includes("createNewHeroRadarWindow") && !homeJs.includes("text = input.value.trim() || window.CHANCEPING_AI_EVENT_DEMO_PROMPT"));
  check("empty homepage start refocuses the input after warning", homeJs.includes('showToast("请输入你想盯的机会", "warning");\n      input.focus();'));
  check("homepage new radar button creates an empty radar window", html.includes('data-action="create-new-radar"') && homeJs.includes("createNewHeroRadarWindow(\"\")"));
  check("home demo prompt chips remain hidden compatibility hooks", html.includes("hero-demo-prompts") && homeJs.includes("bindHeroDemoPrompts") && homeJs.includes("dataset.heroPrompt"));
  check("home does not expose old multi-industry template buttons", !html.includes('data-template-id="ai_events"') && !html.includes('data-template-id="policy"') && !html.includes('data-template-id="heritage"'));
  check("pre-chat homepage does not render the chat workspace box", heroChatJs.includes("root.innerHTML = \"\"") && heroChatJs.includes("if (!chatStarted)"));
  check("pre-chat homepage hides large logo hero chrome", styles.includes(".home-hero") && styles.includes("display: none"));
  check("hero chat defines message state", heroChatJs.includes("heroRadarChatState"));
  check("hero chat renders radar artifact", heroChatJs.includes("renderRadarArtifact"));
  check("hero chat calls generate endpoint", heroChatJs.includes("/api/radars/generate"));
  check("hero chat calls revise endpoint", heroChatJs.includes("/api/radars/revise"));
  check("hero chat starts async radar job after confirmation", heroChatJs.includes("async function runHeroLiveSearch") && heroChatJs.includes("/api/radar-jobs/run"));
  check("hero chat polls async radar job until completion", heroChatJs.includes("waitForRadarRunJob") && heroChatJs.includes("/api/radar-jobs/${encodeURIComponent(jobId)}"));
  check("backend registers async radar job route", apiApp.includes("radarJobRoutes") && apiApp.includes('app.route("/api/radar-jobs"') && radarJobsRoute.includes("export function radarJobRoutes"));
  check("hero demo replay has a dedicated built-in radar gate", heroChatJs.includes("shouldUseHeroDemoReplay") && heroChatJs.includes("AI_EVENT_SAMPLE_ROOM.id"));
  check("hero demo keeps the built-in sample room at V1.0 for first-time users", heroChatJs.includes("normalizeHeroDemoRadarVersion") && heroChatJs.includes('version: "V1.0"'));
  check("hero demo replay reads stored public AI events instead of live search", heroChatJs.includes("/api/public/ai-events?") && heroChatJs.includes("runHeroDemoReplay"));
  check("hero demo replay maps stored events into opportunity cards", heroChatJs.includes("mapPublicAiEventToOpportunityCard") && heroChatJs.includes("demo_replay"));
  check("hero demo replay progress is honest about reading stored results", heroChatJs.includes("最近一次入库结果") && heroChatJs.includes("已保存机会卡"));
  check("hero demo replay keeps async real run path for non-demo radars", heroChatJs.includes("runHeroLiveSearch") && heroChatJs.includes("/api/radar-jobs/run") && heroChatJs.includes("waitForRadarRunJob"));
  check("hero chat preserves confirmation gate", heroChatJs.includes("confirmHeroRadar"));
  check("hero chat has report artifact renderer", heroChatJs.includes("renderReportArtifact"));
  check("hero chat report artifact links to cards", heroChatJs.includes("查看本次机会卡"));
  check("hero chat restores cards from report artifact after reload", heroChatJs.includes("restoreCurrentResultFromReportArtifact") && heroChatJs.includes("chat_report_artifact"));
  check("hero chat can recover demo cards from public AI events when snapshot is missing", heroChatJs.includes("restoreCurrentResultFromPublicEvents") && heroChatJs.includes("demo_replay_restored"));
  check("hero chat script renders GPT-like sidebar", heroChatJs.includes("hero-radar-sidebar") && heroChatJs.includes("全球 AI 赛事导航"));
  check("home tab restores entry shell instead of stale chat workspace", homeJs.includes("showHeroHomeEntry") && !homeJs.includes("forceChatActive: true"));
  check("legacy tab manager delegates to shared switchTab", watchRulesEditorJs.includes('typeof window.switchTab === "function"') && watchRulesEditorJs.includes("window.switchTab(tabName);"));
  check("hero chat exposes home entry restore without clearing chat state", heroChatJs.includes("function showHeroHomeEntry") && heroChatJs.includes("window.showHeroHomeEntry = showHeroHomeEntry"));
  check("hero chat guards home entry from async rerenders", heroChatJs.includes("homeEntryMode") && heroChatJs.includes("heroRadarChatState.homeEntryMode = true") && heroChatJs.includes('document.body.dataset.heroHomeEntry = "true"') && heroChatJs.includes('document.body.dataset.heroHomeEntry === "true"'));
  check("hero chat loads radar chat windows for sidebar", heroChatJs.includes("loadRadarChatWindows") && heroChatJs.includes("/api/radar-chats"));
  check("hero chat supports isolated QA user id", heroChatJs.includes("getHeroChatUserId") && heroChatJs.includes("hero_chat_user_id") && heroChatJs.includes("test_user_id"));
  check("hero chat creates a persistent anonymous visitor id by default", heroChatJs.includes("chanceping_hero_visitor_user_id") && heroChatJs.includes("createAnonymousHeroUserId") && heroChatJs.includes("localStorage.setItem(ANONYMOUS_USER_ID_KEY"));
  check("hero chat no longer defaults public visitors to shared demo_user", !heroChatJs.includes('DEFAULT_USER_ID = "demo_user"'));
  check("hero chat local session keys are isolated by QA user id", heroChatJs.includes("chanceping_hero_radar_chat_state:${HERO_CHAT_USER_ID}") && heroChatJs.includes("chanceping_hero_radar_chat_window_id:${HERO_CHAT_USER_ID}"));
  check("custom radar title infers readable intent phrase", heroChatJs.includes("cleanRadarTitlePhrase") && heroChatJs.includes("想找|寻找|希望找|帮我找|盯一下|盯|需要"));
  check(
    "custom radar title no longer treats any AI or OPC wording as AI events",
    heroChatJs.includes("isAiContestRadarText")
      && heroChatJs.includes("hasContestIntent")
      && heroChatJs.includes("hasAiContext")
      && !heroChatJs.includes("/AI|赛事|比赛|Hackathon|黑客松|开发者|OPC/i"),
  );
  check(
    "non AI-event prompt in built-in navigator detaches into custom window",
    heroChatJs.includes("shouldDetachSampleRoomForMessage")
      && heroChatJs.includes("createRadarChatWindowForDraft(text)")
      && heroChatJs.includes("请先删除一个旧雷达窗口，再发送这条新需求"),
  );
  check("hero chat can switch active chat window", heroChatJs.includes("switchHeroRadarWindow") && heroChatJs.includes("/api/radar-chats/${chatWindowId}"));
  check("sample room remains a protected built-in window", heroChatJs.includes("AI_EVENT_SAMPLE_ROOM") && heroChatJs.includes("isSampleRoom"));
  check("sidebar keeps distinct unbound chat windows", heroChatJs.includes("radar:${item.radarId}") && heroChatJs.includes("chat:${item.id}"));
  check("custom window restore clears sample radar binding", heroChatJs.includes("boundRadarId = windowData.radarId || null"));
  check("hero sidebar has a collapse button", heroChatJs.includes("hero-sidebar-collapse") && heroChatJs.includes("折叠或展开雷达侧边栏"));
  check("hero sidebar persists collapsed state", heroChatJs.includes("chanceping-sidebar-collapsed") && heroChatJs.includes("localStorage"));
  check("hero sidebar has collapsed rendering state", heroChatJs.includes("sidebarCollapsed") && heroChatJs.includes("hero-sidebar-collapsed"));
  check("hero sidebar collapsed CSS keeps icon rail usable", styles.includes(".hero-chat-workspace.sidebar-collapsed") && styles.includes("64px"));
  check("hero chat sidebar renders current radar windows", heroChatJs.includes("hero-sidebar-current-radar") && heroChatJs.includes("当前雷达") && heroChatJs.includes("全球 AI 赛事导航") && !heroChatJs.includes("我的雷达"));
  check("hero chat sidebar shows free chat window quota", heroChatJs.includes("CHAT_WINDOW_LIMIT") && heroChatJs.includes("自定义雷达窗口") && heroChatJs.includes("getActiveCustomWindowCount"));
  check("hero chat sidebar blocks new window when quota is full", heroChatJs.includes("isChatWindowQuotaFull") && heroChatJs.includes("先删除一个旧雷达窗口") && heroChatJs.includes("RADAR_CHAT_QUOTA_EXCEEDED"));
  check("hero chat sidebar shows all existing custom windows for cleanup", heroChatJs.includes("compactSidebarWindows(activeWindows, Number.POSITIVE_INFINITY)"));
  check("hero chat sidebar quota displays real over-limit count", heroChatJs.includes("${activeCustomCount}/${CHAT_WINDOW_LIMIT}") && heroChatJs.includes("${getActiveCustomWindowCount()}/${CHAT_WINDOW_LIMIT}"));
  check("hero chat sidebar deletes custom radar windows instead of archiving", heroChatJs.includes("deleteHeroRadarWindow") && heroChatJs.includes("data-action=\"confirm-window-delete\"") && !heroChatJs.includes("toggle-archived-windows"));
  check("hero chat sidebar does not expose archived window section", !heroChatJs.includes("hero-sidebar-archive-section") && !heroChatJs.includes("已归档"));
  check("hero chat does not expose fixed prompt action in sidebar", !heroChatJs.includes("发送固定提示词") && !heroChatJs.includes("startHeroSamplePrompt"));
  check("hero chat does not expose copy-to-my-radar action in sidebar", !heroChatJs.includes("复制为我的雷达") && !heroChatJs.includes("copyHeroSampleToMyRadar"));
  check("sample room sidebar remains a single public AI events navigator window", heroChatJs.includes("全球 AI 赛事导航") && heroChatJs.includes("内置导航") && !heroChatJs.includes("只读演示") && !heroChatJs.includes("Hero Demo"));
  check("sample room no longer exposes copy mutation path", heroChatJs.includes("isSampleRoom: true") && !heroChatJs.includes("copiedFromSampleRoom"));
  check("hero chat uses separate user and assistant bubbles", heroChatJs.includes("hero-chat-message user") && heroChatJs.includes("hero-chat-message assistant"));
  check("radar artifact uses centered modal trigger", heroChatJs.includes("data-action=\"open-radar-modal\"") && heroChatJs.includes("hero-artifact-modal"));
  check("radar modal is fixed and centered", styles.includes(".hero-artifact-modal") && styles.includes("position: fixed") && styles.includes("translate(-50%, -50%)"));
  check("radar modal stays above sticky mobile composer", styles.includes(".hero-artifact-modal") && styles.includes("z-index: 1200"));
  check("hero chat hides composer while artifact modal is open", heroChatJs.includes("chatStarted && !heroRadarChatState.modal"));
  check("report artifact uses centered modal trigger", heroChatJs.includes("data-action=\"open-report-modal\"") && heroChatJs.includes("hero-report-summary"));
  check("report artifact keeps cards button", heroChatJs.includes("查看本次机会卡"));
  check("report modal uses Chinese demo label", heroChatJs.includes("完整 Markdown 报告"));
  check("my radars renders latest radar version", radarsJs.includes("getRadarVersionLabel") && radarsJs.includes("radar-command-metrics") && radarsJs.includes("版本"));
  check("my radars has edit radar entry", radarsJs.includes("btn-edit-radar") && radarsJs.includes("editRadarFromCard"));
  check("edit radar returns to chat home", radarsJs.includes("window.openHeroRadarEditor") || radarsJs.includes('window.switchTab("home")'));
  check("hero chat formats object fields for customers", heroChatJs.includes("formatReadableItem") && !heroChatJs.includes("escapeHtml(item)</li>"));
  check("hero chat translates technical enum labels for customers", heroChatJs.includes("CUSTOMER_LABELS") && heroChatJs.includes("可直接行动的比赛机会"));
  check("hero chat hides technical radar fields by default", heroChatJs.includes("打开完整雷达画像"));
  check("radar modal copy explains strategy in customer language", heroChatJs.includes("我会怎么找") && heroChatJs.includes("为什么这样找"));
  check("radar modal has readable strategy fallback", heroChatJs.includes("优先寻找报名、提交作品、申请资源") && heroChatJs.includes("展会资讯、培训广告、学生专属"));
  check("hero chat only latest draft can be confirmed", heroChatJs.includes("isLatestDraft") && heroChatJs.includes("这版已被新版替代"));
  check("hero chat prevents duplicate report generation", heroChatJs.includes("confirmedVersion") && heroChatJs.includes("alreadyConfirmed"));
  check("hero chat collapses replaced radar versions", heroChatJs.includes("hero-radar-artifact compact") && heroChatJs.includes("已升级到"));
  check("latest radar card gives one clear next step", heroChatJs.includes("现在只需要做一个选择"));
  check("radar version diff is collapsed by default", heroChatJs.includes("查看本次修改"));
  check("hero chat shows a three-step beginner guide", heroChatJs.includes("1. 说需求") && heroChatJs.includes("2. 看雷达") && heroChatJs.includes("3. 确认后搜索"));
  check("hero chat can reset the current demo", heroChatJs.includes("hero-chat-reset") && heroChatJs.includes("resetHeroRadarChat"));
  check("hero chat reset returns to home input instead of blank workspace", heroChatJs.includes("forceHomeEntry") && heroChatJs.includes("syncHeroEntryVisibility({ forceHomeEntry: true })"));
  check("hero chat exposes open existing radar window flow", heroChatJs.includes("openHeroRadarWindow") && heroChatJs.includes("继续编辑全球 AI 赛事导航"));
  check("opening AI event radar preloads demo prompt without auto-send", heroChatJs.includes("pendingFirstMessage = HERO_DEMO_PROMPT") && heroChatJs.includes("我已把默认需求放到底部输入框"));
  check("custom first message can generate generic opportunity radar copy", heroChatJs.includes("生成${isAiContestRadarText(text) ? \" AI 赛事雷达\" : \"机会雷达\"}") && heroChatJs.includes(": \"机会雷达\"} V1.0"));
  check("custom radar window restores pending input after switching", heroChatJs.includes("windowData.pendingMessage") && heroChatJs.includes("pendingMessage: String(initialMessage || \"\")"));
  check("chat input draft persists before manual send", heroChatJs.includes("syncPendingInputMessage") && heroChatJs.includes("addEventListener(\"input\""));
  check("homepage typed prompt creates user-owned window", homeJs.includes("createNewHeroRadarWindow(text)") && heroChatJs.includes("reuseByRadarId: false"));
  check("new custom window is not treated as sample replay", heroChatJs.includes("boundRadarId = null") && heroChatJs.includes("shouldUseHeroDemoReplay"));
  check("sidebar can create a new radar window from chat mode", heroChatJs.includes("data-action=\"new-hero-radar-window\"") && heroChatJs.includes("createNewHeroRadarWindow(\"\")"));
  check("sidebar supports renaming custom radar windows", heroChatJs.includes("renameHeroRadarWindow") && heroChatJs.includes("data-action=\"submit-window-rename\""));
  check("sidebar supports deleting custom radar windows", heroChatJs.includes("deleteHeroRadarWindow") && heroChatJs.includes("data-action=\"confirm-window-delete\""));
  check("sidebar window actions use in-app modal instead of browser prompts", heroChatJs.includes("openRenameWindowModal") && heroChatJs.includes("openDeleteWindowModal") && !heroChatJs.includes("window.prompt?.") && !heroChatJs.includes("window.confirm?."));
  check("sample room is protected from sidebar delete action", heroChatJs.includes("sample room cannot be deleted") || heroChatJs.includes("内置窗口，不能删除"));
  check("hero demo prompt names concrete AI contest sources", heroChatJs.includes("Qwen Cloud Hackathon") && heroChatJs.includes("Devpost") && heroChatJs.includes("DoraHacks") && heroChatJs.includes("Lablab.ai"));
  check("hero demo prompt asks for registration-first outputs", heroChatJs.includes("官方报名页") && heroChatJs.includes("可提交项目") && heroChatJs.includes("本周先做哪三件事"));
  check("hero chat exposes create new radar window flow", heroChatJs.includes("createNewHeroRadarWindow") && heroChatJs.includes("这会成为一个新的雷达窗口"));
  check("search progress is revealed step by step", heroChatJs.includes("activeStepCount") && heroChatJs.includes("startProgressTicker"));
  check("search progress explains source verification and report summary", heroChatJs.includes("正在核对来源可信度") && heroChatJs.includes("正在生成报告摘要"));
  check("search progress uses one-line current work status", heroChatJs.includes("currentProgressLine") && heroChatJs.includes("hero-progress-current") && !heroChatJs.includes("appendProgressLog"));
  check("progress line uses ChancePing wording instead of visible providers", heroChatJs.includes("盯机会正在搜索") && heroChatJs.includes("盯机会正在生成报告") && !/Serper：|Qwen：|Qwen 正在|DeepSeek：/.test(heroChatJs));
  check("homepage preview copy uses ChancePing wording instead of provider wording", html.includes("盯机会会持续显示搜索、读取、筛选和整理进度") && !html.includes("DeepSeek 按证据解释") && !html.includes("Serper 找来源"));
  const customerVisibleWeb = [
    html,
    heroChatJs,
    homeJs,
    radarsJs,
    watchResultJs,
    radarProfileJs,
    radarDetailJs,
    searchJs,
  ].join("\n");
  check("customer-visible backend web files do not mention DeepSeek", !/DeepSeek|deepseek|DEEPSEEK/.test(customerVisibleWeb));
  check("legacy backend loading states use ChancePing wording", radarProfileJs.includes("盯机会正在理解并生成雷达") && watchResultJs.includes("盯机会正在搜索机会并整理证据") && searchJs.includes("盯机会正在搜索") && radarDetailJs.includes("盯机会正在生成报告"));
  check("progress line reassures novice users that work is continuing", heroChatJs.includes("不用刷新页面") && heroChatJs.includes("持续更新"));
  check("homepage keeps prompt chips hidden before and after chat starts", heroChatJs.includes("promptChips.hidden = true") && homeJs.includes('".hero-demo-prompts"'));
  check("hero chat becomes the only visible workspace after starting", heroChatJs.includes("syncHeroEntryVisibility") && heroChatJs.includes(".home-hero") && heroChatJs.includes(".home-input-area") && heroChatJs.includes("hero-chat-active"));
  check("switching back home keeps chat workspace full screen when chat is active", heroChatJs.includes("syncHeroEntryVisibility({ forceChatActive: true })") || heroChatJs.includes("forceChatActive"));
  check("hidden elements cannot be overridden by flex styles", styles.includes("[hidden]") && styles.includes("display: none !important"));
  check("chat mode keeps total-console top navigation", !styles.includes("body.hero-chat-active .top-bar,\nbody.hero-chat-active .tab-nav") && styles.includes("min-height: calc(100vh - 100px);"));
  check("home AI event shell keeps top banner and tab nav", !styles.includes("body.hero-home-shell .top-bar") && !styles.includes("body.hero-home-shell .tab-nav"));
  check("chat composer is hidden until the radar conversation starts", heroChatJs.includes("chatStarted && !heroRadarChatState.modal ? `") && heroChatJs.includes("hero-chat-input-row"));
  check("chat send button has visible accent active state", styles.includes("#hero-radar-chat-send:not(:disabled)") && styles.includes("var(--accent)"));
  check("mobile chat composer remains visible at viewport bottom", styles.includes("height: calc(100dvh - 236px)") && styles.includes("max-height: 176px") && styles.includes(".hero-chat-input-row") && styles.includes("position: sticky") && styles.includes("bottom: 0"));
  check("mobile chat render scrolls composer into view", heroChatJs.includes("matchMedia(\"(max-width: 860px)\")") && heroChatJs.includes("inputRow.scrollIntoView"));
  check("chat render scrolls message container to latest result", heroChatJs.includes("messages.scrollTop = messages.scrollHeight"));
  check("home routes primary input to chat draft without auto-send", homeJs.includes("window.startHeroRadarChat") && homeJs.includes("autoSend: false"));
  check("hero chat waits for manual send before generating V1.0", heroChatJs.includes("pendingFirstMessage") && heroChatJs.includes("等待你点击发送"));
  check("hero chat tells the user ChancePing is interpreting revisions", heroChatJs.includes("盯机会正在理解") && !heroChatJs.includes("让 DeepSeek 理解"));
  check("hero chat tells the user ChancePing is drawing the radar", heroChatJs.includes("盯机会正在画雷达"));
  check("hero chat surfaces radar generation or revision failures", heroChatJs.includes("catch (err)") && heroChatJs.includes("雷达理解或修订失败"));
  check("hero chat keeps LLM revision in auto mode for local live profile", heroChatJs.includes('revisionMode: options.revisionMode || "auto"'));
  check("old template buttons are hidden for hero path", homeJs.includes("hideLegacyTemplatesForHero();"));
  check("hidden demo prompt chips only fill input if reused", homeJs.includes("bindHeroDemoPrompts") && homeJs.includes("dataset.heroPrompt"));
  check("hero chat runs before legacy template fallback", homeJs.indexOf("window.startHeroRadarChat") > -1 && homeJs.indexOf("window.startHeroRadarChat") < homeJs.indexOf("window.runTemplateWatch"));
  check("report artifact tells user next action and feedback loop", heroChatJs.includes("buildReportRecommendation") && heroChatJs.includes("结果不对？直接在下方告诉我"));
  check("report artifact has demo-ready conclusion and action layer", heroChatJs.includes("本轮结论") && heroChatJs.includes("先做这 3 件事") && heroChatJs.includes("待复核提醒"));
  check("report artifact tells users where to inspect full source evidence", heroChatJs.includes("完整来源和字段证据") && heroChatJs.includes("查看本次机会卡"));
  check("result page exposes reusable opportunity card grid", watchResultJs.includes("renderOpportunityCardGrid") && watchResultJs.includes("watch-opportunity-grid"));
  check("result page restores latest chat report when top tab is opened", watchResultJs.includes("LAST_WATCH_RESULT_KEY") && watchResultJs.includes("tab-switched") && heroChatJs.includes("persistWatchResult"));
  check("result page surfaces top 3 action strip", watchResultJs.includes("renderTopActionStrip") && watchResultJs.includes("先看这 3 个") && styles.includes(".watch-top-actions"));
  check("result page renders opportunity pipeline board", watchResultJs.includes("renderOpportunityPipeline") && watchResultJs.includes("机会管道看板") && styles.includes(".watch-pipeline-board"));
  check("result pipeline has four customer lanes", watchResultJs.includes("立即行动") && watchResultJs.includes("复核资格") && watchResultJs.includes("持续观察") && watchResultJs.includes("淘汰原因"));
  check("result opportunity cards use customer-facing labels", watchResultJs.includes("formatOpportunityKindForCustomer") && watchResultJs.includes("watch-card-decision-row") && watchResultJs.includes("优先复核"));
  check("result opportunity cards use demo-friendly action copy", watchResultJs.includes("为什么值得看") && watchResultJs.includes("本周先做") && watchResultJs.includes("来源入口"));
  check("result opportunity cards avoid raw chip labels", watchResultJs.includes("Priority") && watchResultJs.includes("Type") && watchResultJs.includes("Evidence") && watchResultJs.includes("建议") && watchResultJs.includes("性质") && watchResultJs.includes("证据"));
  check("result report summary points users to source evidence cards", watchResultJs.includes("完整来源、字段证据和排除原因") && watchResultJs.includes("查看机会卡"));
  check("result page hero demo title uses global AI events navigator name", watchResultJs.includes("getDisplayRadarTitle") && watchResultJs.includes("全球 AI 赛事导航") && !watchResultJs.includes('return "AI 赛事雷达"'));
  check("result page puts report summary after opportunity cards", watchResultJs.indexOf("watch-opportunity-grid") > -1 && watchResultJs.indexOf("report-summary") > watchResultJs.indexOf("watch-opportunity-grid"));
  check("my radar view enters the shared result surface", radarsJs.includes("查看机会和报告") && radarsJs.includes("window.showWatchResult"));
  check("my radars edit opens linked radar chat window", radarsJs.includes("openHeroRadarForRadar") || radarsJs.includes("openRadarChatForRadar"));
  check("hero chat can open or create window by radar id", heroChatJs.includes("openHeroRadarForRadar") && heroChatJs.includes("radarId"));
  check("my radar view uses intelligence command center copy", html.includes("情报流指挥台") && radarsJs.includes("radar-command-card") && styles.includes(".radar-command-metrics"));
  check("my radar view displays public AI events hero name", radarsJs.includes("PUBLIC_AI_EVENTS_DISPLAY_NAME") && radarsJs.includes("全球 AI 赛事导航"));
  check("my radar view normalizes duplicate legacy hero demo names", radarsJs.includes("PERSONAL_DEVELOPER_DUPLICATE_RADAR_RE") && radarsJs.includes("个人开发者的个人开发者比赛机会雷达"));
  check("my radar metric boxes avoid cramped vertical wrapping", styles.includes(".radar-command-metrics") && styles.includes("grid-template-columns: repeat(2, minmax(0, 1fr))") && styles.includes("white-space: nowrap"));
  check("my radar metric boxes use readable stacked labels", styles.includes(".radar-command-metrics div") && styles.includes("display: flex") && styles.includes("min-width: 112px"));
  check("my radar cards show version status last run and new count", radarsJs.includes("版本") && radarsJs.includes("状态") && radarsJs.includes("上次运行") && radarsJs.includes("本次新增"));
  check("result page has one radar revision action", watchResultJs.includes("调整雷达画像") && !watchResultJs.includes("这些结果不对，修改雷达"));
  check(
    "result page adjustment returns to the radar chat window",
    watchResultJs.includes("openRadarChatFromResultFeedback")
      && watchResultJs.includes("window.openHeroRadarFromResultFeedback")
      && !watchResultJs.includes("window.showRadarRevisionFromResultFeedback"),
  );
  check(
    "hero chat exposes result feedback entry for result page",
    heroChatJs.includes("openHeroRadarFromResultFeedback")
      && heroChatJs.includes("result_feedback")
      && heroChatJs.includes("pendingFirstMessage"),
  );
  check(
    "hero chat API helpers reject HTML fallback pages with readable errors",
    heroChatJs.includes("parseJsonResponse")
      && heroChatJs.includes("content-type")
      && heroChatJs.includes("服务器返回了网页错误页"),
  );
  check(
    "hero chat API helpers explain nginx gateway timeout separately",
    heroChatJs.includes("GATEWAY_TIMEOUT")
      && heroChatJs.includes("线上网关等待时间")
      && heroChatJs.includes("改成长任务或提高网关等待时间"),
  );
  check("result page card grid CSS is responsive", styles.includes(".watch-opportunity-grid") && styles.includes("repeat(auto-fit, minmax(260px, 1fr))"));
  check("my radar cards hide raw last run status", !radarsJs.includes("上次运行状态"));
  check("my radar cards use customer-friendly saved status", radarsJs.includes("getCustomerRadarStatusLabel") && radarsJs.includes("已完成") && radarsJs.includes("还没跑过"));
  check("my radar cards keep customer-facing actions only", radarsJs.includes("编辑雷达") && radarsJs.includes("再次盯机会") && radarsJs.includes("查看机会和报告") && radarsJs.includes("删除雷达"));
  check("detail page does not show activation action", !radarDetailJs.includes(">激活</button>"));
  check("detail archive label becomes delete radar", radarDetailJs.includes("删除雷达") && !radarDetailJs.includes(">归档</button>"));
  check("delete radar has second confirmation", radarDetailJs.includes("确认删除这个雷达") && radarDetailJs.includes("DELETE"));
  check("detail page removes run history table", !radarDetailJs.includes("<h4>运行历史</h4>"));
  check("detail page removes generate markdown report button", !radarDetailJs.includes("生成 Markdown 报告"));
  check("detail stored opportunities hide raw debug fields", !radarDetailJs.includes("入库 Key") && !radarDetailJs.includes("ChanceScore:") && !radarDetailJs.includes("radarIds"));

  const app = createApp(createAppContext());
  const initial = await post(app, "/api/radars/generate", {
    description: "我是个人开发者，想找 AI 比赛机会，帮我盯一下。",
  });
  check("initial API returns Radar V1.0", initial.radarVersion?.version === "V1.0", initial.radarVersion?.version ?? "");

  const revised = await post(app, "/api/radars/revise", {
    previousSpec: initial.spec,
    previousRadarVersion: initial.radarVersion || initial.spec.radar_version,
    userMessage: "我不是学生，我是 OPC 创业者，优先奖金、云资源、能上架展示的比赛。",
    trigger: "requirement_correction",
  });
  check("revision API returns newer radar version", revised.radarVersion?.version !== "V1.0", revised.radarVersion?.version ?? "");
  check("revision API keeps draft unconfirmed", revised.spec?.confirmation_status?.user_confirmed === false);
}

run()
  .then(() => {
    if (fail > 0) {
      console.error(`Q.7 hero chat: ${pass} PASS / ${fail} FAIL`);
      process.exit(1);
    }
    console.log(`Q.7 hero chat: ${pass} PASS / 0 FAIL`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
