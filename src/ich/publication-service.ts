import crypto from "crypto";
import type {
  IchOpportunity,
  IchWorkflowEvent,
  IchWorkflowState,
} from "./types";
import { IchOpportunityStore } from "./store";
import { validateIchOpportunity } from "./validation";

export class IchPublicationError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "INVALID_STATE" | "VALIDATION_FAILED" | "CONFLICT",
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
  }
}

export interface IchMutationContext {
  actor: string;
  now?: Date;
  expectedRevision?: number;
  reason?: string | null;
}

const TRANSITIONS: Record<IchWorkflowState, IchWorkflowState[]> = {
  draft: ["pending_review", "archived"],
  pending_review: ["approved", "rejected", "archived"],
  approved: ["published", "archived"],
  published: ["withdrawn", "archived"],
  rejected: ["draft", "archived"],
  withdrawn: ["pending_review", "archived"],
  archived: ["draft"],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cleanActor(actor: string): string {
  const value = actor.trim();
  if (!/^[A-Za-z0-9_.@-]{1,80}$/.test(value)) throw new IchPublicationError("VALIDATION_FAILED", "操作者标识无效");
  return value;
}

function cleanReason(reason: string | null | undefined): string | null {
  if (reason === undefined || reason === null || reason.trim() === "") return null;
  const value = reason.trim();
  if (value.length > 500) throw new IchPublicationError("VALIDATION_FAILED", "原因最多允许 500 个字符");
  return value;
}

function event(
  action: IchWorkflowEvent["action"],
  from: IchWorkflowState | null,
  to: IchWorkflowState,
  actor: string,
  at: string,
  revision: number,
  reason: string | null,
): IchWorkflowEvent {
  return { action, from, to, actor, at, reason, revision };
}

export class IchPublicationService {
  constructor(private readonly store: IchOpportunityStore) {}

  list(): IchOpportunity[] {
    return this.store.list().map(clone);
  }

  get(id: string): IchOpportunity {
    const entry = this.store.getById(id);
    if (!entry) throw new IchPublicationError("NOT_FOUND", "非遗机会不存在");
    return clone(entry);
  }

  create(input: IchOpportunity, context: IchMutationContext): IchOpportunity {
    const now = (context.now ?? new Date()).toISOString();
    const actor = cleanActor(context.actor);
    const entries = this.store.list();
    const slug = String(input.slug ?? "").trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) {
      throw new IchPublicationError("VALIDATION_FAILED", "slug 必须是长度不超过 120 的小写英文、数字和连字符");
    }
    if (entries.some((entry) => entry.slug === slug)) throw new IchPublicationError("CONFLICT", "slug 已存在");
    const id = `ich_${crypto.randomUUID().replace(/-/g, "")}`;
    const created: IchOpportunity = clone({
      ...input,
      id,
      slug,
      classification_status: "pending_review",
      is_published: false,
      archive_reason: null,
      metadata: {
        ...input.metadata,
        created_at: now,
        updated_at: now,
        created_by: actor,
        updated_by: actor,
        first_discovered_at: input.metadata?.first_discovered_at || now,
        last_checked_at: input.metadata?.last_checked_at || now,
        published_at: null,
        archived_at: null,
        data_version: "1.0",
        source_import_batch: null,
      },
      workflow: {
        state: "draft",
        revision: 1,
        review_reason: null,
        submitted_at: null,
        reviewed_at: null,
        reviewed_by: null,
        withdrawn_at: null,
        history: [event("created", null, "draft", actor, now, 1, null)],
      },
    });
    const result = validateIchOpportunity(created);
    if (!result.valid) throw new IchPublicationError("VALIDATION_FAILED", "候选机会校验失败", result.errors);
    this.store.replaceAll([...entries, created], now);
    return clone(created);
  }

  update(id: string, patch: Partial<IchOpportunity>, context: IchMutationContext): IchOpportunity {
    const current = this.get(id);
    this.assertRevision(current, context.expectedRevision);
    if (!["draft", "rejected"].includes(current.workflow.state)) {
      throw new IchPublicationError("INVALID_STATE", "仅草稿或已驳回机会可以编辑");
    }
    const actor = cleanActor(context.actor);
    const now = (context.now ?? new Date()).toISOString();
    const protectedFields = new Set(["id", "workflow", "metadata", "is_published", "classification_status"]);
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => !protectedFields.has(key)));
    const next = clone({ ...current, ...safePatch }) as IchOpportunity;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next.slug) || next.slug.length > 120) {
      throw new IchPublicationError("VALIDATION_FAILED", "slug 必须是长度不超过 120 的小写英文、数字和连字符");
    }
    if (next.slug !== current.slug && this.store.list().some((entry) => entry.id !== id && entry.slug === next.slug)) {
      throw new IchPublicationError("CONFLICT", "slug 已存在");
    }
    const revision = current.workflow.revision + 1;
    next.classification_status = "pending_review";
    next.metadata.updated_at = now;
    next.metadata.updated_by = actor;
    next.workflow = {
      ...current.workflow,
      state: "draft",
      revision,
      review_reason: null,
      history: [...current.workflow.history, event("updated", current.workflow.state, "draft", actor, now, revision, null)],
    };
    this.validateAndReplace(current, next, now);
    return clone(next);
  }

  transition(
    id: string,
    to: IchWorkflowState,
    action: IchWorkflowEvent["action"],
    context: IchMutationContext,
  ): IchOpportunity {
    const current = this.get(id);
    this.assertRevision(current, context.expectedRevision);
    if (!TRANSITIONS[current.workflow.state].includes(to)) {
      throw new IchPublicationError("INVALID_STATE", `不允许从 ${current.workflow.state} 转换到 ${to}`);
    }
    const actor = cleanActor(context.actor);
    const reason = cleanReason(context.reason);
    if (to === "rejected" && !reason) throw new IchPublicationError("VALIDATION_FAILED", "驳回时必须填写原因");
    const now = (context.now ?? new Date()).toISOString();
    const revision = current.workflow.revision + 1;
    const next = clone(current);
    next.workflow = {
      ...current.workflow,
      state: to,
      revision,
      review_reason: to === "rejected" ? reason : null,
      submitted_at: to === "pending_review" ? now : current.workflow.submitted_at,
      reviewed_at: ["approved", "rejected"].includes(to) ? now : current.workflow.reviewed_at,
      reviewed_by: ["approved", "rejected"].includes(to) ? actor : current.workflow.reviewed_by,
      withdrawn_at: to === "withdrawn" ? now : current.workflow.withdrawn_at,
      history: [...current.workflow.history, event(action, current.workflow.state, to, actor, now, revision, reason)],
    };
    next.is_published = to === "published";
    next.classification_status = to === "approved" || to === "published" ? "confirmed" :
      to === "rejected" ? "rejected" : "pending_review";
    next.metadata.updated_at = now;
    next.metadata.updated_by = actor;
    if (to === "published") next.metadata.published_at = now;
    if (to === "archived") {
      next.metadata.archived_at = now;
      next.archive_reason = next.archive_reason ?? "manual_archive";
    }
    if (to === "draft") {
      next.metadata.archived_at = null;
      next.archive_reason = null;
    }
    this.validateAndReplace(current, next, now);
    return clone(next);
  }

  private assertRevision(entry: IchOpportunity, expected: number | undefined): void {
    if (!Number.isInteger(expected) || expected !== entry.workflow.revision) {
      throw new IchPublicationError("CONFLICT", "数据已被其他操作更新，请刷新后重试");
    }
  }

  private validateAndReplace(current: IchOpportunity, next: IchOpportunity, now: string): void {
    const result = validateIchOpportunity(next);
    if (!result.valid) throw new IchPublicationError("VALIDATION_FAILED", "机会校验失败", result.errors);
    const entries = this.store.list();
    const index = entries.findIndex((entry) => entry.id === current.id);
    if (index < 0) throw new IchPublicationError("CONFLICT", "机会在写入前已不存在");
    entries[index] = next;
    this.store.replaceAll(entries, now);
  }
}
