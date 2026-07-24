import crypto from "crypto";
import fs from "fs";
import path from "path";
import { IchPublicationError, IchPublicationService, type IchMutationContext } from "./publication-service";
import { IchOpportunityStore } from "./store";
import { IchSubmissionStore } from "./submission-store";
import type {
  IchSourceSubmission,
  IchSourceSubmissionStatus,
  IchSubmissionAcceptTransaction,
} from "./submission-types";
import {
  hashIchSubmissionUrl,
  normalizeIchSubmissionUrl,
  validateIchSubmissionInput,
} from "./submission-validation";
import type { IchOpportunity } from "./types";

export class IchSubmissionError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION_FAILED" | "RATE_LIMITED",
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
  }
}

export interface IchSubmitContext {
  fingerprint: string;
  now?: Date;
}

function cleanReviewer(value: string): string {
  const reviewer = value.trim();
  if (!/^[A-Za-z0-9_.@-]{1,80}$/.test(reviewer)) throw new IchSubmissionError("VALIDATION_FAILED", "审核员标识无效");
  return reviewer;
}

function cleanReason(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new IchSubmissionError("VALIDATION_FAILED", "审核理由不能为空");
  const reason = value.trim();
  if (reason.length > 500) throw new IchSubmissionError("VALIDATION_FAILED", "审核理由最多允许 500 个字符");
  return reason;
}

export class IchSubmissionService {
  constructor(private readonly store: IchSubmissionStore) {}

  list(): IchSourceSubmission[] {
    return this.store.list().map((item) => structuredClone(item));
  }

  get(id: string): IchSourceSubmission {
    const item = this.store.get(id);
    if (!item) throw new IchSubmissionError("NOT_FOUND", "来源提交不存在");
    return structuredClone(item);
  }

  submit(input: unknown, context: IchSubmitContext): { created: boolean } {
    const result = validateIchSubmissionInput(input);
    if (!result.valid || !result.value) {
      throw new IchSubmissionError("VALIDATION_FAILED", "来源提交校验失败", result.errors);
    }
    if (!/^[a-f0-9]{64}$/.test(context.fingerprint)) {
      throw new IchSubmissionError("VALIDATION_FAILED", "请求指纹无效");
    }
    const now = context.now ?? new Date();
    const nowIso = now.toISOString();
    const entries = this.store.list();
    const recent10Minutes = now.getTime() - 10 * 60 * 1000;
    const recentDay = now.getTime() - 24 * 60 * 60 * 1000;
    const fromFingerprint = entries.filter((item) => item.request_fingerprint === context.fingerprint);
    if (fromFingerprint.filter((item) => Date.parse(item.created_at) >= recent10Minutes).length >= 3 ||
        fromFingerprint.filter((item) => Date.parse(item.created_at) >= recentDay).length >= 10 ||
        entries.filter((item) => Date.parse(item.created_at) >= recent10Minutes).length >= 100) {
      throw new IchSubmissionError("RATE_LIMITED", "提交过于频繁，请稍后重试");
    }
    const normalizedHash = hashIchSubmissionUrl(result.value.source_url);
    if (entries.some((item) => item.normalized_url_hash === normalizedHash &&
      ["pending", "accepted"].includes(item.status))) {
      return { created: false };
    }
    const item: IchSourceSubmission = {
      id: `ichsub_${crypto.randomUUID().replace(/-/g, "")}`,
      source_url: result.value.source_url,
      title_hint: result.value.title_hint ?? null,
      note: result.value.note ?? null,
      contact_email: result.value.contact_email ?? null,
      status: "pending",
      normalized_url_hash: normalizedHash,
      created_at: nowIso,
      updated_at: nowIso,
      reviewed_at: null,
      reviewer: null,
      review_reason: null,
      opportunity_id: null,
      request_fingerprint: context.fingerprint,
    };
    this.store.replaceAll([...entries, item], nowIso);
    return { created: true };
  }

