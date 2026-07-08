import { Hono } from "hono";
import fs from "fs";
import path from "path";
import type { AppContext } from "../context";
import type { ApiResponse, SearchRequest } from "../types";
import { SearchOrchestrator } from "../../search/orchestrator";
import type { SearchOrchestratorResult } from "../../search/orchestrator";
import type { RadarRequirementSpec } from "../../schema/radar-requirement-spec";
import type { OpportunityCard } from "../../schema/opportunity-card";
import type { ProviderRouting } from "../../schema/radar";
import { getDataMode, getLlmMode } from "../../demo/data-mode";
import { resolveSearchDataMode, validateLiveSearchResult } from "../../config/local-live-search";
import { withSearchRunOutcome } from "../search-outcome";
import { generateRadarReport, type RadarReportInput } from "../../agents/radar-report-generator";
import { generateLiveLlmEvidenceExplanation } from "../../agents/live-llm-report-explainer";
import { resolveLiveLlmProfile, toLiveLlmPublicProfile } from "../../config/live-llm-profile";

type RadarJobStatus = "queued" | "running" | "succeeded" | "failed";
type RadarJobPhase = "queued" | "searching" | "reporting" | "completed" | "failed";

interface RadarJobProgressEvent {
  at: string;
  phase: RadarJobPhase;
  line: string;
}

interface RadarJobResult {
  search: SearchOrchestratorResult & { runOutcome?: unknown };
  report: {
    success: boolean;
    markdown: string | null;
    error?: string | null;
    reportId?: string;
    filename?: string;
  };
}

interface RadarJobRecord {
  id: string;
  status: RadarJobStatus;
  phase: RadarJobPhase;
  progressLine: string;
  progressEvents: RadarJobProgressEvent[];
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  result?: RadarJobResult;
  error?: { code: string; message: string };
}

interface RadarJobRunRequest extends SearchRequest {
  radar_type?: "ai_competition" | "opc_policy" | "cultural_heritage" | "custom";
  profile?: unknown;
  period_start?: string;
  period_end?: string;
}

function createJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function addProgress(job: RadarJobRecord, phase: RadarJobPhase, line: string): void {
  const at = nowIso();
  job.phase = phase;
  job.progressLine = line;
  job.updatedAt = at;
  job.progressEvents.push({ at, phase, line });
}

function publicJob(job: RadarJobRecord): RadarJobRecord {
  return {
    ...job,
    progressEvents: [...job.progressEvents],
  };
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/DeepSeek|Qwen|Serper|LLM|API/gi, "盯机会")
    .replace(/serper:/gi, "盯机会：");
}

