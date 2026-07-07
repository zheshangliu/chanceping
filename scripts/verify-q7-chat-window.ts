import { existsSync, readFileSync, rmSync } from "node:fs";
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

async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

async function run() {
  rmSync("data/q7-chat-window-test", { recursive: true, force: true });
  process.env.CHANCEPING_RADAR_CHAT_STORE_PATH = "data/q7-chat-window-test/radar-chat-windows.json";

  const storeSource = read("src/agents/radar-chat-store.ts");
  const contextSource = read("src/api/context.ts");
  const appSource = read("src/api/app.ts");
  const routeSource = read("src/api/routes/radar-chats.ts");
  const heroChatSource = read("web/hero-radar-chat.js");

  check("radar chat store exists", existsSync("src/agents/radar-chat-store.ts"));
  check("radar chat route exists", existsSync("src/api/routes/radar-chats.ts"));
  check("AppContext exposes radarChatStore", contextSource.includes("radarChatStore"));
  check("createApp registers /api/radar-chats", appSource.includes('"/api/radar-chats"') && appSource.includes("radarChatRoutes"));
  check("store defines RadarChatWindow", storeSource.includes("RadarChatWindow"));
  check("store defines RadarChatMessage", storeSource.includes("RadarChatMessage"));
  check("store defines RadarMemorySummary", storeSource.includes("RadarMemorySummary"));
  check("store can list by radarId", storeSource.includes("listByRadarId"));
  check("route supports message append", routeSource.includes("/:id/messages"));
  check("route supports memory summary update", routeSource.includes("/:id/memory-summary"));
  check("route supports pending input message", routeSource.includes("pendingMessage"));
  check("hero chat persists to radar chat API", heroChatSource.includes("/api/radar-chats"));
  check("hero chat tracks chatWindowId", heroChatSource.includes("chatWindowId"));

  const ctx = createAppContext();
  if (!ctx.radarChatStore) {
    throw new Error("createAppContext did not create radarChatStore");
  }
  const app = createApp(ctx);

  const createResponse = await app.request("/api/radar-chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      radarId: "radar_ai_event_demo",
      title: "AI 赛事雷达",
      userId: "demo_user",
      pendingMessage: "我是 OPC 创业者，只要可报名 AI 比赛。",
    }),
  });
  const createJson = await json<{ success: boolean; data?: any; error?: any }>(createResponse);
  check("POST /api/radar-chats returns 200", createResponse.status === 200, String(createResponse.status));
  check("POST /api/radar-chats succeeds", createJson.success === true, JSON.stringify(createJson.error ?? {}));
  const chatWindow = createJson.data;
  check("chat window id uses radar_chat_ prefix", typeof chatWindow?.id === "string" && chatWindow.id.startsWith("radar_chat_"), chatWindow?.id ?? "");
  check("chat window binds radarId", chatWindow?.radarId === "radar_ai_event_demo", chatWindow?.radarId ?? "");
  check("chat window keeps pending input", chatWindow?.pendingMessage === "我是 OPC 创业者，只要可报名 AI 比赛。", chatWindow?.pendingMessage ?? "");
  check("chat window has memory summary", typeof chatWindow?.memorySummary?.summary === "string");

  const messageResponse = await app.request(`/api/radar-chats/${chatWindow?.id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "user",
      content: "我是 OPC 创业者，只要可报名 AI 比赛。",
      linkedRadarVersion: "V1.0",
    }),
  });
  const messageJson = await json<{ success: boolean; data?: any; error?: any }>(messageResponse);
  check("POST /messages returns 200", messageResponse.status === 200, String(messageResponse.status));
  check("POST /messages succeeds", messageJson.success === true, JSON.stringify(messageJson.error ?? {}));
  check("message has stable id", typeof messageJson.data?.message?.id === "string" && messageJson.data.message.id.startsWith("radar_msg_"));

  const summaryResponse = await app.request(`/api/radar-chats/${chatWindow?.id}/memory-summary`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUser: "OPC 创业者",
      watchingFor: ["AI 比赛", "Hackathon"],
      exclusions: ["展会资讯", "学生专属"],
      summary: "OPC 创业者寻找可报名 AI 赛事机会。",
    }),
  });
  const summaryJson = await json<{ success: boolean; data?: any; error?: any }>(summaryResponse);
  check("PUT /memory-summary returns 200", summaryResponse.status === 200, String(summaryResponse.status));
  check("PUT /memory-summary succeeds", summaryJson.success === true, JSON.stringify(summaryJson.error ?? {}));
  check("memory summary keeps exclusions", summaryJson.data?.memorySummary?.exclusions?.includes("学生专属") === true);

  const detailResponse = await app.request(`/api/radar-chats/${chatWindow?.id}`);
  const detailJson = await json<{ success: boolean; data?: any; error?: any }>(detailResponse);
  check("GET /api/radar-chats/:id returns 200", detailResponse.status === 200, String(detailResponse.status));
  check("detail includes appended messages", Array.isArray(detailJson.data?.messages) && detailJson.data.messages.length === 1, JSON.stringify(detailJson.data?.messages ?? []));
  check("detail includes pending input", detailJson.data?.window?.pendingMessage === "我是 OPC 创业者，只要可报名 AI 比赛。");
  check("detail includes updated memory summary", detailJson.data?.window?.memorySummary?.targetUser === "OPC 创业者");

  const listResponse = await app.request("/api/radar-chats?radar_id=radar_ai_event_demo");
  const listJson = await json<{ success: boolean; data?: any; error?: any }>(listResponse);
  check("GET /api/radar-chats?radar_id returns 200", listResponse.status === 200, String(listResponse.status));
  check("list by radarId contains window", Array.isArray(listJson.data) && listJson.data.some((item: any) => item.id === chatWindow?.id));

  const secondResponse = await app.request("/api/radar-chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      radarId: "radar_policy_demo",
      title: "政策补贴雷达",
      userId: "demo_user",
    }),
  });
  const secondJson = await json<{ success: boolean; data?: any; error?: any }>(secondResponse);
  check("second chat window can be created", secondResponse.status === 200 && secondJson.success === true, JSON.stringify(secondJson.error ?? {}));
  check("second chat window has different id", Boolean(secondJson.data?.id) && secondJson.data.id !== chatWindow?.id, `${secondJson.data?.id} vs ${chatWindow?.id}`);

  await app.request(`/api/radar-chats/${secondJson.data?.id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "user",
      content: "我想找广东科技政策申报机会。",
      linkedRadarVersion: "V1.0",
    }),
  });

  const firstMessages = ctx.radarChatStore.listMessages(chatWindow.id);
  const secondMessages = ctx.radarChatStore.listMessages(secondJson.data.id);
  check("first window keeps its own messages", firstMessages.some((item) => item.content.includes("OPC 创业者")));
  check("second window keeps its own messages", secondMessages.some((item) => item.content.includes("广东科技政策")));
  check("second window does not leak first messages", secondMessages.every((item) => !item.content.includes("OPC 创业者")));

  const allWindowsResponse = await app.request("/api/radar-chats?user_id=demo_user");
  const allWindowsJson = await json<{ success: boolean; data?: any[]; error?: any }>(allWindowsResponse);
  check("list returns multiple active windows", Array.isArray(allWindowsJson.data) && allWindowsJson.data.length >= 2);
  check("list contains both radar ids", JSON.stringify(allWindowsJson.data).includes("radar_ai_event_demo") && JSON.stringify(allWindowsJson.data).includes("radar_policy_demo"));

  const renameResponse = await app.request(`/api/radar-chats/${secondJson.data?.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "广州政策补贴雷达" }),
  });
  const renameJson = await json<{ success: boolean; data?: any; error?: any }>(renameResponse);
  check("PATCH /api/radar-chats/:id renames a window", renameResponse.status === 200 && renameJson.data?.title === "广州政策补贴雷达", JSON.stringify(renameJson.error ?? renameJson.data ?? {}));

  const archiveResponse = await app.request(`/api/radar-chats/${secondJson.data?.id}`, { method: "DELETE" });
  const archiveJson = await json<{ success: boolean; data?: any; error?: any }>(archiveResponse);
  check("DELETE /api/radar-chats/:id hard deletes a window", archiveResponse.status === 200 && archiveJson.data?.deleted === true, JSON.stringify(archiveJson.error ?? archiveJson.data ?? {}));
  check("deleted chat window cannot be fetched", ctx.radarChatStore.get(secondJson.data?.id) === null);
  check("deleted chat messages are removed", ctx.radarChatStore.listMessages(secondJson.data?.id).length === 0);

  const activeAfterArchiveResponse = await app.request("/api/radar-chats?user_id=demo_user");
  const activeAfterArchiveJson = await json<{ success: boolean; data?: any[]; error?: any }>(activeAfterArchiveResponse);
  check("deleted window disappears from active list", Array.isArray(activeAfterArchiveJson.data) && !activeAfterArchiveJson.data.some((item) => item.id === secondJson.data?.id), JSON.stringify(activeAfterArchiveJson.data ?? []));

  const archivedListResponse = await app.request("/api/radar-chats?user_id=demo_user&include_archived=true");
  const archivedListJson = await json<{ success: boolean; data?: any[]; error?: any }>(archivedListResponse);
  check("deleted window does not remain when include_archived is requested", Array.isArray(archivedListJson.data) && !archivedListJson.data.some((item) => item.id === secondJson.data?.id), JSON.stringify(archivedListJson.data ?? []));

  const quotaUser = "quota_user";
  const quotaWindows: any[] = [];
  const sampleRoomResponse = await app.request("/api/radar-chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      radarId: "ai-event-sample-room",
      title: "AI 赛事雷达",
      userId: quotaUser,
      draftRadarVersion: "V1.0",
    }),
  });
  const sampleRoomJson = await json<{ success: boolean; data?: any; error?: any }>(sampleRoomResponse);
  check("built-in AI event sample room does not fail quota precheck", sampleRoomResponse.status === 200 && sampleRoomJson.success === true, JSON.stringify(sampleRoomJson.error ?? {}));
  for (let i = 1; i <= 3; i += 1) {
    const response = await app.request("/api/radar-chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `测试雷达窗口 ${i}`,
        userId: quotaUser,
        draftRadarVersion: "V1.0",
      }),
    });
    const payload = await json<{ success: boolean; data?: any; error?: any }>(response);
    check(`free quota allows custom chat window ${i}`, response.status === 200 && payload.success === true, JSON.stringify(payload.error ?? {}));
    quotaWindows.push(payload.data);
  }

  const quotaBlockedResponse = await app.request("/api/radar-chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "第 4 个雷达窗口",
      userId: quotaUser,
      draftRadarVersion: "V1.0",
    }),
  });
  const quotaBlockedJson = await json<{ success: boolean; data?: any; error?: any }>(quotaBlockedResponse);
  check("free quota blocks fourth custom chat window", quotaBlockedResponse.status === 403 && quotaBlockedJson.success === false, JSON.stringify(quotaBlockedJson));
  check("quota block returns clear error code", quotaBlockedJson.error?.code === "RADAR_CHAT_QUOTA_EXCEEDED", JSON.stringify(quotaBlockedJson.error ?? {}));

  const lateSampleUser = "late_sample_user";
  for (let i = 1; i <= 3; i += 1) {
    await app.request("/api/radar-chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `普通用户雷达 ${i}`,
        userId: lateSampleUser,
        draftRadarVersion: "V1.0",
      }),
    });
  }
  const lateSampleRoomResponse = await app.request("/api/radar-chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      radarId: "ai-event-sample-room",
      title: "全球 AI 赛事导航",
      userId: lateSampleUser,
      draftRadarVersion: "V1.0",
    }),
  });
  const lateSampleRoomJson = await json<{ success: boolean; data?: any; error?: any }>(lateSampleRoomResponse);
  check(
    "built-in AI event sample room is available even after custom quota is full",
    lateSampleRoomResponse.status === 200 && lateSampleRoomJson.success === true && lateSampleRoomJson.data?.radarId === "ai-event-sample-room",
    JSON.stringify(lateSampleRoomJson.error ?? lateSampleRoomJson.data ?? {}),
  );

  const quotaArchiveResponse = await app.request(`/api/radar-chats/${quotaWindows[0]?.id}`, { method: "DELETE" });
  const quotaArchiveJson = await json<{ success: boolean; data?: any; error?: any }>(quotaArchiveResponse);
  check("deleting a chat window releases the quota slot", quotaArchiveResponse.status === 200 && quotaArchiveJson.data?.deleted === true, JSON.stringify(quotaArchiveJson.error ?? {}));
  check("deleted quota window is not restorable", ctx.radarChatStore.get(quotaWindows[0]?.id) === null);

  const quotaArchiveSecondResponse = await app.request(`/api/radar-chats/${quotaWindows[1]?.id}`, { method: "DELETE" });
  const quotaArchiveSecondJson = await json<{ success: boolean; data?: any; error?: any }>(quotaArchiveSecondResponse);
  check("deleting another window opens room for a new one", quotaArchiveSecondResponse.status === 200 && quotaArchiveSecondJson.data?.deleted === true, JSON.stringify(quotaArchiveSecondJson.error ?? {}));

  const quotaAfterArchiveResponse = await app.request("/api/radar-chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "释放配额后的新雷达窗口",
      userId: quotaUser,
      draftRadarVersion: "V1.0",
    }),
  });
  const quotaAfterArchiveJson = await json<{ success: boolean; data?: any; error?: any }>(quotaAfterArchiveResponse);
  check("new chat window can be created after delete releases quota", quotaAfterArchiveResponse.status === 200 && quotaAfterArchiveJson.success === true, JSON.stringify(quotaAfterArchiveJson.error ?? {}));

  ctx.radarChatStore.save();
  const freshCtx = createAppContext();
  if (!freshCtx.radarChatStore) {
    throw new Error("fresh createAppContext did not create radarChatStore");
  }
  const reloaded = freshCtx.radarChatStore.get(chatWindow.id);
  check("chat window persists after reload", reloaded?.id === chatWindow.id);
  check("chat messages persist after reload", freshCtx.radarChatStore.listMessages(chatWindow.id).length === 1);
}

run()
  .then(() => {
    if (fail > 0) {
      console.error(`Q.7-I chat window: ${pass} PASS / ${fail} FAIL`);
      process.exit(1);
    }
    console.log(`Q.7-I chat window: ${pass} PASS / 0 FAIL`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
