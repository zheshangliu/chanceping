/**
 * Jina Reader 抓取（jina reader fetcher）
 *
 * 来源：Task 019c 第 4.4 节。
 *
 * 搜索层第三层（接入工具层）：使用 Jina Reader 将网页转为 AI 可读纯文本。
 *   - URL 前缀加 https://r.jina.ai/
 *   - 返回 Markdown 格式的纯文本
 *   - Mock 模式返回预设内容
 *
 * 不引入新 npm 依赖，HTTP 用 Node.js 内置 fetch。
 */

import type { CleanedContent } from "../types";
import { cleanContent } from "./content-cleaner";

/** Jina Reader 配置 */
export interface JinaReaderConfig {
  /** Jina API Key（可选，免费额度不需要） */
  apiKey?: string;
  /** Mock 模式开关，无网络时自动 true */
  mockMode?: boolean;
  /** 真实抓取超时，毫秒。 */
  timeoutMs?: number;
}

/** Jina Reader 端点前缀 */
const JINA_PREFIX = "https://r.jina.ai/";

/** 默认最大字符数 */
const DEFAULT_MAX_CHARS = 8000;

// ============================================================
// Mock 数据
// ============================================================

/** 通用 Mock 内容（example.com 等非政府域名） */
const MOCK_GENERIC_TEXT = `# 全国 AI 创新大赛 2026 官方介绍

全国 AI 创新大赛 2026 是由国家科技部指导、中国人工智能学会主办的全国性 AI 赛事。大赛旨在推动人工智能技术创新和应用落地，面向全国高校学生、科研人员和创业者开放。

## 赛道设置

大赛设有三个主要赛道：自然语言处理赛道、计算机视觉赛道、AI 应用创新赛道。每个赛道设金、银、铜奖，奖金池总额 100 万元。

## 参赛要求

参赛队伍需 1-5 人，需提交项目方案、技术报告和演示视频。报名截止日期为 2026 年 9 月 30 日。

## 评审标准

评审从技术创新性、应用价值、可落地性三个维度打分。初审通过后进入决赛答辩环节。

发布日期：2026-06-15
作者：大赛组委会`;

function buildMockTableTennisText(url: string): string {
  const isIttf = /ittf/i.test(url);
  const isCtta = /ctta/i.test(url);
  const title = isIttf
    ? "ITTF 国际乒乓球赛事日历与参赛通知"
    : isCtta
      ? "中国乒协官网乒乓球比赛报名通知"
      : "WTT 乒乓球比赛公开赛报名窗口";
  const organizer = isIttf
    ? "国际乒乓球联合会"
    : isCtta
      ? "中国乒乓球协会"
      : "世界乒乓球职业大联盟";
  const deadline = isIttf ? "2026-08-05" : isCtta ? "2026-07-20" : "2026-07-28";
  const link = isIttf
    ? "https://www.ittf.com/"
    : isCtta
      ? "https://www.ctta.cn/"
      : "https://worldtabletennis.com/";
  return `# ${title}

本页面汇总 ${organizer} 相关乒乓球比赛报名信息，面向具备参赛资格的乒乓球选手开放。

## 报名信息

主办单位：${organizer}。

参赛条件：符合赛事年龄、积分、协会注册或公开报名要求的个人选手。

地区：国内外。

报名截止日期：${deadline}。

奖励：积分、排名机会及赛事奖金以官方规程为准。

报名链接：${link}

联系方式：请以官方赛事页面公布的信息为准。

发布日期：2026-07-01`;
}

function buildMockDemoText(url: string): string {
  let topic = "机会信号";
  try {
    const parsed = new URL(url);
    topic = parsed.searchParams.get("topic") || parsed.pathname.split("/").filter(Boolean)[0] || topic;
  } catch {
    // keep default topic
  }
  return `# ${topic}演示机会信息

【演示数据，未真实核验】本内容用于验证 ChancePing 的需求理解、搜索、筛选、入库和报告链路，并非真实联网搜索结果。

## 基本信息

主办单位：演示数据。

地区：按用户雷达画像推断。

报名截止日期：2026-07-22。

奖励：需真实搜索后确认。

参赛条件：需真实来源核验后确认。

报名链接：无，演示数据不提供真实报名入口。

联系方式：未真实核验。

发布日期：2026-07-01`;
}

