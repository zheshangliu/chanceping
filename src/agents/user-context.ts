/**
 * 用户上下文（V1.5b 假用户，不引入真实登录）
 *
 * 来源：Task V1.5-07 第 3.1 节。
 *
 * V1.5b 阶段不引入真实登录；本地/部署演示允许通过请求头注入匿名访客 ID。
 * 预留 4 个付费等级常量，V1.5b 只用 free。
 */

import type { Context } from "hono";

/** 付费等级 */
export type UserPlan = "free" | "basic" | "pro" | "enterprise";

/** 用户上下文 */
export interface UserContext {
  /** 用户 ID */
  userId: string;
  /** 付费等级 */
  plan: UserPlan;
}

export const CHANCEPING_USER_ID_HEADER = "X-ChancePing-User-Id";
const FALLBACK_USER_ID = "demo_user";

function sanitizeRequestUserId(value: string | undefined | null): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return undefined;
  if (trimmed.length > 96) return undefined;
  if (!/^[A-Za-z0-9_.:-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

/** 各等级的雷达配额（自定义雷达上限，内置雷达不计入） */
export const RADAR_QUOTA: Record<UserPlan, number> = {
  free: 3, // 免费用户 3 个自定义雷达
  basic: 3, // 基础版 3 个
  pro: 10, // 专业版 10 个
  enterprise: 50, // 企业版 50 个
};

/**
 * 获取当前用户上下文。
 *
 * 当前仍不引入登录系统；浏览器端用稳定匿名访客 ID 隔离自定义雷达。
 * 未传请求上下文时保留 demo_user 兼容旧测试。
 *
 * @returns 用户上下文
 */
export function getCurrentUser(c?: Context): UserContext {
  const requestUserId = sanitizeRequestUserId(
    c?.req.header(CHANCEPING_USER_ID_HEADER)
      ?? c?.req.header(CHANCEPING_USER_ID_HEADER.toLowerCase())
      ?? c?.req.query("user_id")
      ?? c?.req.query("userId"),
  );
  return {
    userId: requestUserId ?? FALLBACK_USER_ID,
    plan: "free",
  };
}
