import fs from "node:fs";
import path from "node:path";

type RadarRecord = {
  id?: string;
  name?: string;
  ownerId?: string;
  isBuiltin?: boolean;
};

type RadarStoreFile = {
  radars?: RadarRecord[];
  version?: string;
};

type ChatWindowRecord = {
  id?: string;
  radarId?: string;
  userId?: string;
  title?: string;
  status?: string;
};

type ChatMessageRecord = {
  chatWindowId?: string;
};

type RadarChatStoreFile = {
  windows?: ChatWindowRecord[];
  messages?: ChatMessageRecord[];
  version?: string;
};

type CleanupSummary = {
  dryRun: boolean;
  radarStorePath: string;
  radarChatStorePath: string;
  removedRadars: Array<{ id: string; name: string; ownerId: string }>;
  removedChatWindows: Array<{ id: string; title: string; userId: string }>;
  removedChatMessages: number;
};

const QA_TEXT_PATTERNS = [
  /隔离雷达/i,
  /远程\s*smoke/i,
  /\bsmoke\b/i,
  /\bdebug\b/i,
  /\bqa\b/i,
];

const QA_USER_PATTERNS = [
  /^qa[_-]/i,
  /^test[_-]/i,
  /^aliyun_remote[_-]/i,
  /^browser[_-]?qa/i,
  /^mobile[_-]?qa/i,
];

function resolveStorePath(value: string | undefined, fallback: string): string {
  return path.resolve(process.cwd(), value || fallback);
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function matchesAny(value: string | undefined, patterns: RegExp[]): boolean {
  const text = String(value || "");
  return patterns.some((pattern) => pattern.test(text));
}

function isQaRadar(radar: RadarRecord): boolean {
  if (radar.isBuiltin) return false;
  return matchesAny(`${radar.id || ""} ${radar.name || ""}`, QA_TEXT_PATTERNS)
    || matchesAny(radar.ownerId, QA_USER_PATTERNS);
}

function isQaChatWindow(window: ChatWindowRecord): boolean {
  return matchesAny(`${window.id || ""} ${window.title || ""}`, QA_TEXT_PATTERNS)
    || matchesAny(window.userId, QA_USER_PATTERNS);
}

export function runQ7QaDataCleanup(env: NodeJS.ProcessEnv = process.env): CleanupSummary {
  const radarStorePath = resolveStorePath(env.CHANCEPING_RADAR_STORE_PATH, "data/radars.json");
  const radarChatStorePath = resolveStorePath(env.CHANCEPING_RADAR_CHAT_STORE_PATH, "data/radar-chat-windows.json");
  const dryRun = !/^(1|true|yes)$/i.test(env.CHANCEPING_CLEANUP_QA_RADARS_CONFIRM || "");

  const radarStore = readJson<RadarStoreFile>(radarStorePath, { radars: [], version: "1.0" });
  const chatStore = readJson<RadarChatStoreFile>(radarChatStorePath, { windows: [], messages: [], version: "1.0" });

  const radars = Array.isArray(radarStore.radars) ? radarStore.radars : [];
  const windows = Array.isArray(chatStore.windows) ? chatStore.windows : [];
  const messages = Array.isArray(chatStore.messages) ? chatStore.messages : [];

  const removedRadars = radars
    .filter(isQaRadar)
    .map((radar) => ({
      id: radar.id || "",
      name: radar.name || "",
      ownerId: radar.ownerId || "",
    }));
  const keptRadars = radars.filter((radar) => !isQaRadar(radar));

  const removedChatWindows = windows
    .filter(isQaChatWindow)
    .map((window) => ({
      id: window.id || "",
      title: window.title || "",
      userId: window.userId || "",
    }));
  const removedWindowIds = new Set(removedChatWindows.map((window) => window.id).filter(Boolean));
  const keptWindows = windows.filter((window) => !removedWindowIds.has(window.id || ""));
  const keptMessages = messages.filter((message) => !removedWindowIds.has(message.chatWindowId || ""));
  const removedChatMessages = messages.length - keptMessages.length;

  if (!dryRun) {
    writeJson(radarStorePath, {
      ...radarStore,
      radars: keptRadars,
      version: radarStore.version || "1.0",
    });
    writeJson(radarChatStorePath, {
      ...chatStore,
      windows: keptWindows,
      messages: keptMessages,
      version: chatStore.version || "1.0",
    });
  }

  return {
    dryRun,
    radarStorePath,
    radarChatStorePath,
    removedRadars,
    removedChatWindows,
    removedChatMessages,
  };
}

if ((process.argv[1] || "").includes("cleanup-q7-qa-data")) {
  const summary = runQ7QaDataCleanup();
  console.log(JSON.stringify({
    dryRun: summary.dryRun,
    radarStorePath: summary.radarStorePath,
    radarChatStorePath: summary.radarChatStorePath,
    removedRadars: summary.removedRadars,
    removedChatWindows: summary.removedChatWindows,
    removedChatMessages: summary.removedChatMessages,
  }, null, 2));
  if (summary.dryRun) {
    console.log("DRY_RUN_ONLY: set CHANCEPING_CLEANUP_QA_RADARS_CONFIRM=true to apply these removals.");
  }
}