/** 政策类 Mock 内容（gov.cn 等政府域名） */
const MOCK_GOV_TEXT = `# 2026 年人工智能产业专项扶持政策

为加快推进人工智能产业发展，特制定本扶持政策。本政策面向在本地注册的科技型企业，重点支持大模型研发和 AI 应用落地。

## 扶持方向

一、大模型研发补贴：对自主研发大模型的企业，按研发投入的 30% 给予补贴，最高 500 万元。

二、AI 应用示范项目：对入选示范项目的 AI 应用，给予 50-200 万元一次性奖励。

三、人才引进支持：对引进 AI 领域高层次人才的企业，给予住房补贴和安家费。

## 申报条件

申报企业需满足：注册满 1 年、有自主知识产权、上年度营收不低于 100 万元。

发布日期：2026-06-12
作者：科技局`;

/**
 * Jina Reader 抓取器。
 *
 * 使用 Jina Reader API 将网页转为 AI 可读纯文本。
 */
export class JinaReaderFetcher {
  private readonly apiKey: string;
  private readonly mockMode: boolean;
  private readonly timeoutMs: number;

  constructor(config?: Partial<JinaReaderConfig>) {
    this.apiKey = config?.apiKey ?? "";
    // 显式 mockMode 优先，否则默认 Mock（验证脚本不测试真实网络）
    this.mockMode = config?.mockMode ?? true;
    this.timeoutMs = config?.timeoutMs ?? 15000;
  }

  /**
   * 使用 Jina Reader 读取网页内容。
   *
   * @param url 目标网页 URL
   * @returns 清洗后的 CleanedContent
   */
  async fetch(url: string): Promise<CleanedContent> {
    if (this.mockMode) {
      return this.fetchMock(url);
    }
    return this.fetchReal(url);
  }

  // ============================================================
  // Mock 模式
  // ============================================================

  /** Mock 抓取：根据 url 域名返回不同预设内容 */
  private fetchMock(url: string): CleanedContent {
    let rawText: string;
    if (/mock\.chanceping\.local/i.test(url)) {
      rawText = buildMockDemoText(url);
    } else if (/worldtabletennis|ittf|ctta|tabletennis/i.test(url)) {
      rawText = buildMockTableTennisText(url);
    } else if (/gov\.cn|\.gov\./.test(url)) {
      rawText = MOCK_GOV_TEXT;
    } else {
      rawText = MOCK_GENERIC_TEXT;
    }

    // 复用 content-cleaner 进行清洗（保持一致性）
    const cleaned = cleanContent(rawText, url, { maxChars: DEFAULT_MAX_CHARS });
    return {
      ...cleaned,
      fetch_success: true,
    };
  }

  // ============================================================
  // 真实模式
  // ============================================================

  /** 真实抓取：调用 Jina Reader API */
  private async fetchReal(url: string): Promise<CleanedContent> {
    const jinaUrl = `${JINA_PREFIX}${url}`;

    const headers: Record<string, string> = {
      "X-Return-Format": "markdown",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(jinaUrl, { method: "GET", headers, signal: controller.signal });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          url,
          title: "",
          main_text: "",
          word_count: 0,
          fetch_success: false,
          fetch_error: `Jina Reader API error: status=${response.status}, body=${errorText.slice(0, 200)}`,
        };
      }

      const rawText = await response.text();

      // 复用 content-cleaner 清洗
      const cleaned = cleanContent(rawText, url, { maxChars: DEFAULT_MAX_CHARS });
      return cleaned;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        url,
        title: "",
        main_text: "",
        word_count: 0,
        fetch_success: false,
        fetch_error: err instanceof Error && err.name === "AbortError"
          ? `Jina Reader fetch timeout after ${this.timeoutMs}ms`
          : `Jina Reader fetch failed: ${errorMsg}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
