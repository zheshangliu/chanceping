import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, withJsonFileLock } from "./file-lock";

export type FollowupStatus = "new" | "reviewing" | "preparing" | "submitted" | "ignored" | "won" | "lost";
export interface FollowupRecord { opportunity_id: string; owner_id: string; status: FollowupStatus; note: string; next_followup_at: string | null; updated_at: string; revision: number; }
export interface FollowupInput { opportunity_id: string; status: FollowupStatus; note?: string; next_followup_at?: string | null; }

function cleanPath(value?: string): string { return path.resolve(value ?? process.env.CHANCEPING_PROCUREMENT_FOLLOWUP_PATH ?? (fs.existsSync("/var/lib/chanceping/opportunity-v2") ? "/var/lib/chanceping/opportunity-v2/procurement-followups.json" : "data/opportunity-v2/procurement-followups.json")); }
function readRecords(target: string): FollowupRecord[] { try { const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as { records?: FollowupRecord[] }; return Array.isArray(parsed.records) ? parsed.records : []; } catch { return []; } }

export function createProcurementFollowupStore(filePath?: string) {
  const target = cleanPath(filePath);
  return {
    async get(ownerId: string, opportunityId: string): Promise<FollowupRecord | null> {
      if (!ownerId || !opportunityId) return null;
      return readRecords(target).find((record) => record.owner_id === ownerId && record.opportunity_id === opportunityId) ?? null;
    },
    async list(ownerId: string): Promise<FollowupRecord[]> { return readRecords(target).filter((record) => record.owner_id === ownerId); },
    async upsert(input: FollowupInput & { owner_id: string }): Promise<FollowupRecord> {
      if (!input.owner_id || !input.opportunity_id) throw new Error("owner_id and opportunity_id are required");
      if (!["new", "reviewing", "preparing", "submitted", "ignored", "won", "lost"].includes(input.status)) throw new Error("invalid followup status");
      if ((input.note ?? "").length > 4000) throw new Error("note is too long");
      if (input.next_followup_at && !/^20\d{2}-\d{2}-\d{2}(?:T[^\s]+)?$/u.test(input.next_followup_at)) throw new Error("next_followup_at must be ISO date/time");
      return withJsonFileLock(target, () => {
        const records = readRecords(target);
        const index = records.findIndex((record) => record.owner_id === input.owner_id && record.opportunity_id === input.opportunity_id);
        const previous = index >= 0 ? records[index] : null;
        const record: FollowupRecord = { opportunity_id: input.opportunity_id, owner_id: input.owner_id, status: input.status, note: input.note?.trim() ?? "", next_followup_at: input.next_followup_at ?? null, updated_at: new Date().toISOString(), revision: (previous?.revision ?? 0) + 1 };
        if (index >= 0) records[index] = record; else records.push(record);
        atomicWriteJson(target, { schema_version: "chanceping-procurement-followups.v1", updated_at: new Date().toISOString(), records });
        return record;
      });
    },
  };
}
