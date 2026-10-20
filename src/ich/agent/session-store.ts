import crypto from "node:crypto";
import type { IchAgentConstraints, IchAgentResult, IchAgentTurnResponse } from "./contracts";

export interface IchAgentTurnRecord {
  turn_id: string;
  created_at: string;
  result_refs: string[];
  results_by_ref: Map<string, IchAgentResult>;
  evidences_by_id: Map<string, import("./contracts").IchAgentEvidence>;
  response_by_request_id: Map<string, IchAgentTurnResponse>;
}

export interface IchAgentSession {
  token: string;
  created_at: number;
  last_seen_at: number;
  submissions: number[];
  total_submissions: number;
  constraints: IchAgentConstraints;
  turns: IchAgentTurnRecord[];
  idempotency_responses: Map<string, IchAgentTurnResponse>;
  active_request_id: string | null;
}

export interface IchAgentSessionStoreOptions {
  now?: () => Date;
  idleTtlMs?: number;
  absoluteTtlMs?: number;
  maxSessions?: number;
  maxTurns?: number;
  maxSubmissions?: number;
  perMinuteSubmissions?: number;
}

export class IchAgentSessionStore {
  private readonly sessions = new Map<string, IchAgentSession>();
  private readonly now: () => Date;
  readonly idleTtlMs: number;
  readonly absoluteTtlMs: number;
  readonly maxSessions: number;
  readonly maxTurns: number;
  readonly maxSubmissions: number;
  readonly perMinuteSubmissions: number;

  constructor(options: IchAgentSessionStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.idleTtlMs = options.idleTtlMs ?? 30 * 60_000;
    this.absoluteTtlMs = options.absoluteTtlMs ?? 2 * 60 * 60_000;
    this.maxSessions = options.maxSessions ?? 10_000;
    this.maxTurns = options.maxTurns ?? 8;
    this.maxSubmissions = options.maxSubmissions ?? 20;
    this.perMinuteSubmissions = options.perMinuteSubmissions ?? 4;
  }

  create(): IchAgentSession {
    this.prune();
    if (this.sessions.size >= this.maxSessions) {
      const oldest = [...this.sessions.values()].sort((a, b) => a.last_seen_at - b.last_seen_at)[0];
      if (oldest) this.sessions.delete(oldest.token);
    }
    const now = this.now().getTime();
    const token = crypto.randomBytes(32).toString("base64url");
    const session: IchAgentSession = { token, created_at: now, last_seen_at: now, submissions: [], total_submissions: 0, constraints: { craft_terms: [], opportunity_types: [], location_terms: [], region: "all", within_days: null, budget_preference: "any", online_only: false, explicit_exclusions: [] }, turns: [], idempotency_responses: new Map(), active_request_id: null };
    this.sessions.set(token, session);
    return session;
  }

  get(token: string | undefined): IchAgentSession | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    const now = this.now().getTime();
    if (now - session.last_seen_at > this.idleTtlMs || now - session.created_at > this.absoluteTtlMs) {
      this.sessions.delete(token);
      return null;
    }
    session.last_seen_at = now;
    return session;
  }

  startSubmission(session: IchAgentSession, requestId: string): "ok" | "in_flight" | "rate_limited" | "expired" {
    if (!this.get(session.token)) return "expired";
    if (session.active_request_id) return session.active_request_id === requestId ? "in_flight" : "in_flight";
    const now = this.now().getTime();
    session.submissions = session.submissions.filter((timestamp) => now - timestamp < 60_000);
    if (session.submissions.length >= this.perMinuteSubmissions || session.total_submissions >= this.maxSubmissions) return "rate_limited";
    session.submissions.push(now);
    session.total_submissions++;
    session.active_request_id = requestId;
    return "ok";
  }

  finishSubmission(session: IchAgentSession, turn?: IchAgentTurnRecord): void {
    session.active_request_id = null;
    if (turn) {
      session.turns.push(turn);
      session.turns = session.turns.slice(-this.maxTurns);
      for (const [requestId, response] of turn.response_by_request_id) session.idempotency_responses.set(requestId, response);
      while (session.idempotency_responses.size > this.maxSubmissions) {
        const oldest = session.idempotency_responses.keys().next().value;
        if (oldest === undefined) break;
        session.idempotency_responses.delete(oldest);
      }
    }
    session.last_seen_at = this.now().getTime();
  }

  clear(token: string): boolean { return this.sessions.delete(token); }
  size(): number { this.prune(); return this.sessions.size; }

  private prune(): void {
    const now = this.now().getTime();
    for (const [token, session] of this.sessions) {
      if (now - session.last_seen_at > this.idleTtlMs || now - session.created_at > this.absoluteTtlMs) this.sessions.delete(token);
    }
  }
}

export function createIchAgentSessionStore(options: IchAgentSessionStoreOptions = {}): IchAgentSessionStore { return new IchAgentSessionStore(options); }

export function findIchAgentTurn(session: IchAgentSession, turnId: string | undefined): IchAgentTurnRecord | undefined {
  if (!turnId) return undefined;
  return session.turns.find((turn) => turn.turn_id === turnId);
}
