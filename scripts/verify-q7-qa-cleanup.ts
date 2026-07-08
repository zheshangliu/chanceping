import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runQ7QaDataCleanup } from "./cleanup-q7-qa-data";

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

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chanceping-q7-cleanup-"));
const radarStorePath = path.join(tempDir, "radars.json");
const chatStorePath = path.join(tempDir, "radar-chat-windows.json");

fs.writeFileSync(radarStorePath, JSON.stringify({
  version: "1.0",
  radars: [
    { id: "builtin_ai_competition", name: "全球 AI 赛事导航", isBuiltin: true, ownerId: "system" },
    { id: "radar_alpha", name: "Alpha 隔离雷达", isBuiltin: false, ownerId: "qa_alpha" },
    { id: "radar_real", name: "真实客户雷达", isBuiltin: false, ownerId: "visitor_real" },
  ],
}, null, 2));

fs.writeFileSync(chatStorePath, JSON.stringify({
  version: "1.0",
  windows: [
    { id: "chat_builtin", radarId: "ai-event-sample-room", userId: "visitor_real", title: "全球 AI 赛事导航", status: "active" },
    { id: "chat_smoke", userId: "aliyun_remote_123", title: "远程 smoke 自定义雷达 1", status: "active" },
    { id: "chat_real", userId: "visitor_real", title: "真实客户窗口", status: "active" },
  ],
  messages: [
    { id: "msg_smoke", chatWindowId: "chat_smoke", role: "user", content: "test" },
    { id: "msg_real", chatWindowId: "chat_real", role: "user", content: "real" },
  ],
}, null, 2));

const dryRun = runQ7QaDataCleanup({
  CHANCEPING_RADAR_STORE_PATH: radarStorePath,
  CHANCEPING_RADAR_CHAT_STORE_PATH: chatStorePath,
});

check("dry run reports QA radar", dryRun.dryRun === true && dryRun.removedRadars.length === 1, JSON.stringify(dryRun));
check("dry run reports QA chat window", dryRun.removedChatWindows.length === 1 && dryRun.removedChatMessages === 1, JSON.stringify(dryRun));
check("dry run does not modify radar file", readJson(radarStorePath).radars.length === 3);
check("dry run does not modify chat file", readJson(chatStorePath).windows.length === 3);

const applied = runQ7QaDataCleanup({
  CHANCEPING_RADAR_STORE_PATH: radarStorePath,
  CHANCEPING_RADAR_CHAT_STORE_PATH: chatStorePath,
  CHANCEPING_CLEANUP_QA_RADARS_CONFIRM: "true",
});

const finalRadars = readJson(radarStorePath).radars;
const finalChats = readJson(chatStorePath);
check("confirm cleanup is not dry run", applied.dryRun === false);
check("confirm cleanup removes QA radar only", finalRadars.length === 2 && finalRadars.some((radar: any) => radar.id === "builtin_ai_competition") && finalRadars.some((radar: any) => radar.id === "radar_real"), JSON.stringify(finalRadars));
check("confirm cleanup removes QA chat only", finalChats.windows.length === 2 && finalChats.windows.some((window: any) => window.id === "chat_builtin") && finalChats.windows.some((window: any) => window.id === "chat_real"), JSON.stringify(finalChats.windows));
check("confirm cleanup removes messages for deleted chat", finalChats.messages.length === 1 && finalChats.messages[0].id === "msg_real", JSON.stringify(finalChats.messages));

fs.rmSync(tempDir, { recursive: true, force: true });

console.log(`Q7 QA cleanup: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
