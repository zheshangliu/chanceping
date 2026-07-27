import fs from "node:fs";
import path from "node:path";

export interface SavedFilter { id: string; userId: string; name: string; edition: string; filters: Record<string, unknown>; createdAt: string; updatedAt: string; }
export interface Favorite { id: string; userId: string; opportunityId: string; createdAt: string; }
export interface BusinessReminder { id: string; userId: string; opportunityId: string; remindAt: string; status: "scheduled" | "sent" | "cancelled"; createdAt: string; }
interface WorkflowData { savedFilters: SavedFilter[]; favorites: Favorite[]; reminders: BusinessReminder[]; }

function empty(): WorkflowData { return { savedFilters: [], favorites: [], reminders: [] }; }
function id(prefix: string): string { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

export class BusinessWorkflowStore {
  private readonly filePath: string;
  private data: WorkflowData;
  constructor(filePath = process.env.CHANCEPING_BUSINESS_WORKFLOWS_PATH ?? path.resolve(process.cwd(), "data/business-workflows.json")) { this.filePath = filePath; this.data = this.load(); }
  private load(): WorkflowData { try { const value = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as WorkflowData; return { ...empty(), ...value }; } catch { return empty(); } }
  private save(): void { fs.mkdirSync(path.dirname(this.filePath), { recursive: true }); const temp = `${this.filePath}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(this.data, null, 2)); fs.renameSync(temp, this.filePath); }
  savedFilters(userId: string): SavedFilter[] { return this.data.savedFilters.filter((item) => item.userId === userId); }
  createSavedFilter(userId: string, input: { name: string; edition: string; filters: Record<string, unknown> }): SavedFilter { const now = new Date().toISOString(); const item = { id: id("filter"), userId, name: input.name, edition: input.edition, filters: input.filters, createdAt: now, updatedAt: now }; this.data.savedFilters.push(item); this.save(); return item; }
  deleteSavedFilter(userId: string, filterId: string): boolean { const before = this.data.savedFilters.length; this.data.savedFilters = this.data.savedFilters.filter((item) => !(item.userId === userId && item.id === filterId)); if (this.data.savedFilters.length !== before) this.save(); return this.data.savedFilters.length !== before; }
  favorites(userId: string): Favorite[] { return this.data.favorites.filter((item) => item.userId === userId); }
  addFavorite(userId: string, opportunityId: string): Favorite { const existing = this.data.favorites.find((item) => item.userId === userId && item.opportunityId === opportunityId); if (existing) return existing; const item = { id: id("fav"), userId, opportunityId, createdAt: new Date().toISOString() }; this.data.favorites.push(item); this.save(); return item; }
  deleteFavorite(userId: string, opportunityId: string): boolean { const before = this.data.favorites.length; this.data.favorites = this.data.favorites.filter((item) => !(item.userId === userId && item.opportunityId === opportunityId)); if (this.data.favorites.length !== before) this.save(); return this.data.favorites.length !== before; }
  reminders(userId: string): BusinessReminder[] { return this.data.reminders.filter((item) => item.userId === userId); }
  createReminder(userId: string, input: { opportunityId: string; remindAt: string }): BusinessReminder { if (Number.isNaN(Date.parse(input.remindAt))) throw new Error("remindAt must be an ISO date"); const item = { id: id("rem"), userId, opportunityId: input.opportunityId, remindAt: new Date(input.remindAt).toISOString(), status: "scheduled" as const, createdAt: new Date().toISOString() }; this.data.reminders.push(item); this.save(); return item; }
}
