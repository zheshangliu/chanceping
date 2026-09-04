import { join } from "node:path";
import type { Company } from "../model/company";
import type { RawEvidence, EvidenceRecord } from "../model/evidence";
import type { Job, JobObservation } from "../model/job";
import type { WeeklyLeadSnapshot, LeadPool } from "../model/lead";
import type { Person } from "../model/person";
import type { ContactEntry } from "../model/contact";
import type { RadarRun } from "../model/radar-run";
import type { CompanySignal } from "../model/signal";
import type { TrendIntelligence } from "../model/trend";
import type { WeeklySnapshot } from "../model/weekly-snapshot";
import type { HumanEvidenceOverride } from "../model/evidence";
import type { OpportunityRecord } from "../model/opportunity";
import type { WatchlistCompany } from "../model/watchlist";
import { defaultHeadHunterDataDir, JsonCollectionStore, StoreError } from "./json-store";

export interface CompanyStore {
  upsert(company: Company): Promise<void>;
  get(companyId: string): Promise<Company | null>;
  list(): Promise<Company[]>;
}

export interface EvidenceStore {
  insert(evidence: RawEvidence | EvidenceRecord): Promise<void>;
  get(evidenceId: string): Promise<EvidenceRecord | RawEvidence | null>;
  list(): Promise<Array<EvidenceRecord | RawEvidence>>;
  replaceRaw(evidenceId: string, patch: Record<string, string>): Promise<never>;
  applyOverride(evidenceId: string, override: HumanEvidenceOverride): Promise<EvidenceRecord>;
}

export interface SignalStore {
  upsert(signal: CompanySignal): Promise<void>;
  listByCompany(companyId: string): Promise<CompanySignal[]>;
  list(): Promise<CompanySignal[]>;
}

export interface JobStore {
  upsert(job: Job): Promise<void>;
  listByCompany(companyId: string): Promise<Job[]>;
  list(): Promise<Job[]>;
  insertObservation(observation: JobObservation): Promise<void>;
  listObservations(jobId: string): Promise<JobObservation[]>;
}

export interface PersonStore {
  upsert(person: Person): Promise<void>;
  get(personId: string): Promise<Person | null>;
  list(): Promise<Person[]>;
}

export interface ContactStore {
  upsert(contact: ContactEntry): Promise<void>;
  listByCompany(companyId: string): Promise<ContactEntry[]>;
  list(): Promise<ContactEntry[]>;
}

export interface LeadStore {
  upsertWeekly(snapshot: WeeklyLeadSnapshot): Promise<void>;
  getByCompanyWeek(companyId: string, weekKey: string): Promise<WeeklyLeadSnapshot | null>;
  listByCompany(companyId: string): Promise<WeeklyLeadSnapshot[]>;
  listByWeek(weekKey: string): Promise<WeeklyLeadSnapshot[]>;
  listByPool(pool: LeadPool): Promise<WeeklyLeadSnapshot[]>;
  list(): Promise<WeeklyLeadSnapshot[]>;
}

export interface TrendStore {
  upsert(trend: TrendIntelligence): Promise<void>;
  list(): Promise<TrendIntelligence[]>;
}

export interface WeeklySnapshotStore {
  upsertPublished(snapshot: WeeklySnapshot): Promise<void>;
  getPublished(weekKey: string): Promise<WeeklySnapshot | null>;
  list(): Promise<WeeklySnapshot[]>;
}

export interface HeadHunterRunStore {
  upsert(run: RadarRun): Promise<void>;
  get(runId: string): Promise<RadarRun | null>;
  list(): Promise<RadarRun[]>;
}

export interface OpportunityStore {
  upsert(opportunity: OpportunityRecord): Promise<void>;
  get(opportunityId: string): Promise<OpportunityRecord | null>;
  list(): Promise<OpportunityRecord[]>;
  listByStatus(status: OpportunityRecord["status"]): Promise<OpportunityRecord[]>;
}

export interface WatchlistStore {
  upsert(item: WatchlistCompany): Promise<void>;
  get(watchlistId: string): Promise<WatchlistCompany | null>;
  list(): Promise<WatchlistCompany[]>;
}