function createDefaultSpec(): RadarRequirementSpec {
  return {
    product_name: "ChancePing",
    product_category: "机会雷达",
    client_profile: {
      client_name: "自定义雷达用户",
      client_type: "团队",
      industry: "机会搜索",
      business_type: "服务",
      company_stage: "未知",
      products_or_projects: ["机会雷达"],
      target_users: ["目标客户"],
      core_capabilities: ["搜索", "筛选", "报告"],
      current_assets: [],
      regions: ["全国"],
      notes: "",
    },
    core_goals: {
      primary_goal: "寻找可行动机会",
      secondary_goals: [],
      success_definition: "找到可联系、可报名、可申请或可复核的机会",
      action_intent: ["寻找客户", "寻找合作", "准备材料"],
      priority_order: ["行动入口"],
    },
    opportunity_scope: {
      primary_opportunity_types: ["机会"],
      secondary_opportunity_types: [],
      excluded_opportunity_types: [],
      must_have_conditions: ["存在行动入口"],
      nice_to_have_conditions: [],
    },
    region_scope: {
      primary_regions: ["全国"],
      secondary_regions: [],
      excluded_regions: [],
      global_allowed: true,
      overseas_allowed: true,
    },
    keyword_strategy: {
      core_keywords_zh: ["机会"],
      core_keywords_en: ["opportunity"],
      expanded_keywords_zh: ["报名", "申请", "采购", "合作"],
      expanded_keywords_en: ["apply", "submit", "procurement", "partner"],
      negative_keywords: [],
    },
    filter_rules: {
      must_include: [],
      must_exclude: [],
      low_priority_signals: ["纯资讯"],
      high_priority_signals: ["官方入口", "申请入口", "采购公告"],
      requires_manual_review: ["资格", "费用", "截止时间"],
    },
    scoring_rules: {
      backend_score_enabled: true,
      visible_level_enabled: true,
      weights: { match_score: 30, business_value: 25, timeliness: 20, credibility: 15, actionability: 10, risk_penalty: -20 },
      visible_level_mapping: { S: "90-100", A: "80-89", B: "65-79", C: "50-64", D: "0-49", hidden: "不展示" },
      level_definitions: { S: "强烈推荐", A: "高价值", B: "可关注", C: "低优先级", D: "不推荐", hidden: "不展示" },
    },
    report_requirements: {
      report_format: "markdown",
      report_title_prefix: "本周",
      report_frequency: "weekly",
      max_items_per_report: 10,
      min_items_per_report: 1,
      must_include_sections: [],
      opportunity_card_required_fields: [],
      link_required: true,
      contact_required_if_available: true,
      deadline_required_if_available: true,
    },
    requirement_confidence: {
      total: 90,
      client_identity: { score: 90, weight: 15, reason: "" },
      business_goal: { score: 90, weight: 20, reason: "" },
      opportunity_type: { score: 90, weight: 20, reason: "" },
      region_scope: { score: 90, weight: 10, reason: "" },
      exclusion_rules: { score: 90, weight: 10, reason: "" },
      action_scenario: { score: 90, weight: 15, reason: "" },
      report_format: { score: 90, weight: 10, reason: "" },
    },
    questions_to_confirm: [],
    confirmation_status: {
      status: "confirmed",
      user_confirmed: true,
      confirmed_at: nowIso(),
      last_user_feedback: "",
      revision_count: 0,
    },
  };
}

async function generateReportForJob(
  ctx: AppContext,
  body: RadarJobRunRequest,
  spec: RadarRequirementSpec,
  search: SearchOrchestratorResult,
): Promise<RadarJobResult["report"]> {
  const today = new Date();
  const periodEnd = body.period_end ?? today.toISOString().split("T")[0];
  const periodStart = body.period_start ?? new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const cards = (search.opportunityCards ?? []) as OpportunityCard[];
  const input: RadarReportInput = {
    spec,
    opportunities: cards,
    radar_type: body.radar_type ?? "custom",
    period_start: periodStart,
    period_end: periodEnd,
    profile: body.profile ?? (spec as { profile_summary?: unknown; profile?: unknown }).profile_summary ?? (spec as { profile?: unknown }).profile,
    sourceHintChecks: search.sourceHintChecks ?? [],
    candidateAccounting: search.candidateAccounting,
    executionLog: search.executionLog,
    rawCandidates: search.rawCandidates,
  };
  if (getLlmMode() === "live") {
    const liveProfile = resolveLiveLlmProfile();
    input.liveLlmEvidenceExplanation = await generateLiveLlmEvidenceExplanation(
      ctx.llmAdapter,
      input,
      toLiveLlmPublicProfile(liveProfile),
    );
  }
  const report = generateRadarReport(input);
  let filename: string | undefined;
  if (report.success && report.markdown) {
    const reportsDir = path.resolve(process.cwd(), "reports/api");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    filename = `report-${body.radar_type ?? "custom"}-${today.toISOString().replace(/[:.]/g, "-")}.md`;
    fs.writeFileSync(path.join(reportsDir, filename), report.markdown, "utf-8");
  }
  return {
    success: report.success,
    markdown: report.markdown,
    error: report.error,
    filename,
  };
}

