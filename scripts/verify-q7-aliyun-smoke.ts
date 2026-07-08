import { rmSync } from "node:fs";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";
import { JsonRadarStore } from "../src/agents/radar-store";
import { RadarRegistry } from "../src/agents/radar-registry";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

async function createChatWindow(app: ReturnType<typeof createApp>, body: Record<string, unknown>) {
  const response = await app.request("/api/radar-chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await json<{ success: boolean; data?: any; error?: any }>(response);
  return { response, payload };
}

async function listChatWindows(app: ReturnType<typeof createApp>, userId: string) {
  const response = await app.request(`/api/radar-chats?user_id=${encodeURIComponent(userId)}`);
  const payload = await json<{ success: boolean; data?: any[]; error?: any }>(response);
  return { response, payload };
}

async function createLegacyRadar(app: ReturnType<typeof createApp>, userId: string, name: string) {
  const response = await app.request("/api/radars", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ChancePing-User-Id": userId,
    },
    body: JSON.stringify({
      name,
      kind: "custom",
      spec: {
        keyword_strategy: {
          core_keywords_zh: [name],
          core_keywords_en: [],
        },
      },
    }),
  });
  const payload = await json<{ success: boolean; data?: any; error?: any }>(response);
  return { response, payload };
}

async function listLegacyRadars(app: ReturnType<typeof createApp>, userId: string) {
  const response = await app.request("/api/radars?scope=mine", {
    headers: { "X-ChancePing-User-Id": userId },
  });
  const payload = await json<{ success: boolean; data?: any[]; error?: any }>(response);
  return { response, payload };
}

async function text(app: ReturnType<typeof createApp>, path: string): Promise<{ response: Response; body: string }> {
  const response = await app.request(path);
  const body = await response.text();
  return { response, body };
}

async function verifyBackendQwenWording(app: ReturnType<typeof createApp>) {
  const visibleBackendPaths = [
    "/",
    "/home.js",
    "/radars.js",
    "/radar-detail.js",
    "/radar-profile.js",
    "/watch-result.js",
    "/search.js",
    "/hero-radar-chat.js",
    "/backend-user.js",
  ];
  const pages: Array<{ path: string; body: string }> = [];

  for (const path of visibleBackendPaths) {
    const page = await text(app, path);
    check(`backend visible page ${path} is served`, page.response.status === 200, String(page.response.status));
    pages.push({ path, body: page.body });
  }

  const visibleText = pages.map((page) => page.body).join("\n");
  const deepSeekPages = pages.filter((page) => /DeepSeek/i.test(page.body)).map((page) => page.path);
  check("backend visible pages do not mention DeepSeek", deepSeekPages.length === 0, deepSeekPages.join(", "));

  [
    "盯机会正在理解并生成雷达",
    "盯机会正在画雷达",
    "盯机会正在搜索机会并整理证据",
    "盯机会正在生成机会报告",
    "盯机会正在生成报告",
  ].forEach((phrase) => {
    check(`backend visible pages include ${phrase}`, visibleText.includes(phrase));
  });
}

async function verifyUserWindowModel(app: ReturnType<typeof createApp>, userId: string) {
  const fullName = `用户 ${userId}`;
  const sample = await createChatWindow(app, {
    radarId: "ai-event-sample-room",
    userId,
    title: "全球 AI 赛事导航",
    draftRadarVersion: "V1.0",
    pendingMessage: "我想查看全球 AI 赛事导航。",
  });
  check(`${fullName}: can open built-in AI events navigator`, sample.response.status === 200 && sample.payload.success === true, JSON.stringify(sample.payload.error ?? {}));
  check(`${fullName}: built-in navigator is bound to sample room radar`, sample.payload.data?.radarId === "ai-event-sample-room", JSON.stringify(sample.payload.data ?? {}));
  check(`${fullName}: built-in navigator keeps public title`, sample.payload.data?.title === "全球 AI 赛事导航", sample.payload.data?.title ?? "");

  const customWindows: any[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const created = await createChatWindow(app, {
      userId,
      title: `${fullName} 自定义雷达 ${index}`,
      draftRadarVersion: "V1.0",
      pendingMessage: `${fullName} 想找第 ${index} 类机会。`,
    });
    check(`${fullName}: can create custom radar window ${index}`, created.response.status === 200 && created.payload.success === true, JSON.stringify(created.payload.error ?? {}));
    customWindows.push(created.payload.data);
  }

  const fourth = await createChatWindow(app, {
    userId,
    title: `${fullName} 第四个自定义雷达`,
    draftRadarVersion: "V1.0",
  });
  check(`${fullName}: fourth custom window is blocked`, fourth.response.status === 403 && fourth.payload.error?.code === "RADAR_CHAT_QUOTA_EXCEEDED", JSON.stringify(fourth.payload));

  const lateSample = await createChatWindow(app, {
    radarId: "ai-event-sample-room",
    userId,
    title: "全球 AI 赛事导航",
    draftRadarVersion: "V1.0",
  });
  check(`${fullName}: built-in navigator still opens after quota full`, lateSample.response.status === 200 && lateSample.payload.success === true, JSON.stringify(lateSample.payload.error ?? {}));
  check(`${fullName}: built-in navigator reuses existing window`, lateSample.payload.data?.id === sample.payload.data?.id, `${lateSample.payload.data?.id} !== ${sample.payload.data?.id}`);

  const listed = await listChatWindows(app, userId);
  const windows = Array.isArray(listed.payload.data) ? listed.payload.data : [];
  const customCount = windows.filter((item) => item.radarId !== "ai-event-sample-room").length;
  const builtInCount = windows.filter((item) => item.radarId === "ai-event-sample-room").length;
  check(`${fullName}: list contains one built-in navigator`, builtInCount === 1, JSON.stringify(windows.map((item) => ({ title: item.title, radarId: item.radarId }))));
  check(`${fullName}: list contains three custom windows`, customCount === 3, JSON.stringify(windows.map((item) => ({ title: item.title, radarId: item.radarId }))));

  const deleted = await app.request(`/api/radar-chats/${customWindows[0]?.id}`, { method: "DELETE" });
  const deletedJson = await json<{ success: boolean; data?: any; error?: any }>(deleted);
  check(`${fullName}: deleting a custom window succeeds`, deleted.status === 200 && deletedJson.data?.deleted === true, JSON.stringify(deletedJson.error ?? {}));

  const replacement = await createChatWindow(app, {
    userId,
    title: `${fullName} 新自定义雷达`,
    draftRadarVersion: "V1.0",
  });
  check(`${fullName}: can create a replacement after delete`, replacement.response.status === 200 && replacement.payload.success === true, JSON.stringify(replacement.payload.error ?? {}));

  return {
    sampleWindowId: sample.payload.data?.id,
    customWindowIds: customWindows.map((item) => item?.id).filter(Boolean),
  };
}