export class JsonOpportunityStore implements OpportunityStore {
  private readonly store: JsonCollectionStore<OpportunityRecord>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "opportunities.json"), keyOf: (v) => v.opportunity_id }); }
  upsert(value: OpportunityRecord): Promise<void> { return this.store.upsert(value); }
  get(id: string): Promise<OpportunityRecord | null> { return this.store.getByKey(id); }
  list(): Promise<OpportunityRecord[]> { return this.store.list(); }
  async listByStatus(status: OpportunityRecord["status"]): Promise<OpportunityRecord[]> { return (await this.store.list()).filter((item) => item.status === status); }
}

export class JsonWatchlistStore implements WatchlistStore {
  private readonly store: JsonCollectionStore<WatchlistCompany>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "watchlist.json"), keyOf: (v) => v.watchlist_id }); }
  upsert(value: WatchlistCompany): Promise<void> { return this.store.upsert(value); }
  get(id: string): Promise<WatchlistCompany | null> { return this.store.getByKey(id); }
  list(): Promise<WatchlistCompany[]> { return this.store.list(); }
}

export class JsonCompanyStore implements CompanyStore {
  private readonly store: JsonCollectionStore<Company>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "companies.json"), keyOf: (v) => v.company_id }); }
  upsert(value: Company): Promise<void> { return this.store.upsert(value); }
  get(id: string): Promise<Company | null> { return this.store.getByKey(id); }
  list(): Promise<Company[]> { return this.store.list(); }
}

export class JsonEvidenceStore implements EvidenceStore {
  private readonly store: JsonCollectionStore<EvidenceRecord | RawEvidence>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "evidence.json"), keyOf: (v) => "evidence_id" in v ? v.evidence_id : "" }); }
  insert(value: RawEvidence | EvidenceRecord): Promise<void> { return this.store.insert(value); }
  get(id: string): Promise<EvidenceRecord | RawEvidence | null> { return this.store.getByKey(id); }
  list(): Promise<Array<EvidenceRecord | RawEvidence>> { return this.store.list(); }
  async replaceRaw(evidenceId: string, _patch: Record<string, string>): Promise<never> {
    if (!await this.store.getByKey(evidenceId)) throw new StoreError(`Evidence not found: ${evidenceId}`);
    throw new StoreError("Raw evidence is immutable; write a human_override instead");
  }
  async applyOverride(evidenceId: string, override: HumanEvidenceOverride): Promise<EvidenceRecord> {
    const evidence = await this.store.getByKey(evidenceId);
    if (!evidence) throw new StoreError(`Evidence not found: ${evidenceId}`);
    const updated: EvidenceRecord = { ...evidence, human_override: { ...override } };
    await this.store.upsert(updated);
    return updated;
  }
}

export class JsonSignalStore implements SignalStore {
  private readonly store: JsonCollectionStore<CompanySignal>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "signals.json"), keyOf: (v) => v.signal_id }); }
  upsert(value: CompanySignal): Promise<void> { return this.store.upsert(value); }
  async listByCompany(companyId: string): Promise<CompanySignal[]> { return (await this.store.list()).filter((v) => v.company_id === companyId); }
  list(): Promise<CompanySignal[]> { return this.store.list(); }
}

export class JsonJobStore implements JobStore {
  private readonly jobs: JsonCollectionStore<Job>;
  private readonly observations: JsonCollectionStore<JobObservation>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.jobs = new JsonCollectionStore({ filePath: join(dataDir, "jobs.json"), keyOf: (v) => v.job_id }); this.observations = new JsonCollectionStore({ filePath: join(dataDir, "job-observations.json"), keyOf: (v) => v.observation_id }); }
  upsert(value: Job): Promise<void> { return this.jobs.upsert(value); }
  async listByCompany(companyId: string): Promise<Job[]> { return (await this.jobs.list()).filter((v) => v.company_id === companyId); }
  list(): Promise<Job[]> { return this.jobs.list(); }
  insertObservation(value: JobObservation): Promise<void> { return this.observations.insert(value); }
  async listObservations(jobId: string): Promise<JobObservation[]> { return (await this.observations.list()).filter((v) => v.job_id === jobId); }
}

export class JsonPersonStore implements PersonStore {
  private readonly store: JsonCollectionStore<Person>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "people.json"), keyOf: (v) => v.person_id }); }
  upsert(value: Person): Promise<void> { return this.store.upsert(value); }
  get(id: string): Promise<Person | null> { return this.store.getByKey(id); }
  list(): Promise<Person[]> { return this.store.list(); }
}

