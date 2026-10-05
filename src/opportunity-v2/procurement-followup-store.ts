import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, withJsonFileLock } from "./file-lock";

export type FollowupStatus = "new" | "reviewing" | "preparing" | "submitted" | "ignored" | "won" | "lost";
export interface FollowupRecord { opportunity_id: string; owner_id: string; status: FollowupStatus; note: string; next_followup_at: string | null; updated_at: string; revision: number; }
export interface FollowupInput { opportunity_id: string; status: FollowupStatus; note?: string; next_followup_at?: string | null; }
export interface FollowupReadMarker { owner_id: string; event_id: string; read_at: string; }
interface FollowupFile { schema_version?: string; updated_at?: string; records: FollowupRecord[]; read_event_markers: FollowupReadMarker[]; }

function cleanPath(value?: string): string { return path.resolve(value ?? process.env.CHANCEPING_PROCUREMENT_FOLLOWUP_PATH ?? (fs.existsSync("/var/lib/chanceping/opportunity-v2") ? "/var/lib/chanceping/opportunity-v2/procurement-followups.json" : "data/opportunity-v2/procurement-followups.json")); }
function readFile(target: string): FollowupFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as Partial<FollowupFile>;
    return { schema_version: "chanceping-procurement-followups.v1", updated_at: parsed.updated_at, records: Array.isArray(parsed.records) ? parsed.records : [], read_event_markers: Array.isArray(parsed.read_event_markers) ? parsed.read_event_markers : [] };
  } catch { return { schema_version: "chanceping-procurement-followups.v1", records: [], read_event_markers: [] }; }
}

export function createProcurementFollowupStore(filePath?: string) {
  const target = cleanPath(filePath);
  return {
    async get(ownerId: string, opportunityId: string): Promise<FollowupRecord | null> {
      if (!ownerId || !opportunityId) return null;
      return readFile(target).records.find((record) => record.owner_id === ownerId && record.opportunity_id === opportunityId) ?? null;
    },
    async list(ownerId: string): Promise<FollowupRecord[]> { return readFile(target).records.filter((record) => record.owner_id === ownerId); },
    async readEventIds(ownerId: string): Promise<Set<string>> { return new Set(readFile(target).read_event_markers.filter((marker) => marker.owner_id === ownerId).map((marker) => marker.event_id)); },
    async markEventRead(ownerId: string, eventId: string, readAt = new Date().toISOString()): Promise<FollowupReadMarker> {
      if (!ownerId || !eventId) throw new Error("owner_id and event_id are required");
      return withJsonFileLock(target, () => {
        const file = readFile(target);
        const existing = file.read_event_markers.find((marker) => marker.owner_id === ownerId && marker.event_id === eventId);
        if (existing) return existing;
        const marker = { owner_id: ownerId, event_id: eventId, read_at: readAt };
        atomicWriteJson(target, { schema_version: "chanceping-procurement-followups.v1", updated_at: new Date().toISOString(), records: file.records, read_event_markers: [...file.read_event_markers, marker] });
        return marker;
      });
    },
    async upsert(input: FollowupInput & { owner_id: string }): Promise<FollowupRecord> {
      if (!input.owner_id || !input.opportunity_id) throw new Error("owner_id and opportunity_id are required");
      if (!["new", "reviewing", "preparing", "submitted", "ignored", "won", "lost"].includes(input.status)) throw new Error("invalid followup status");
      if ((input.note ?? "").length > 4000) throw new Error("note is too long");
      if (input.next_followup_at && !/^20\d{2}-\d{2}-\d{2}(?:T[^\s]+)?$/u.test(input.next_followup_at)) throw new Error("next_followup_at must be ISO date/time");
      return withJsonFileLock(target, () => {
        const file = readFile(target);
        const records = file.records;
        const index = records.findIndex((record) => record.owner_id === input.owner_id && record.opportunity_id === input.opportunity_id);
        const previous = index >= 0 ? records[index] : null;
        const record: FollowupRecord = { opportunity_id: input.opportunity_id, owner_id: input.owner_id, status: input.status, note: input.note?.trim() ?? "", next_followup_at: input.next_followup_at ?? null, updated_at: new Date().toISOString(), revision: (previous?.revision ?? 0) + 1 };
        if (index >= 0) records[index] = record; else records.push(record);
        atomicWriteJson(target, { schema_version: "chanceping-procurement-followups.v1", updated_at: new Date().toISOString(), records, read_event_markers: file.read_event_markers });
        return record;
      });
    },
  };
}
