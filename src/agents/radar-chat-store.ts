/**
 * RadarChatStore —— Q.7-I 一窗口一雷达的数据层。
 *
 * 设计原则：
 * - 一个 RadarChatWindow 绑定一个 radarId，可先有聊天窗口，后续再绑定保存后的长期雷达。
 * - 消息和 memory summary 只保存上下文，不直接触发搜索、不调用 LLM。
 * - JSON 文件持久化，保持与 RadarStore / ReportStore 一致，便于回滚。
 */

import fs from "fs";
import path from "path";

export type RadarChatWindowStatus = "active" | "archived";
export type RadarChatMessageRole = "user" | "assistant" | "system_event";
export type RadarChatArtifactType = "radar" | "report" | "progress";

export interface RadarMemorySummary {
  summary: string;
  targetUser?: string;
  watchingFor: string[];
  exclusions: string[];
  confirmedRules: string[];
  rejectedPatterns: string[];
  lastFeedback?: string;
  updatedAt: string;
}

export interface RadarChatWindow {
  id: string;
  radarId?: string;
  userId: string;
  title: string;
  status: RadarChatWindowStatus;
  currentConfirmedRadarVersion?: string;
  draftRadarVersion?: string;
  latestRunId?: string;
  latestReportId?: string;
  pendingMessage?: string;
  draftSnapshot?: unknown;
  currentResultSnapshot?: unknown;
  memorySummary: RadarMemorySummary;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface RadarChatMessage {
  id: string;
  chatWindowId: string;
  role: RadarChatMessageRole;
  content: string;
  linkedRadarVersion?: string;
  linkedRunId?: string;
  linkedReportId?: string;
  artifactType?: RadarChatArtifactType;
  artifactPayload?: unknown;
  createdAt: string;
}

export interface RadarChatWindowCreateInput {
  radarId?: string;
  userId?: string;
  title: string;
  currentConfirmedRadarVersion?: string;
  draftRadarVersion?: string;
  pendingMessage?: string;
}

export interface RadarChatWindowUpdateInput {
  radarId?: string;
  title?: string;
  status?: RadarChatWindowStatus;
  currentConfirmedRadarVersion?: string;
  draftRadarVersion?: string;
  latestRunId?: string;
  latestReportId?: string;
  pendingMessage?: string;
  draftSnapshot?: unknown;
  currentResultSnapshot?: unknown;
  memorySummary?: Partial<Omit<RadarMemorySummary, "updatedAt">>;
}

export interface RadarChatMessageCreateInput {
  role: RadarChatMessageRole;
  content: string;
  linkedRadarVersion?: string;
  linkedRunId?: string;
  linkedReportId?: string;
  artifactType?: RadarChatArtifactType;
  artifactPayload?: unknown;
}

export interface RadarChatWindowListFilter {
  radarId?: string;
  userId?: string;
  status?: RadarChatWindowStatus;
  includeArchived?: boolean;
}

export interface RadarChatStore {
  create(input: RadarChatWindowCreateInput): RadarChatWindow;
  get(id: string): RadarChatWindow | null;
  list(filter?: RadarChatWindowListFilter): RadarChatWindow[];
  listByRadarId(radarId: string): RadarChatWindow[];
  update(id: string, patch: RadarChatWindowUpdateInput): RadarChatWindow | null;
  archive(id: string): RadarChatWindow | null;
  appendMessage(chatWindowId: string, input: RadarChatMessageCreateInput): RadarChatMessage | null;
  listMessages(chatWindowId: string): RadarChatMessage[];
  save(): void;
  load(): void;
}

interface RadarChatStoreFile {
  windows: RadarChatWindow[];
  messages: RadarChatMessage[];
  version: string;
}

const DEFAULT_RADAR_CHAT_STORE_PATH = "data/radar-chat-windows.json";

function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}${rand}`;
}

function nextIsoTimestamp(previousIso?: string): string {
  const now = new Date();
  const previousMs = previousIso ? new Date(previousIso).getTime() : Number.NaN;
  if (Number.isFinite(previousMs) && now.getTime() <= previousMs) {
    return new Date(previousMs + 1).toISOString();
  }
  return now.toISOString();
}

function createEmptyMemorySummary(now: string): RadarMemorySummary {
  return {
    summary: "",
    watchingFor: [],
    exclusions: [],
    confirmedRules: [],
    rejectedPatterns: [],
    updatedAt: now,
  };
}

function mergeMemorySummary(
  existing: RadarMemorySummary,
  patch?: Partial<Omit<RadarMemorySummary, "updatedAt">>,
  updatedAt: string = new Date().toISOString(),
): RadarMemorySummary {
  if (!patch) {
    return { ...existing, updatedAt };
  }
  return {
    ...existing,
    ...("summary" in patch ? { summary: patch.summary ?? "" } : {}),
    ...("targetUser" in patch ? { targetUser: patch.targetUser } : {}),
    ...("watchingFor" in patch ? { watchingFor: Array.isArray(patch.watchingFor) ? patch.watchingFor : [] } : {}),
    ...("exclusions" in patch ? { exclusions: Array.isArray(patch.exclusions) ? patch.exclusions : [] } : {}),
    ...("confirmedRules" in patch ? { confirmedRules: Array.isArray(patch.confirmedRules) ? patch.confirmedRules : [] } : {}),
    ...("rejectedPatterns" in patch ? { rejectedPatterns: Array.isArray(patch.rejectedPatterns) ? patch.rejectedPatterns : [] } : {}),
    ...("lastFeedback" in patch ? { lastFeedback: patch.lastFeedback } : {}),
    updatedAt,
  };
}

export class JsonRadarChatStore implements RadarChatStore {
  private readonly filePath: string;
  private windows: Map<string, RadarChatWindow> = new Map();
  private messages: Map<string, RadarChatMessage[]> = new Map();

  constructor(options: { file_path?: string } = {}) {
    const filePath = options.file_path ?? process.env.CHANCEPING_RADAR_CHAT_STORE_PATH ?? DEFAULT_RADAR_CHAT_STORE_PATH;
    this.filePath = path.resolve(process.cwd(), filePath);
    this.load();
  }

  create(input: RadarChatWindowCreateInput): RadarChatWindow {
    const now = new Date().toISOString();
    const window: RadarChatWindow = {
      id: generateId("radar_chat"),
      ...(input.radarId ? { radarId: input.radarId } : {}),
      userId: input.userId || "demo_user",
      title: input.title,
      status: "active",
      ...(input.currentConfirmedRadarVersion ? { currentConfirmedRadarVersion: input.currentConfirmedRadarVersion } : {}),
      ...(input.draftRadarVersion ? { draftRadarVersion: input.draftRadarVersion } : {}),
      ...(input.pendingMessage ? { pendingMessage: input.pendingMessage } : {}),
      memorySummary: createEmptyMemorySummary(now),
      createdAt: now,
      updatedAt: now,
    };
    this.windows.set(window.id, window);
    this.messages.set(window.id, []);
    return window;
  }

  get(id: string): RadarChatWindow | null {
    return this.windows.get(id) ?? null;
  }

  list(filter?: RadarChatWindowListFilter): RadarChatWindow[] {
    let result = Array.from(this.windows.values());
    if (!filter?.includeArchived) {
      result = result.filter((item) => item.status !== "archived");
    }
    if (filter?.radarId !== undefined) {
      result = result.filter((item) => item.radarId === filter.radarId);
    }
    if (filter?.userId !== undefined) {
      result = result.filter((item) => item.userId === filter.userId);
    }
    if (filter?.status !== undefined) {
      result = result.filter((item) => item.status === filter.status);
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  listByRadarId(radarId: string): RadarChatWindow[] {
    return this.list({ radarId });
  }

  update(id: string, patch: RadarChatWindowUpdateInput): RadarChatWindow | null {
    const existing = this.windows.get(id);
    if (!existing) return null;
    const updatedAt = nextIsoTimestamp(existing.updatedAt);
    const updated: RadarChatWindow = {
      ...existing,
      ...("radarId" in patch ? { radarId: patch.radarId } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...("currentConfirmedRadarVersion" in patch ? { currentConfirmedRadarVersion: patch.currentConfirmedRadarVersion } : {}),
      ...("draftRadarVersion" in patch ? { draftRadarVersion: patch.draftRadarVersion } : {}),
      ...("latestRunId" in patch ? { latestRunId: patch.latestRunId } : {}),
      ...("latestReportId" in patch ? { latestReportId: patch.latestReportId } : {}),
      ...("pendingMessage" in patch ? { pendingMessage: patch.pendingMessage } : {}),
      ...("draftSnapshot" in patch ? { draftSnapshot: patch.draftSnapshot } : {}),
      ...("currentResultSnapshot" in patch ? { currentResultSnapshot: patch.currentResultSnapshot } : {}),
      memorySummary: mergeMemorySummary(existing.memorySummary, patch.memorySummary, updatedAt),
      updatedAt,
    };
    this.windows.set(id, updated);
    return updated;
  }

  archive(id: string): RadarChatWindow | null {
    const existing = this.windows.get(id);
    if (!existing) return null;
    const updatedAt = nextIsoTimestamp(existing.updatedAt);
    const archived: RadarChatWindow = {
      ...existing,
      status: "archived",
      updatedAt,
      archivedAt: updatedAt,
    };
    this.windows.set(id, archived);
    return archived;
  }

  appendMessage(chatWindowId: string, input: RadarChatMessageCreateInput): RadarChatMessage | null {
    const existing = this.windows.get(chatWindowId);
    if (!existing) return null;
    const now = nextIsoTimestamp(existing.updatedAt);
    const message: RadarChatMessage = {
      id: generateId("radar_msg"),
      chatWindowId,
      role: input.role,
      content: input.content,
      ...(input.linkedRadarVersion ? { linkedRadarVersion: input.linkedRadarVersion } : {}),
      ...(input.linkedRunId ? { linkedRunId: input.linkedRunId } : {}),
      ...(input.linkedReportId ? { linkedReportId: input.linkedReportId } : {}),
      ...(input.artifactType ? { artifactType: input.artifactType } : {}),
      ...("artifactPayload" in input ? { artifactPayload: input.artifactPayload } : {}),
      createdAt: now,
    };
    const messages = this.messages.get(chatWindowId) ?? [];
    messages.push(message);
    this.messages.set(chatWindowId, messages);
    this.windows.set(chatWindowId, { ...existing, updatedAt: now });
    return message;
  }

  listMessages(chatWindowId: string): RadarChatMessage[] {
    return [...(this.messages.get(chatWindowId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data: RadarChatStoreFile = {
      windows: Array.from(this.windows.values()),
      messages: Array.from(this.messages.values()).flat(),
      version: "1.0",
    };
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  load(): void {
    this.windows.clear();
    this.messages.clear();
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const data = JSON.parse(raw) as Partial<RadarChatStoreFile>;
      for (const window of data.windows ?? []) {
        this.windows.set(window.id, window);
      }
      for (const message of data.messages ?? []) {
        const messages = this.messages.get(message.chatWindowId) ?? [];
        messages.push(message);
        this.messages.set(message.chatWindowId, messages);
      }
      for (const id of this.windows.keys()) {
        if (!this.messages.has(id)) {
          this.messages.set(id, []);
        }
      }
    } catch {
      this.windows.clear();
      this.messages.clear();
    }
  }
}
