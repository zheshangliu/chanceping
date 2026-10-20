import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, withJsonFileLock } from "../../opportunity-v2/file-lock";

export type IchAgentCallKind = "search" | "fetch" | "chat";
export interface IchAgentBudgetTicket { id: string; kind: IchAgentCallKind; reserved_cny: number; date: string; }
interface BudgetEvent { id: string; kind: IchAgentCallKind; status: "reserved" | "settled"; reserved_cny: number; actual_cny: number | null; successful: boolean | null; at: string; http_status?: number; input_tokens?: number; output_tokens?: number; }
interface BudgetDay { budget_cny: number; spent_cny: number; reserved_cny: number; events: BudgetEvent[]; }
interface BudgetLedger { days: Record<string, BudgetDay>; }

const SEARCH_OR_FETCH_USD_PER_CALL = 0.75 / 1000;
const MODEL_INPUT_USD_PER_MILLION = 0.30; // peak rate; conservative for deepseek-flash
const MODEL_OUTPUT_USD_PER_MILLION = 1.20; // peak rate; conservative for deepseek-flash
const MAX_CHAT_INPUT_TOKENS = 16_000;
const MAX_CHAT_OUTPUT_TOKENS = 600;

export function estimateIchAgentCallCny(kind: IchAgentCallKind, env: NodeJS.ProcessEnv = process.env): number {
  const usdToCny = Number(env.ICH_AGENT_USD_CNY_RATE || 8);
  if (kind === "search" || kind === "fetch") return SEARCH_OR_FETCH_USD_PER_CALL * (Number.isFinite(usdToCny) && usdToCny >= 5 ? usdToCny : 8);
  return ((MAX_CHAT_INPUT_TOKENS * MODEL_INPUT_USD_PER_MILLION + MAX_CHAT_OUTPUT_TOKENS * MODEL_OUTPUT_USD_PER_MILLION) / 1_000_000) * (Number.isFinite(usdToCny) && usdToCny >= 5 ? usdToCny : 8);
}

export function resolveIchAgentStateDir(configured?: string): string {
  if (configured) return path.resolve(configured);
  if (process.env.CHANCEPING_ICH_AGENT_STATE_DIR) return path.resolve(process.env.CHANCEPING_ICH_AGENT_STATE_DIR);
  const production = "/var/lib/chanceping/ich-agent";
  return path.resolve(fs.existsSync("/var/lib/chanceping") ? production : "data/ich-agent");
}

function readLedger(file: string): BudgetLedger {
  try { const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as BudgetLedger; return parsed && parsed.days ? parsed : { days: {} }; }
  catch { return { days: {} }; }
}

export class IchAgentBudget {
  private readonly file: string;
  private readonly dailyBudgetCny: number;
  private readonly now: () => Date;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: { stateDir?: string; dailyBudgetCny?: number; now?: () => Date; env?: NodeJS.ProcessEnv }) {
    this.file = path.join(resolveIchAgentStateDir(options.stateDir), "budget-ledger.json");
    this.dailyBudgetCny = options.dailyBudgetCny ?? Number((options.env ?? process.env).CHANCEPING_ICH_AGENT_DAILY_BUDGET_CNY || 0);
    this.now = options.now ?? (() => new Date());
    this.env = options.env ?? process.env;
  }

  configured(): boolean { return Number.isFinite(this.dailyBudgetCny) && this.dailyBudgetCny > 0; }

  reserve(kind: IchAgentCallKind): IchAgentBudgetTicket | null {
    if (!this.configured()) return null;
    const reserved = estimateIchAgentCallCny(kind, this.env);
    const day = this.now().toISOString().slice(0, 10);
    const id = crypto.randomUUID();
    return withJsonFileLock(this.file, () => {
      const ledger = readLedger(this.file);
      const current = ledger.days[day] ?? { budget_cny: this.dailyBudgetCny, spent_cny: 0, reserved_cny: 0, events: [] };
      current.budget_cny = Math.min(current.budget_cny || this.dailyBudgetCny, this.dailyBudgetCny);
      if (current.spent_cny + current.reserved_cny + reserved > current.budget_cny + 1e-9) return null;
      current.reserved_cny += reserved;
      current.events.push({ id, kind, status: "reserved", reserved_cny: reserved, actual_cny: null, successful: null, at: this.now().toISOString() });
      ledger.days[day] = current;
      atomicWriteJson(this.file, ledger);
      return { id, kind, reserved_cny: reserved, date: day };
    });
  }

  settle(ticket: IchAgentBudgetTicket, result: { actualCny?: number; successful: boolean; httpStatus?: number; inputTokens?: number; outputTokens?: number }): void {
    const day = ticket.date;
    withJsonFileLock(this.file, () => {
      const ledger = readLedger(this.file);
      const current = ledger.days[day];
      const event = current?.events.find((row) => row.id === ticket.id);
      if (!current || !event || event.status !== "reserved") return;
      const actual = Math.max(0, result.actualCny ?? (result.successful ? ticket.reserved_cny : 0));
      current.reserved_cny = Math.max(0, current.reserved_cny - event.reserved_cny);
      current.spent_cny += actual;
      event.status = "settled";
      event.actual_cny = actual;
      event.successful = result.successful;
      if (result.httpStatus !== undefined) event.http_status = result.httpStatus;
      if (result.inputTokens !== undefined) event.input_tokens = result.inputTokens;
      if (result.outputTokens !== undefined) event.output_tokens = result.outputTokens;
      ledger.days[day] = current;
      atomicWriteJson(this.file, ledger);
    });
  }

  summary(): { configured: boolean; daily_budget_cny: number; spent_cny: number; reserved_cny: number; calls: Record<IchAgentCallKind, number> } {
    const day = this.now().toISOString().slice(0, 10);
    const current = readLedger(this.file).days[day];
    const calls: Record<IchAgentCallKind, number> = { search: 0, fetch: 0, chat: 0 };
    for (const event of current?.events ?? []) calls[event.kind]++;
    return { configured: this.configured(), daily_budget_cny: this.dailyBudgetCny, spent_cny: current?.spent_cny ?? 0, reserved_cny: current?.reserved_cny ?? 0, calls };
  }
}

export function createIchAgentBudget(options: ConstructorParameters<typeof IchAgentBudget>[0] = {}): IchAgentBudget { return new IchAgentBudget(options); }