async function verifyLegacyRadarUserIsolation(app: ReturnType<typeof createApp>) {
  const alpha = "legacy_alpha";
  const beta = "legacy_beta";
  const alphaRadar = await createLegacyRadar(app, alpha, "Alpha 私有雷达");
  const betaRadar = await createLegacyRadar(app, beta, "Beta 私有雷达");

  check("legacy /api/radars creates alpha radar with request user", alphaRadar.response.status === 200 && alphaRadar.payload.data?.ownerId === alpha, JSON.stringify(alphaRadar.payload));
  check("legacy /api/radars creates beta radar with request user", betaRadar.response.status === 200 && betaRadar.payload.data?.ownerId === beta, JSON.stringify(betaRadar.payload));

  const alphaList = await listLegacyRadars(app, alpha);
  const betaList = await listLegacyRadars(app, beta);
  const alphaNames = (alphaList.payload.data ?? []).map((radar) => radar.name);
  const betaNames = (betaList.payload.data ?? []).map((radar) => radar.name);

  check("legacy /api/radars alpha list only sees alpha radar", alphaNames.includes("Alpha 私有雷达") && !alphaNames.includes("Beta 私有雷达"), JSON.stringify(alphaNames));
  check("legacy /api/radars beta list only sees beta radar", betaNames.includes("Beta 私有雷达") && !betaNames.includes("Alpha 私有雷达"), JSON.stringify(betaNames));
}

async function run() {
  rmSync("data/q7-aliyun-smoke", { recursive: true, force: true });
  process.env.CHANCEPING_RADAR_CHAT_STORE_PATH = "data/q7-aliyun-smoke/radar-chat-windows.json";
  process.env.DATA_MODE = "mock";
  process.env.LLM_MODE = "mock";

  const ctx = createAppContext();
  ctx.radarStore = new JsonRadarStore({ file_path: "data/q7-aliyun-smoke/radars.json" });
  ctx.radarRegistry = new RadarRegistry(ctx.radarStore);
  ctx.radarRegistry.initialize();
  const app = createApp(ctx);

  const health = await app.request("/health");
  const healthJson = await json<{ success: boolean; data?: any }>(health);
  check("deployment smoke app health is OK", health.status === 200 && healthJson.success === true && healthJson.data?.status === "ok");

  await verifyBackendQwenWording(app);

  const publicPage = await app.request("/aievents");
  const publicPageText = await publicPage.text();
  check("public /aievents page is served", publicPage.status === 200 && publicPageText.includes("全球 AI 赛事导航"), String(publicPage.status));
  check("public /aievents page has no DeepSeek wording", !/DeepSeek/i.test(publicPageText));

  const publicFeed = await app.request("/api/public/ai-events?page_size=8");
  const publicFeedJson = await json<{ success: boolean; data?: any; error?: any }>(publicFeed);
  check("public AI events feed returns data", publicFeed.status === 200 && publicFeedJson.success === true, JSON.stringify(publicFeedJson.error ?? {}));
  check("public AI events feed has displayable cards", Array.isArray(publicFeedJson.data?.items) && publicFeedJson.data.items.length > 0, JSON.stringify(publicFeedJson.data?.stats ?? {}));

  await verifyLegacyRadarUserIsolation(app);

  const alpha = await verifyUserWindowModel(app, "aliyun_alpha");
  const beta = await verifyUserWindowModel(app, "aliyun_beta");

  const alphaList = await listChatWindows(app, "aliyun_alpha");
  const betaList = await listChatWindows(app, "aliyun_beta");
  const alphaIds = new Set((alphaList.payload.data ?? []).map((item) => item.id));
  const betaIds = new Set((betaList.payload.data ?? []).map((item) => item.id));
  check("different users do not share custom window ids", [...alphaIds].every((id) => !betaIds.has(id)), JSON.stringify({ alpha: [...alphaIds], beta: [...betaIds] }));
  check("different users each have their own built-in chat window", alpha.sampleWindowId !== beta.sampleWindowId, `${alpha.sampleWindowId} === ${beta.sampleWindowId}`);

  console.log(`Q7 Aliyun smoke: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
