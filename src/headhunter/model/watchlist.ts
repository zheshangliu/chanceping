export type WatchlistStatus = "watching" | "paused" | "archived";

export interface WatchlistCompany {
  watchlist_id: string;
  company_id: string;
  status: WatchlistStatus;
  priority: "high" | "normal";
  note: string | null;
  last_snapshot_week: string | null;
  created_at: string;
  updated_at: string;
}
