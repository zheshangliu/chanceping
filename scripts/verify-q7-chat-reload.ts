import fs from "fs";
import path from "path";
import { createApp } from "../src/api/app";
import { createAppContext } from "../src/api/context";

process.env.LLM_MODE = "mock";

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

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf-8");
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

async function post(app: ReturnType<typeof createApp>, pathName: string, body: unknown) {
  const response = await app.request(pathName, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json() as { success?: boolean; data?: any; error?: unknown },
  };
}

async function patch(app: ReturnType<typeof createApp>, pathName: string, body: unknown) {
  const response = await app.request(pathName, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json() as { success?: boolean; data?: any; error?: unknown },
  };
}

async function get(app: ReturnType<typeof createApp>, pathName: string) {
  const response = await app.request(pathName);
  return {
    status: response.status,
    json: await response.json() as { success?: boolean; data?: any; error?: unknown },
  };
}

async function runSourceChecks() {
  const store = read("src/agents/radar-chat-store.ts");
  const route = read("src/api/routes/radar-chats.ts");
  const hero = read("web/hero-radar-chat.js");

  check("chat store persists draft snapshot", /draftSnapshot/.test(store));
  check("chat store persists message artifact payload", /artifactPayload/.test(store));
  check("chat store persists pending input message", /pendingMessage/.test(store));
  check("radar chat API accepts draft snapshot", /draftSnapshot/.test(route));
  check("radar chat API accepts artifact payload", /artifactPayload/.test(route));
  check("radar chat API accepts pending input message", /pendingMessage/.test(route));
  check("hero chat remembers last chat window outside sessionStorage", /LAST_CHAT_WINDOW_KEY/.test(hero));
  check("hero chat can GET radar chat detail", /getJson\(`?\/api\/radar-chats\/\$\{/.test(hero) || /getJson\(.*\/api\/radar-chats/.test(hero));
  check("hero chat restores state from backend", /restoreStateFromBackend/.test(hero) && /artifactPayload/.test(hero));
}

async function runApiRoundTrip() {
  const dataDir = path.resolve(process.cwd(), "data/q7-chat-reload-test");
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.CHANCEPING_RADAR_CHAT_STORE_PATH = "data/q7-chat-reload-test/radar-chat-windows.json";

  const ctx = createAppContext();
  const app = createApp(ctx);

  const created = await post(app, "/api/radar-chats", {
    title: "AI 赛事雷达",
    radarId: "ai-event-sample-room",
    draftRadarVersion: "V1.0",
  });
  const chatWindowId = String(created.json.data?.id ?? "");
  check("test chat window created", created.status === 200 && Boolean(chatWindowId), `${created.status} ${json(created.json.error)}`);

  const draftSnapshot = {
    suggestedName: "AI 赛事雷达",
    radarVersion: { version: "V1.0", targetUser: "大湾区 OPC" },
    spec: { confirmation_status: { user_confirmed: false } },
  };
  const patched = await patch(app, `/api/radar-chats/${chatWindowId}`, {
    draftSnapshot,
    currentResultSnapshot: { runId: "run_reload_test", markdown: "# reload report" },
  });
  check("PATCH stores draft snapshot", patched.status === 200 && patched.json.success === true, `${patched.status} ${json(patched.json.error)}`);

  const message = await post(app, `/api/radar-chats/${chatWindowId}/messages`, {
    role: "assistant",
    content: "我把雷达更新为 V1.0。",
    linkedRadarVersion: "V1.0",
    artifactType: "radar",
    artifactPayload: {
      type: "radar",
      version: "V1.0",
      status: "draft",
      payload: { version: "V1.0", targetUser: "大湾区 OPC" },
    },
  });
  check("POST /messages stores artifact payload", message.status === 200 && message.json.success === true, `${message.status} ${json(message.json.error)}`);

  const detail = await get(app, `/api/radar-chats/${chatWindowId}`);
  const windowData = detail.json.data?.window;
  const messages = detail.json.data?.messages ?? [];
  check("GET detail returns draft snapshot", /大湾区 OPC/.test(json(windowData?.draftSnapshot)), json(windowData));
  check("GET detail returns current result snapshot", /reload report/.test(json(windowData?.currentResultSnapshot)), json(windowData));
  check("GET detail returns artifact payload", /artifactPayload/.test(json(messages)) && /V1.0/.test(json(messages)), json(messages));

  const second = await post(app, "/api/radar-chats", {
    title: "政策申报雷达",
    radarId: "radar_policy_demo",
    draftRadarVersion: "V1.0",
    pendingMessage: "我想找广州政策补贴申报机会。",
  });
  const secondId = String(second.json.data?.id ?? "");
  check("POST stores pending input message", second.json.data?.pendingMessage === "我想找广州政策补贴申报机会。", json(second.json.data));
  await post(app, `/api/radar-chats/${secondId}/messages`, {
    role: "user",
    content: "我想找广州政策补贴申报机会。",
    linkedRadarVersion: "V1.0",
  });
  const secondDetail = await get(app, `/api/radar-chats/${secondId}`);
  check("GET detail returns pending input message", secondDetail.json.data?.window?.pendingMessage === "我想找广州政策补贴申报机会。", json(secondDetail.json.data?.window));
  check("second reload detail has its own message", /广州政策补贴/.test(json(secondDetail.json.data?.messages)));
  check("second reload detail does not include first report", !/reload report/.test(json(secondDetail.json.data?.messages)));
}

runSourceChecks()
  .then(runApiRoundTrip)
  .then(() => {
    if (fail > 0) {
      console.error(`Q.7 chat reload: ${pass} PASS / ${fail} FAIL`);
      process.exit(1);
    }
    console.log(`Q.7 chat reload: ${pass} PASS / 0 FAIL`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
