import type { WeeklySnapshot } from "../model/weekly-snapshot";
import type { WeeklySnapshotStore } from "../stores";
import { JsonWeeklySnapshotStore } from "../stores";
import { renderWeeklyMarkdown } from "../reports/markdown-export";

export type PublishRunStatus = "success" | "partial" | "failed" | "manual";

export interface PublishContext {
  run_status?: PublishRunStatus;
  core_provider_available?: boolean;
  lead_engine_complete?: boolean;
  persistence_complete?: boolean;
}

export async function publishScheduledSnapshot(snapshot: WeeklySnapshot, store: WeeklySnapshotStore = new JsonWeeklySnapshotStore(), context: PublishContext = {}): Promise<void> {
  const status = context.run_status ?? "success";
  if (status === "failed") return;
  if (status === "partial" && !(context.core_provider_available && context.lead_engine_complete && context.persistence_complete)) return;
  const published = { ...snapshot, published: true, published_at: new Date().toISOString(), markdown: renderWeeklyMarkdown(snapshot), updated_at: new Date().toISOString() };
  await store.upsertPublished(published);
}

export async function setManualRunAsOfficial(runId: string, snapshot: WeeklySnapshot, store: WeeklySnapshotStore = new JsonWeeklySnapshotStore()): Promise<WeeklySnapshot> {
  if (snapshot.radar_run_id !== runId) throw new Error("manual run does not match snapshot");
  const published = { ...snapshot, published: true, published_at: new Date().toISOString(), markdown: renderWeeklyMarkdown(snapshot), updated_at: new Date().toISOString() };
  await store.upsertPublished(published);
  return published;
}
