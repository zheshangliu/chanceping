import { Hono } from "hono";
import type { AppContext } from "../context";
import type { ApiResponse } from "../types";

const AI_EVENT_PATTERN = /AI|Agent|Hackathon|黑客松|赛事|比赛|马拉松|TRAE|Qwen|Devpost|DoraHacks|Lablab|Kaggle|开发者挑战|云资源|创业扶持/i;

function toCustomerReason(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "与 AI 赛事雷达相关，建议打开官方入口进一步复核。";
  if (/Live Evidence MVP|LLM\s*仍保持\s*mock|mock\s*轻量评估/i.test(text)) {
    if (/未读取正文|仅保留搜索发现|待复核/.test(text)) {
      return "搜索发现来源，尚未读取完整正文；请打开官方入口复核报名、截止时间和参赛资格。";
    }
    if (/已有限读取|已读取网页正文/.test(text)) {
      return "已读取来源页面的部分正文；报名资格、费用、截止时间和提交要求仍以官方页面为准。";
    }
    return "搜索发现来源，字段仍需复核；不要直接当作已确认报名机会。";
  }
  return text;
}

export function publicAiEventsRoutes(ctx: AppContext): Hono {
  const app = new Hono();

  app.get("/ai-events", (c) => {
    const start = Date.now();
    const entries = ctx.store.list({ page_size: 1000 }).entries ?? [];
    const items = entries
      .map((entry: any) => entry.card ?? entry)
      .filter((card: any) => {
        const haystack = [
          card.title,
          card.search_result?.title,
          card.opportunity_kind,
          card.source_name,
          card.match_reason,
          card.relevance_reason,
        ].filter(Boolean).join(" ");
        return AI_EVENT_PATTERN.test(haystack);
      })
      .slice(0, 60)
      .map((card: any) => ({
        title: card.title ?? card.search_result?.title ?? "未命名赛事",
        platform: card.source_name ?? card.search_result?.source_provider ?? "待识别",
        statusLabel: card.deadline ? "开放报名" : "待复核",
        tags: [card.opportunity_kind, card.action_status, card.evidence_status]
          .filter(Boolean)
          .slice(0, 4),
        deadline: card.deadline ?? card.date_or_deadline ?? "",
        reward: card.reward_or_value ?? card.prize ?? "",
        reason: toCustomerReason(card.match_reason ?? card.relevance_reason ?? card.ai_analysis ?? ""),
        officialUrl: card.official_source_url ?? card.search_result?.url ?? "",
      }));

    return c.json({
      success: true,
      data: { items },
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse);
  });

  return app;
}