  review(id: string, status: Exclude<IchSourceSubmissionStatus, "pending" | "accepted">, reviewer: string, reason: unknown, now = new Date()): IchSourceSubmission {
    const current = this.get(id);
    if (current.status !== "pending") throw new IchSubmissionError("CONFLICT", "该来源提交已处理");
    const next = {
      ...current,
      status,
      reviewer: cleanReviewer(reviewer),
      review_reason: cleanReason(reason),
      reviewed_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    this.replace(current, next);
    return structuredClone(next);
  }

  markAccepted(id: string, opportunityId: string, reviewer: string, now: Date): IchSourceSubmission {
    const current = this.get(id);
    if (current.status !== "pending") throw new IchSubmissionError("CONFLICT", "该来源提交已处理");
    const next: IchSourceSubmission = {
      ...current,
      status: "accepted",
      reviewer: cleanReviewer(reviewer),
      review_reason: "accepted_as_draft",
      reviewed_at: now.toISOString(),
      updated_at: now.toISOString(),
      opportunity_id: opportunityId,
    };
    this.replace(current, next);
    return structuredClone(next);
  }

  private replace(current: IchSourceSubmission, next: IchSourceSubmission): void {
    const entries = this.store.list();
    const index = entries.findIndex((item) => item.id === current.id);
    if (index < 0) throw new IchSubmissionError("CONFLICT", "来源提交在写入前已不存在");
    entries[index] = next;
    this.store.replaceAll(entries, next.updated_at);
  }
}

export class IchSubmissionAcceptanceService {
  private readonly submissions: IchSubmissionService;
  private readonly publication: IchPublicationService;

  constructor(
    private readonly submissionStore: IchSubmissionStore,
    private readonly opportunityStore: IchOpportunityStore,
    private readonly transactionPath: string,
  ) {
    this.submissions = new IchSubmissionService(submissionStore);
    this.publication = new IchPublicationService(opportunityStore);
    this.recover();
  }

  accept(id: string, opportunity: IchOpportunity, context: IchMutationContext): {
    submission: IchSourceSubmission;
    opportunity: IchOpportunity;
  } {
    const current = this.submissions.get(id);
    if (current.status !== "pending") throw new IchSubmissionError("CONFLICT", "该来源提交已处理");
    const candidateSources = Array.isArray(opportunity.sources) ? opportunity.sources : [];
    const containsSubmittedSource = candidateSources.some((source) => {
      try {
        return normalizeIchSubmissionUrl(source.url) === current.source_url;
      } catch {
        return false;
      }
    });
    if (!containsSubmittedSource) {
      throw new IchSubmissionError("VALIDATION_FAILED", "候选机会必须保留已提交的来源 URL");
    }
    const now = context.now ?? new Date();
    const beforeOpportunities = this.opportunityStore.list();
    const beforeSubmissions = this.submissionStore.list();
    const transaction: IchSubmissionAcceptTransaction = {
      schema_version: "1.0",
      submission_id: id,
      opportunity_slug: String(opportunity.slug ?? ""),
      started_at: now.toISOString(),
    };
    this.writeTransaction(transaction);
    let created: IchOpportunity | null = null;
    try {
      created = this.publication.create(opportunity, context);
      const submission = this.submissions.markAccepted(id, created.id, context.actor, now);
      this.removeTransaction();
      return { submission, opportunity: created };
    } catch (error) {
      try {
        if (created) this.opportunityStore.replaceAll(beforeOpportunities, now.toISOString());
        this.submissionStore.replaceAll(beforeSubmissions, now.toISOString());
        this.removeTransaction();
      } catch {
        // The journal remains for deterministic recovery on the next initialization.
      }
      if (error instanceof IchPublicationError || error instanceof IchSubmissionError) throw error;
      throw new IchSubmissionError("CONFLICT", "来源提交转换失败");
    }
  }

  private recover(): void {
    if (!fs.existsSync(this.transactionPath)) return;
    try {
      const transaction = JSON.parse(fs.readFileSync(this.transactionPath, "utf8")) as IchSubmissionAcceptTransaction;
      if (transaction.schema_version !== "1.0" ||
          typeof transaction.submission_id !== "string" ||
          typeof transaction.opportunity_slug !== "string") {
        throw new Error("invalid transaction");
      }
      const submission = this.submissionStore.get(transaction.submission_id);
      const opportunity = this.opportunityStore.getBySlug(transaction.opportunity_slug);
      if (submission?.status === "pending" && opportunity) {
        this.submissions.markAccepted(submission.id, opportunity.id, "transaction-recovery", new Date());
      }
      this.removeTransaction();
    } catch {
      const invalidPath = `${this.transactionPath}.invalid`;
      fs.renameSync(this.transactionPath, invalidPath);
      console.error("[ICH Submission] quarantined invalid acceptance transaction");
    }
  }

  private writeTransaction(transaction: IchSubmissionAcceptTransaction): void {
    fs.mkdirSync(path.dirname(this.transactionPath), { recursive: true });
    const temporary = `${this.transactionPath}.${process.pid}.tmp`;
    const descriptor = fs.openSync(temporary, "w");
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(transaction, null, 2)}\n`, "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    try {
      fs.renameSync(temporary, this.transactionPath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  private removeTransaction(): void {
    if (fs.existsSync(this.transactionPath)) fs.unlinkSync(this.transactionPath);
  }
}