export function radarJobRoutes(ctx: AppContext): Hono {
  const app = new Hono();
  const jobs = new Map<string, RadarJobRecord>();

  function pruneOldJobs(): void {
    const maxJobs = 100;
    if (jobs.size <= maxJobs) return;
    const sorted = [...jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const job of sorted.slice(0, jobs.size - maxJobs)) {
      jobs.delete(job.id);
    }
  }

  async function runJob(jobId: string, body: RadarJobRunRequest): Promise<void> {
    const job = jobs.get(jobId);
    if (!job) return;
    job.status = "running";
    addProgress(job, "searching", "盯机会正在按雷达画像执行多组行业查询；不用刷新页面，我会持续更新这里。");
    try {
      let spec: RadarRequirementSpec;
      let providerRouting: ProviderRouting | undefined = body.providerRouting;
      if (body.radar_id) {
        const radar = ctx.radarRegistry.getRadarById(body.radar_id);
        if (!radar) {
          throw new Error(`雷达 ${body.radar_id} 不存在`);
        }
        spec = radar.spec;
        providerRouting = providerRouting ?? radar.providerRouting;
      } else {
        spec = (body.spec as RadarRequirementSpec) ?? createDefaultSpec();
      }

      const resolvedMode = resolveSearchDataMode({
        requestedMode: body.search_mode,
        fallbackMode: getDataMode(),
      });
      if (resolvedMode.error) {
        throw new Error(resolvedMode.error.message);
      }

      const orchestrator = new SearchOrchestrator({
        llmAdapter: ctx.llmAdapter,
        maxResultsPerProvider: body.max_results,
        minRelevance: body.min_relevance,
        enableContentFetch: body.enable_content_fetch ?? true,
        mockContent: true,
        dataMode: resolvedMode.dataMode,
      });
      const liveProviderRouting = resolvedMode.dataMode === "live"
        ? providerRouting ?? { primary: ["serper"], fallback: [] }
        : providerRouting;

      addProgress(job, "searching", "盯机会正在优先读取官方来源、采购/合作入口和行业平台。");
      const searchResult = await orchestrator.search(spec, body.query, liveProviderRouting);
      const liveError = resolvedMode.dataMode === "live" ? validateLiveSearchResult(searchResult) : null;
      const search = withSearchRunOutcome(searchResult, resolvedMode.dataMode, liveError);
      const rawCount = search.total_raw ?? search.rawCandidates?.length ?? 0;
      const cardCount = search.opportunityCards?.length ?? 0;
      addProgress(job, "reporting", `盯机会已筛选到 ${rawCount} 条候选和 ${cardCount} 张机会卡，正在生成报告摘要和行动建议。`);
      const report = await generateReportForJob(ctx, body, spec, search);
      if (!report.success) {
        throw new Error(report.error ?? "报告生成失败");
      }
      job.status = "succeeded";
      job.result = { search, report };
      job.finishedAt = nowIso();
      addProgress(job, "completed", "盯机会已生成机会卡和 Markdown 报告。");
    } catch (err) {
      job.status = "failed";
      job.finishedAt = nowIso();
      const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
      job.error = { code: "RADAR_JOB_FAILED", message };
      addProgress(job, "failed", "这次搜索或报告生成失败，雷达已保留，可以调整后重试。");
    }
  }

  app.post("/run", async (c) => {
    const start = Date.now();
    let body: RadarJobRunRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json({
        success: false,
        data: null,
        error: { code: "BAD_REQUEST", message: "请求体不是合法 JSON" },
        duration_ms: Date.now() - start,
      } satisfies ApiResponse, 400);
    }
    pruneOldJobs();
    const job: RadarJobRecord = {
      id: createJobId(),
      status: "queued",
      phase: "queued",
      progressLine: "盯机会已收到任务，正在排队准备搜索。",
      progressEvents: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    addProgress(job, "queued", job.progressLine);
    jobs.set(job.id, job);
    setTimeout(() => {
      void runJob(job.id, body);
    }, 0);
    return c.json({
      success: true,
      data: { jobId: job.id, ...publicJob(job) },
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse<RadarJobRecord & { jobId: string }>, 202);
  });

  app.get("/:jobId", (c) => {
    const start = Date.now();
    const job = jobs.get(c.req.param("jobId"));
    if (!job) {
      return c.json({
        success: false,
        data: null,
        error: { code: "RADAR_JOB_NOT_FOUND", message: "任务不存在或已过期" },
        duration_ms: Date.now() - start,
      } satisfies ApiResponse, 404);
    }
    return c.json({
      success: true,
      data: publicJob(job),
      error: null,
      duration_ms: Date.now() - start,
    } satisfies ApiResponse<RadarJobRecord>);
  });

  return app;
}
