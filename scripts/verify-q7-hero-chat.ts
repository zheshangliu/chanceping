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
  const webUiRoute = read("src/api/routes/web-ui.ts");

  check("hero chat script exists", existsSync("web/hero-radar-chat.js"));
  check("index loads hero chat script", html.includes("/hero-radar-chat.js"));
  check("web UI serves hero chat script", webUiRoute.includes("/hero-radar-chat.js") && webUiRoute.includes('serveFile("hero-radar-chat.js"'));
  check("index has hero chat root", html.includes("hero-radar-chat-root"));
  check("hero chat root is visible in primary path", /id="hero-radar-chat-root"[^>]*>/.test(html) && !/id="hero-radar-chat-root"[^>]*hidden/.test(html));
  check("home copy focuses AI entrepreneur hero demo", html.includes("AI 创业者机会雷达"));
  check("home offers one AI entrepreneur demo path", html.includes("hero-demo-prompts") && html.includes("OPC 创业者") && html.includes("不要展会资讯"));
  check("home does not expose old multi-industry template buttons", !html.includes('data-template-id="ai_events"') && !html.includes('data-template-id="policy"') && !html.includes('data-template-id="heritage"'));
  check("hero chat defines message state", heroChatJs.includes("heroRadarChatState"));
  check("hero chat renders radar artifact", heroChatJs.includes("renderRadarArtifact"));
  check("hero chat calls generate endpoint", heroChatJs.includes("/api/radars/generate"));
  check("hero chat calls revise endpoint", heroChatJs.includes("/api/radars/revise"));
  check("hero chat calls search endpoint after confirmation", heroChatJs.includes("/api/search") && heroChatJs.indexOf("/api/search") > heroChatJs.indexOf("async function confirmHeroRadar"));
  check("hero chat calls report generation after search", heroChatJs.includes("/api/reports/generate") && heroChatJs.indexOf("/api/reports/generate") > heroChatJs.indexOf("/api/search"));
  check("hero chat preserves confirmation gate", heroChatJs.includes("confirmHeroRadar"));
  check("hero chat has report artifact renderer", heroChatJs.includes("renderReportArtifact"));
  check("hero chat report artifact links to cards", heroChatJs.includes("查看本次机会卡"));
  check("hero chat formats object fields for customers", heroChatJs.includes("formatReadableItem") && !heroChatJs.includes("escapeHtml(item)</li>"));
  check("hero chat hides technical radar fields by default", heroChatJs.includes("查看完整雷达细节"));
  check("hero chat only latest draft can be confirmed", heroChatJs.includes("isLatestDraft") && heroChatJs.includes("这版已被新版替代"));
  check("hero chat prevents duplicate report generation", heroChatJs.includes("confirmedVersion") && heroChatJs.includes("alreadyConfirmed"));
  check("hero chat collapses replaced radar versions", heroChatJs.includes("hero-radar-artifact compact") && heroChatJs.includes("已升级到"));
  check("latest radar card gives one clear next step", heroChatJs.includes("现在只需要做一个选择"));
  check("radar version diff is collapsed by default", heroChatJs.includes("查看本次修改"));
  check("hero chat shows a three-step beginner guide", heroChatJs.includes("1. 说需求") && heroChatJs.includes("2. 看雷达") && heroChatJs.includes("3. 确认后搜索"));
  check("hero chat can reset the current demo", heroChatJs.includes("hero-chat-reset") && heroChatJs.includes("resetHeroRadarChat"));
  check("hero chat becomes the only input after starting", heroChatJs.includes("syncHeroEntryVisibility") && heroChatJs.includes(".home-input-area") && heroChatJs.includes(".hero-demo-prompts"));
  check("chat composer is hidden until the radar conversation starts", heroChatJs.includes("chatStarted ? `") && heroChatJs.includes("hero-chat-input-row"));
  check("home routes primary input to hero chat", homeJs.includes("window.startHeroRadarChat") && homeJs.includes("startHeroRadarChat(text"));
  check("old template buttons are hidden for hero path", homeJs.includes("hideLegacyTemplatesForHero();"));
  check("demo prompt chips only fill input", homeJs.includes("bindHeroDemoPrompts") && homeJs.includes("dataset.heroPrompt"));
  check("hero chat runs before legacy template fallback", homeJs.indexOf("window.startHeroRadarChat") > -1 && homeJs.indexOf("window.startHeroRadarChat") < homeJs.indexOf("window.runTemplateWatch"));

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
