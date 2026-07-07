import { Hono } from "hono";
import type { AppContext } from "../context";
import type { ApiResponse } from "../types";
import { getCurrentUser } from "../../agents/user-context";
import { JsonRadarChatStore } from "../../agents/radar-chat-store";
import type {
  RadarChatArtifactType,
  RadarChatMessageRole,
  RadarChatWindowUpdateInput,
} from "../../agents/radar-chat-store";

function errorResponse(code: string, message: string, durationMs: number, status: number) {
  return { success: false, data: null, error: { code, message }, duration_ms: durationMs } satisfies ApiResponse;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringOrEmpty(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asJsonPayload(value: unknown): unknown | undefined {
  if (value === null) return null;
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" ? value : undefined;
}

function isMessageRole(value: unknown): value is RadarChatMessageRole {
  return value === "user" || value === "assistant" || value === "system_event";
}

function isArtifactType(value: unknown): value is RadarChatArtifactType {
  return value === "radar" || value === "report" || value === "progress";
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function radarChatRoutes(ctx: AppContext): Hono {
  const app = new Hono();
  const store = ctx.radarChatStore ?? new JsonRadarChatStore();

  app.get("/", (c) => {
    const start = Date.now();
    const user = getCurrentUser();
    const radarId = c.req.query("radar_id") || undefined;
    const userId = c.req.query("user_id") || user.userId;
    const includeArchived = c.req.query("include_archived") === "true";
    const windows = store.list({
      ...(radarId ? { radarId } : {}),
      ...(userId ? { userId } : {}),
      includeArchived,
    });
    return c.json({ success: true, data: windows, error: null, duration_ms: Date.now() - start } satisfies ApiResponse);
  });

  app.post("/", async (c) => {
    const start = Date.now();
    const body = await readJson(c);
    if (!body) {
      return c.json(errorResponse("BAD_REQUEST", "请求体不是合法 JSON", Date.now() - start, 400), 400);
    }
    const title = asOptionalString(body.title);
    if (!title) {
      return c.json(errorResponse("BAD_REQUEST", "title 必填", Date.now() - start, 400), 400);
    }
    const user = getCurrentUser();
    const radarId = asOptionalString(body.radarId);
    const userId = asOptionalString(body.userId) || user.userId;
    const reuseByRadarId = body.reuseByRadarId !== false;
    if (radarId && reuseByRadarId) {
      const existing = store
        .list({ radarId, userId })
        .find((item) => item.status === "active");
      if (existing) {
        return c.json({ success: true, data: existing, error: null, duration_ms: Date.now() - start } satisfies ApiResponse);
      }
    }

    const window = store.create({
      radarId,
      userId,
      title,
      currentConfirmedRadarVersion: asOptionalString(body.currentConfirmedRadarVersion),
      draftRadarVersion: asOptionalString(body.draftRadarVersion),
      pendingMessage: asStringOrEmpty(body.pendingMessage),
    });
    store.save();
    return c.json({ success: true, data: window, error: null, duration_ms: Date.now() - start } satisfies ApiResponse);
  });

  app.get("/:id", (c) => {
    const start = Date.now();
    const id = c.req.param("id");
    const window = store.get(id);
    if (!window) {
      return c.json(errorResponse("RADAR_CHAT_NOT_FOUND", "雷达聊天窗口不存在", Date.now() - start, 404), 404);
    }
    const messages = store.listMessages(id);
    return c.json({ success: true, data: { window, messages }, error: null, duration_ms: Date.now() - start } satisfies ApiResponse);
  });

  app.patch("/:id", async (c) => {
    const start = Date.now();
    const id = c.req.param("id");
    const body = await readJson(c);
    if (!body) {
      return c.json(errorResponse("BAD_REQUEST", "请求体不是合法 JSON", Date.now() - start, 400), 400);
    }
    const patch: RadarChatWindowUpdateInput = {
      ...("radarId" in body ? { radarId: asOptionalString(body.radarId) } : {}),
      ...(asOptionalString(body.title) ? { title: asOptionalString(body.title) } : {}),
      ...("currentConfirmedRadarVersion" in body ? { currentConfirmedRadarVersion: asOptionalString(body.currentConfirmedRadarVersion) } : {}),
      ...("draftRadarVersion" in body ? { draftRadarVersion: asOptionalString(body.draftRadarVersion) } : {}),
      ...("latestRunId" in body ? { latestRunId: asOptionalString(body.latestRunId) } : {}),
      ...("latestReportId" in body ? { latestReportId: asOptionalString(body.latestReportId) } : {}),
      ...("pendingMessage" in body ? { pendingMessage: asStringOrEmpty(body.pendingMessage) } : {}),
      ...("draftSnapshot" in body ? { draftSnapshot: asJsonPayload(body.draftSnapshot) } : {}),
      ...("currentResultSnapshot" in body ? { currentResultSnapshot: asJsonPayload(body.currentResultSnapshot) } : {}),
    };
    const updated = store.update(id, patch);
    if (!updated) {
      return c.json(errorResponse("RADAR_CHAT_NOT_FOUND", "雷达聊天窗口不存在", Date.now() - start, 404), 404);
    }
    store.save();
    return c.json({ success: true, data: updated, error: null, duration_ms: Date.now() - start } satisfies ApiResponse);
  });

  app.post("/:id/messages", async (c) => {
    const start = Date.now();
    const id = c.req.param("id");
    const body = await readJson(c);
    if (!body) {
      return c.json(errorResponse("BAD_REQUEST", "请求体不是合法 JSON", Date.now() - start, 400), 400);
    }
    const role = body.role;
    const content = asOptionalString(body.content);
    if (!isMessageRole(role) || !content) {
      return c.json(errorResponse("BAD_REQUEST", "role 和 content 必填", Date.now() - start, 400), 400);
    }
    const artifactType = isArtifactType(body.artifactType) ? body.artifactType : undefined;
    const message = store.appendMessage(id, {
      role,
      content,
      linkedRadarVersion: asOptionalString(body.linkedRadarVersion),
      linkedRunId: asOptionalString(body.linkedRunId),
      linkedReportId: asOptionalString(body.linkedReportId),
      artifactType,
      ...("artifactPayload" in body ? { artifactPayload: asJsonPayload(body.artifactPayload) } : {}),
    });
    if (!message) {
      return c.json(errorResponse("RADAR_CHAT_NOT_FOUND", "雷达聊天窗口不存在", Date.now() - start, 404), 404);
    }
    store.save();
    return c.json({
      success: true,
      data: { window: store.get(id), message },
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse);
  });

  app.put("/:id/memory-summary", async (c) => {
    const start = Date.now();
    const id = c.req.param("id");
    const body = await readJson(c);
    if (!body) {
      return c.json(errorResponse("BAD_REQUEST", "请求体不是合法 JSON", Date.now() - start, 400), 400);
    }
    const updated = store.update(id, {
      memorySummary: {
        summary: asOptionalString(body.summary) || "",
        targetUser: asOptionalString(body.targetUser),
        watchingFor: Array.isArray(body.watchingFor) ? body.watchingFor.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
        exclusions: Array.isArray(body.exclusions) ? body.exclusions.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
        confirmedRules: Array.isArray(body.confirmedRules) ? body.confirmedRules.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
        rejectedPatterns: Array.isArray(body.rejectedPatterns) ? body.rejectedPatterns.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
        lastFeedback: asOptionalString(body.lastFeedback),
      },
    });
    if (!updated) {
      return c.json(errorResponse("RADAR_CHAT_NOT_FOUND", "雷达聊天窗口不存在", Date.now() - start, 404), 404);
    }
    store.save();
    return c.json({ success: true, data: updated, error: null, duration_ms: Date.now() - start } satisfies ApiResponse);
  });

  app.delete("/:id", (c) => {
    const start = Date.now();
    const id = c.req.param("id");
    const archived = store.archive(id);
    if (!archived) {
      return c.json(errorResponse("RADAR_CHAT_NOT_FOUND", "雷达聊天窗口不存在", Date.now() - start, 404), 404);
    }
    store.save();
    return c.json({ success: true, data: archived, error: null, duration_ms: Date.now() - start } satisfies ApiResponse);
  });

  return app;
}