export class JsonContactStore implements ContactStore {
  private readonly store: JsonCollectionStore<ContactEntry>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "contacts.json"), keyOf: (v) => v.contact_id }); }
  upsert(value: ContactEntry): Promise<void> { return this.store.upsert(value); }
  async listByCompany(companyId: string): Promise<ContactEntry[]> { return (await this.store.list()).filter((v) => v.company_id === companyId); }
  list(): Promise<ContactEntry[]> { return this.store.list(); }
}

export class JsonLeadStore implements LeadStore {
  private readonly store: JsonCollectionStore<WeeklyLeadSnapshot>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "weekly-leads.json"), keyOf: (v) => `${v.company_id}::${v.week_key}` }); }
  upsertWeekly(value: WeeklyLeadSnapshot): Promise<void> { return this.store.upsert(value); }
  getByCompanyWeek(companyId: string, weekKey: string): Promise<WeeklyLeadSnapshot | null> { return this.store.getByKey(`${companyId}::${weekKey}`); }
  async listByCompany(companyId: string): Promise<WeeklyLeadSnapshot[]> { return (await this.store.list()).filter((v) => v.company_id === companyId); }
  async listByWeek(weekKey: string): Promise<WeeklyLeadSnapshot[]> { return (await this.store.list()).filter((v) => v.week_key === weekKey); }
  async listByPool(pool: LeadPool): Promise<WeeklyLeadSnapshot[]> { return (await this.store.list()).filter((v) => v.lead_pool === pool); }
  list(): Promise<WeeklyLeadSnapshot[]> { return this.store.list(); }
}

export class JsonTrendStore implements TrendStore {
  private readonly store: JsonCollectionStore<TrendIntelligence>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "trends.json"), keyOf: (v) => v.trend_id }); }
  upsert(value: TrendIntelligence): Promise<void> { return this.store.upsert(value); }
  list(): Promise<TrendIntelligence[]> { return this.store.list(); }
}

export class JsonWeeklySnapshotStore implements WeeklySnapshotStore {
  private readonly store: JsonCollectionStore<WeeklySnapshot>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "weekly-snapshots.json"), keyOf: (v) => v.week_key }); }
  upsertPublished(value: WeeklySnapshot): Promise<void> { return this.store.upsert(value); }
  getPublished(weekKey: string): Promise<WeeklySnapshot | null> { return this.store.getByKey(weekKey); }
  list(): Promise<WeeklySnapshot[]> { return this.store.list(); }
}

export class JsonHeadHunterRunStore implements HeadHunterRunStore {
  private readonly store: JsonCollectionStore<RadarRun>;
  constructor(dataDir = defaultHeadHunterDataDir()) { this.store = new JsonCollectionStore({ filePath: join(dataDir, "radar-runs.json"), keyOf: (v) => v.radar_run_id }); }
  upsert(value: RadarRun): Promise<void> { return this.store.upsert(value); }
  get(id: string): Promise<RadarRun | null> { return this.store.getByKey(id); }
  list(): Promise<RadarRun[]> { return this.store.list(); }
}

export interface HeadHunterStores {
  companies: CompanyStore;
  evidence: EvidenceStore;
  signals: SignalStore;
  jobs: JobStore;
  people: PersonStore;
  contacts: ContactStore;
  leads: LeadStore;
  trends: TrendStore;
  weeklySnapshots: WeeklySnapshotStore;
  runs: HeadHunterRunStore;
  opportunities: OpportunityStore;
  watchlist: WatchlistStore;
}

export function createHeadHunterStores(dataDir = defaultHeadHunterDataDir()): HeadHunterStores {
  return {
    companies: new JsonCompanyStore(dataDir),
    evidence: new JsonEvidenceStore(dataDir),
    signals: new JsonSignalStore(dataDir),
    jobs: new JsonJobStore(dataDir),
    people: new JsonPersonStore(dataDir),
    contacts: new JsonContactStore(dataDir),
    leads: new JsonLeadStore(dataDir),
    trends: new JsonTrendStore(dataDir),
    weeklySnapshots: new JsonWeeklySnapshotStore(dataDir),
    runs: new JsonHeadHunterRunStore(dataDir),
    opportunities: new JsonOpportunityStore(dataDir),
    watchlist: new JsonWatchlistStore(dataDir),
  };
}

export { defaultHeadHunterDataDir, JsonCollectionStore, StoreError } from "./json-store";
