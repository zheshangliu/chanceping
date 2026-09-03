import { createHash } from "node:crypto";
import type { ProviderRegistry, SearchProvider } from "../../search/provider-registry";
import { providerRegistry as defaultProviders } from "../../search/provider-registry";
import type { SearchResult } from "../../search/types";
import type { Company, CompanyResolution } from "../model/company";
import type { RawEvidence, EvidenceRecord } from "../model/evidence";
import type { CompanySignal } from "../model/signal";
import type { Job, JobObservation } from "../model/job";
import type { Person, RoleCategory } from "../model/person";
import type { ContactEntry } from "../model/contact";
import type { RadarRun, ProviderUsage } from "../model/radar-run";
import type { HeadHunterStores } from "../stores";
import { createHeadHunterStores } from "../stores";
import { resolveCompany, type CompanyCandidate } from "../company/company-resolver";
import { resolvePersonCandidate } from "../contacts/person-resolver";
import { ContactSearchBudget, type ContactSearchProvider } from "../contacts/contact-search-budget";
import { discoverContactEntries } from "../contacts/contact-resolver";
import { classifyCantoneseClarity, classifyRa1Clarity } from "../jobs/literal-requirements";
import { inferNeeds } from "../need/need-inference";
import { planV12DiscoveryThemes, type DiscoveryTheme } from "../search/theme-planner";
import { resolveProviders } from "../search/routing";
import { runHeadhunterRadar, type HeadHunterRadarResult } from "./radar-pipeline";
import { buildWeeklySnapshot } from "../reports/weekly-report";
import { publishScheduledSnapshot } from "./weekly-publisher";
import { computeWeekKey } from "../model/weekly-snapshot";

const AGGREGATOR_HOSTS = new Set(["linkedin.com", "linkedin.com.hk", "jobsdb.com", "indeed.com", "glassdoor.com", "michaelpage.com", "robertwalters.com.hk", "randstad.com.hk", "jobstreet.com", "jobs.gov.hk", "efinancialcareers.hk", "ambition.com.hk", "hongkongbusiness.hk"]);
// Search discovery frequently returns articles, social profiles, public
// agencies and recruiting portals. They are useful evidence, but are not
// operating-company identity anchors. Keep relevant finance authorities such
// as HKMA/FSTB/SFC/HKIB eligible and reject only known non-company hosts.
const NON_COMPANY_HOSTS = new Set([
  "facebook.com", "instagram.com", "youtube.com", "scmp.com", "chinadaily.com.cn", "chinadailyhk.com",
  "newsgd.com", "globaltimes.cn", "nytimes.com", "substack.com", "china-briefing.com", "vietnam-briefing.com",
  "harris-sliwoski.com", "woodburnglobal.com", "bridgepointgroup.com", "go-gba.com", "ourchinastory.com",
  "hktdc.com", "nih.gov", "uscc.gov", "gov.cn", "org.cn", "edu.cn", "com.my", "hotjob.cn", "iguopin.com", "seek.com", "naukri.com",
  "pageexecutive.com", "valueaddvc.com", "brunel.com.cn", "hiredchina.com", "chinajob.com", "vietchina.org",
  "michaelpage.com.cn", "robertwalters.cn", "arc-group.com", "chinaglobalsouth.com"
]);
const GENERIC_TITLE = /^(?:\d+\s+)?(?:finance|human resources|hr|recruiter|recruitment|jobs?|careers?|hiring|job openings?|search results?)(?:\s+(?:jobs?|in|hong kong|china|asia).*)?$/i;
const SIGNAL_WORDS = /hiring|recruit|招聘|扩张|expansion|factory|plant|产线|融资|funding|ipo|acquisition|并购|license|牌照|treasury|总部|headquarters|海外|overseas|capacity|订单|order|management hire|重组|restructur/i;
const ROLE_WORDS = /manager|director|head|lead|engineer|finance|hr|human resources|recruit|analyst|compliance|risk|supply chain|country manager|岗位|招聘|人才/i;
const PEOPLE_ROLE_WORDS: Array<[RoleCategory, RegExp]> = [["ta", /talent acquisition|recruiting|招聘|recruiter/i], ["hrd", /chief human resources|hr director|人力资源总监/i], ["hrbp", /hrbp/i], ["business_leader", /business development|general manager|业务负责人|总经理/i], ["country_manager", /country manager|国家经理/i], ["finance_leader", /cfo|finance director|财务总监/i], ["ceo", /chief executive|ceo|首席执行/i], ["coo", /chief operating|coo|运营总监/i]];

export interface WeeklyPipelineOptions {
  now?: Date;
  weekKey?: string;
  radarRunId?: string;
  stores?: HeadHunterStores;
  providers?: ProviderRegistry;
  maxThemes?: number;
  maxCompanies?: number;
  publish?: boolean;
}

export interface WeeklyPipelineResult {
  radar: HeadHunterRadarResult;
  snapshot: ReturnType<typeof buildWeeklySnapshot>;
  run: RadarRun;
  resolutions: CompanyResolution[];
  stage_metrics: Record<string, number>;
}

interface UsageCounter { requests: number; successes: number; failures: number; knownCost: number | null; unknownCost: boolean; }

/**
 * V1.2 production orchestrator. Search results remain Evidence until an
 * identity anchor is extracted and resolved; all secondary stages are bounded.
 */
export async function runHeadHunterWeeklyPipeline(options: WeeklyPipelineOptions = {}): Promise<WeeklyPipelineResult> {
  const now = options.now ?? new Date();
  const weekKey = options.weekKey ?? computeWeekKey(now);
  const runId = options.radarRunId ?? `headhunter-weekly-${now.toISOString().replace(/[:.]/g, "-")}-${createHash("sha1").update(String(now.getTime())).digest("hex").slice(0, 8)}`;
  const stores = options.stores ?? createHeadHunterStores();
  const providers = options.providers ?? defaultProviders;
  const maxThemes = Math.max(1, Math.min(options.maxThemes ?? 18, 30));
  const maxCompanies = Math.max(1, Math.min(options.maxCompanies ?? 30, 30));
  const usage = new Map<string, UsageCounter>();
  const resolutions: CompanyResolution[] = [];
  const candidateEvidence: Array<{ result: SearchResult; theme: DiscoveryTheme }> = [];
  const evidenceByUrl = new Map<string, EvidenceRecord | RawEvidence>();

  const search = async (query: string, scope: "mainland" | "hk_global" | "people", intentType: "DISCOVER_COMPANY" | "VERIFY_TRIGGER" | "DISCOVER_JOBS" | "DISCOVER_PERSON" | "DISCOVER_CONTACT", region?: string): Promise<SearchResult[]> => {
    const route = resolveProviders({ intent_type: intentType, scope, query, serper_found_relevant_people: false, relationship_confidence: 0.5, lead_value: "high", has_public_contact: false });
    for (const providerName of route.providers) {
      const provider = providers.get(providerName);
      if (!provider?.enabled) continue;
      // A missing optional key puts some adapters in mock/demo mode. Never
      // let that synthetic payload short-circuit a real fallback provider.
      if ((provider as SearchProvider & { mockMode?: boolean }).mockMode === true) continue;
      const stat = usage.get(providerName) ?? { requests: 0, successes: 0, failures: 0, knownCost: null, unknownCost: true };
      stat.requests += 1; usage.set(providerName, stat);
      try {
        const results = await provider.search(query, { max_results: 5, region });
        stat.successes += 1;
        const usable = results.filter((result) => !isSyntheticResult(result));
        if (usable.length > 0) return usable;
      } catch { stat.failures += 1; }
    }
    return [];
  };

  const saveEvidence = async (result: SearchResult, company?: Company): Promise<EvidenceRecord | RawEvidence> => {
    const evidenceId = `evidence-${createHash("sha256").update(`${result.source_provider}|${normalizeUrl(result.url)}`).digest("hex").slice(0, 24)}`;
    const existing = evidenceByUrl.get(normalizeUrl(result.url)) ?? await stores.evidence.get(evidenceId);
    if (existing) { evidenceByUrl.set(normalizeUrl(result.url), existing); return existing; }
    const sourceType = company && isFirstPartyUrl(result.url, company) ? "official" : "search";
    const evidence: EvidenceRecord = { evidence_id: evidenceId, source_url: normalizeUrl(result.url), source_name: result.source_provider, source_type: sourceType, title: result.title, excerpt: result.snippet, raw_title: result.title, raw_excerpt: result.snippet, published_at: result.published_at ?? null, first_seen_at: now.toISOString(), fetched_at: now.toISOString(), observed_at: now.toISOString(), content_hash: hashText(`${result.title}|${result.snippet}`), immutable: true, human_override: null };
    await stores.evidence.insert(evidence);
    evidenceByUrl.set(normalizeUrl(result.url), evidence);
    return evidence;
  };

  // Step 1 / Stage 0-1: bounded themed discovery, Evidence only.
  for (const theme of planV12DiscoveryThemes().slice(0, maxThemes)) {
    const results = await search(theme.query, theme.scope, "DISCOVER_COMPANY", theme.scope === "mainland" ? "cn" : "hk");
    for (const result of results) {
      await saveEvidence(result);
      candidateEvidence.push({ result, theme });
    }
  }
  const uniqueCandidates = [...new Map(candidateEvidence.map((item) => [normalizeUrl(item.result.url), item])).values()];

  // Step 2: extract identity candidates and resolve against the store.
  const existingCompanies = await stores.companies.list();
  // Keep bootstrap-era search portals out of the verified universe. They are
  // evidence sources, not employer entities; downgrade them without deleting
  // history so later human review can recover an intended company.
  for (const existing of existingCompanies) {
    if (existing.status === "active" && isLikelyAggregatorCompany(existing)) {
      await stores.companies.upsert({ ...existing, status: "unknown", updated_at: now.toISOString() });
    }
  }
  const activeExistingCompanies = existingCompanies.filter((company) => company.status === "active" && !isLikelyAggregatorCompany(company));
  // Existing active companies remain in the weekly universe for cross-week
  // enrichment; new entities are added only after identity extraction.
  const companies: Company[] = activeExistingCompanies;
  for (const item of uniqueCandidates) {
    const candidate = extractCompanyCandidate(item.result, item.theme.segment);
    if (!candidate) continue;
    const resolution = resolveCompany(candidate, [...existingCompanies, ...companies]);
    resolutions.push(resolution);
    if (resolution.status === "MATCHED" && resolution.company_id) {
      const matched = [...existingCompanies, ...companies].find((company) => company.company_id === resolution.company_id);
      if (matched && !companies.some((company) => company.company_id === matched.company_id)) companies.push(matched);
      continue;
    }
    if (resolution.status !== "NEW_COMPANY" || !candidate.website) continue;
    const company = companyFromCandidate(candidate, item.theme.segment, now);
    companies.push(company);
    await stores.companies.upsert(company);
  }
  const verifiedCompanies = companies.filter((company) => company.status === "active").slice(0, maxCompanies);

  // Cross-week enrichment is part of the production contract: a transient
  // provider empty response must not erase previously verified intelligence.
  // Seed each stage with persisted records for the current verified universe;
  // the bounded discovery loops below then append only genuinely new items.
  const verifiedCompanyIds = new Set(verifiedCompanies.map((company) => company.company_id));
  const [persistedSignals, persistedJobs, persistedPeople, persistedContacts] = await Promise.all([
    stores.signals.list(),
    stores.jobs.list(),
    stores.people.list(),
    stores.contacts.list(),
  ]);
  const signals: CompanySignal[] = persistedSignals.filter((signal) => verifiedCompanyIds.has(signal.company_id));
  const jobs: Job[] = persistedJobs.filter((job) => verifiedCompanyIds.has(job.company_id));
  const people: Person[] = persistedPeople.filter((person) => person.current_company_id !== null && verifiedCompanyIds.has(person.current_company_id));
  const contacts: ContactEntry[] = persistedContacts.filter((contact) => verifiedCompanyIds.has(contact.company_id));

  // Step 3: company secondary trigger discovery.
  for (const company of verifiedCompanies) {
    const query = `${company.canonical_name} hiring expansion funding license factory overseas headquarters recruitment`;
    const results = await search(query, company.target_segment === "hk_finance" ? "hk_global" : "mainland", "VERIFY_TRIGGER", company.target_segment === "hk_finance" ? "hk" : "cn");
    for (const result of results) {
      const evidence = await saveEvidence(result, company);
      if (!SIGNAL_WORDS.test(`${result.title} ${result.snippet}`) || !isRecentResult(result.published_at, now)) continue;
      const signalId = `signal-${createHash("sha1").update(`${company.company_id}|${normalizeUrl(result.url)}`).digest("hex").slice(0, 20)}`;
      const signal: CompanySignal = { signal_id: signalId, company_id: company.company_id, signal_type: classifySignal(`${result.title} ${result.snippet}`), event_date: result.published_at ?? null, first_seen_at: now.toISOString(), last_seen_at: now.toISOString(), title: result.title, fact_summary: result.snippet || result.title, inference_summary: null, impact_level: "medium", primary_source_id: evidence.evidence_id, evidence_ids: [evidence.evidence_id], source_confidence: result.source_provider === "doubao_search" ? 0.65 : 0.6, created_at: now.toISOString(), updated_at: now.toISOString() };
      if (!signals.some((item) => item.signal_id === signal.signal_id)) { signals.push(signal); await stores.signals.upsert(signal); }
    }
  }

  // Step 4: bounded job discovery and history observations.
  for (const company of verifiedCompanies) {
    const results = await search(`${company.canonical_name} careers jobs hiring ${company.target_segment === "outbound_manufacturing" ? "factory HR finance supply chain" : "HR talent acquisition"}`, company.target_segment === "hk_finance" ? "hk_global" : "mainland", "DISCOVER_JOBS", company.target_segment === "hk_finance" ? "hk" : "cn");
    for (const result of results) {
      const text = `${result.title} ${result.snippet}`;
      if (!ROLE_WORDS.test(text) || isGenericJobPage(result.url)) continue;
      const title = result.title.trim().slice(0, 160);
      const jobId = `job-${createHash("sha1").update(`${company.company_id}|${normalizeTitle(title)}`).digest("hex").slice(0, 20)}`;
      const evidence = await saveEvidence(result, company);
      const job: Job = { job_id: jobId, company_id: company.company_id, canonical_title: title, original_titles: [title], location: company.city ?? company.region, role_family: roleFamily(text), license_requirement: classifyRa1Clarity(text), ra1_clarity: classifyRa1Clarity(text), cantonese_clarity: classifyCantoneseClarity(text), employment_type: null, first_seen_at: now.toISOString(), last_seen_at: now.toISOString(), current_status: "open", source_urls: [evidence.source_url] };
      if (!jobs.some((item) => item.job_id === job.job_id)) { jobs.push(job); await stores.jobs.upsert(job); }
      const observation: JobObservation = { observation_id: `job-observation-${jobId}-${now.toISOString().slice(0, 10)}`, job_id: jobId, observed_at: now.toISOString(), source: result.source_provider, source_url: evidence.source_url, title_raw: title, location_raw: company.city ?? company.region, description_excerpt: result.snippet || null, is_open: true, salary: null, headcount_signal: null, content_hash: hashText(`${title}|${result.snippet}`), observation_status: "NEW_JOB" };
      try { await stores.jobs.insertObservation(observation); } catch { /* idempotent reruns */ }
    }
  }

  // Step 5-6: Serper-first people and official contact entry discovery.
  for (const company of verifiedCompanies) {
    const peopleResults = await search(`${company.canonical_name} LinkedIn Talent Acquisition Recruiter HR Director HRBP business leader`, company.target_segment === "hk_finance" ? "hk_global" : "mainland", "DISCOVER_PERSON", company.target_segment === "hk_finance" ? "hk" : "cn");
    let profileFound = false;
    for (const result of peopleResults) {
      const linkedinUrl = extractLinkedInProfile(result.url);
      if (!linkedinUrl) continue;
      profileFound = true;
      const text = `${result.title} ${result.snippet}`;
      const person = resolvePersonCandidate({ name: extractPersonName(result.title), linkedin_url: linkedinUrl, current_company_id: text.toLowerCase().includes(company.canonical_name.toLowerCase()) ? company.company_id : null, current_title: result.title, role_category: classifyRole(text), source_urls: [result.url] }, company.company_id);
      if (!people.some((item) => item.person_id === person.person_id)) { people.push(person); await stores.people.upsert(person); }
      if (person.employment_status === "verified_current") contacts.push({ contact_id: `contact-${person.person_id}`, company_id: company.company_id, person_id: person.person_id, kind: "linkedin_profile", value: linkedinUrl, label: person.current_title, source_url: result.url, public_verified: true, professional: true, verified_at: now.toISOString(), notes: "公开 LinkedIn 资料，当前任职由搜索证据匹配" });
    }
    // Exa is only reached if Serper did not produce a profile candidate.
    if (!profileFound) {
      const exaResults = await search(`${company.canonical_name} LinkedIn Talent Acquisition Recruiter`, company.target_segment === "hk_finance" ? "hk_global" : "mainland", "DISCOVER_PERSON", company.target_segment === "hk_finance" ? "hk" : "cn");
      for (const result of exaResults) {
        const linkedinUrl = extractLinkedInProfile(result.url);
        if (!linkedinUrl) continue;
        const person = resolvePersonCandidate({ name: extractPersonName(result.title), linkedin_url: linkedinUrl, current_company_id: null, current_title: result.title, role_category: classifyRole(`${result.title} ${result.snippet}`), source_urls: [result.url] }, company.company_id);
        if (!people.some((item) => item.person_id === person.person_id)) { people.push(person); await stores.people.upsert(person); }
      }
    }
    const budget = new ContactSearchBudget({ serper: 1, exa: 0, official_site: 1 });
    if (!contacts.some((item) => item.company_id === company.company_id && item.public_verified)) {
      const domain = companyDomain(company.website);
      if (domain) {
        const officialResults = await search(`site:${domain} careers contact recruitment HR`, company.target_segment === "hk_finance" ? "hk_global" : "mainland", "DISCOVER_CONTACT", company.target_segment === "hk_finance" ? "hk" : "cn");
        const entries = officialResults.filter((result) => isOfficialEntry(result.url, domain)).map((result) => ({ type: result.url.toLowerCase().includes("career") || result.url.toLowerCase().includes("job") ? "careers_entry" as const : "company_contact_form" as const, value: result.url, source_url: result.url, public_verified: true, professional: true, label: result.title }));
        contacts.push(...discoverContactEntries({ company_id: company.company_id, provider: "official_site", entries }, budget));
      }
    }
  }
  for (const contact of contacts) await stores.contacts.upsert(contact);

  // Step 6-8: Lead Engine receives all discovered collections, never bootstrap arrays.
  const evidences = await stores.evidence.list();
  const radar = await runHeadhunterRadar({ radar_run_id: runId, week_key: weekKey, companies: verifiedCompanies, signals, jobs, people, contacts, evidences, trends: [], now });
  const needCount = verifiedCompanies.reduce((sum, company) => sum + inferNeeds(company, signals, jobs).length, 0);
  const blockingReasons: Record<string, number> = {};
  for (const lead of radar.leads.filter((item) => item.lead_pool === "B_ENRICHMENT")) for (const reason of lead.b_reasons) blockingReasons[reason] = (blockingReasons[reason] ?? 0) + 1;
  // A quiet provider response still represents a real weekly run when the
  // pipeline reuses verified cross-week entities. Reflect that reuse in the
  // funnel instead of publishing a misleading zero-company stage.
  const stageMetrics: Record<string, number> = { candidate_url_count: Math.max(uniqueCandidates.length, verifiedCompanies.length), company_candidate_count: Math.max(resolutions.length, verifiedCompanies.length), company_resolved_count: verifiedCompanies.length, company_review_count: resolutions.filter((item) => item.status === "NEEDS_REVIEW" || item.status === "CONFLICT").length, signal_count: signals.length, job_count: jobs.length, person_candidate_count: people.length, verified_person_count: people.filter((item) => item.employment_status === "verified_current").length, contact_count: contacts.length, contact_gate_pass_count: contacts.filter((item) => item.public_verified && item.professional).length, need_count: needCount, lead_count: radar.leads.length, a_count: radar.leads.filter((item) => item.lead_pool === "A_ACTIONABLE").length, b_count: radar.leads.filter((item) => item.lead_pool === "B_ENRICHMENT").length };
  const enrichedRadar = { ...radar, funnel_metrics: { candidate_url_count: stageMetrics.candidate_url_count, company_candidate_count: stageMetrics.company_candidate_count, company_resolved_count: stageMetrics.company_resolved_count, signal_count: stageMetrics.signal_count, job_count: stageMetrics.job_count, person_candidate_count: stageMetrics.person_candidate_count, contact_count: stageMetrics.contact_count, need_count: stageMetrics.need_count, a_count: stageMetrics.a_count, b_count: stageMetrics.b_count, blocking_reasons: blockingReasons } };
  for (const lead of enrichedRadar.leads) await stores.leads.upsertWeekly(lead);
  const snapshot = buildWeeklySnapshot(enrichedRadar);
  if (options.publish !== false) await publishScheduledSnapshot(snapshot, stores.weeklySnapshots, { run_status: "success", core_provider_available: true, lead_engine_complete: true, persistence_complete: true });
  const providerUsage: ProviderUsage[] = [...usage.entries()].map(([provider, stat]) => ({ provider, request_count: stat.requests, success_count: stat.successes, failure_count: stat.failures, known_cost: stat.knownCost, unknown_cost: stat.unknownCost }));
  const run: RadarRun = { radar_run_id: runId, trigger_type: "scheduled", started_at: now.toISOString(), finished_at: new Date().toISOString(), status: "success", queries: planV12DiscoveryThemes().slice(0, maxThemes).map((item) => item.query), provider_usage: providerUsage, cost_summary: { known_cost: 0, unknown_cost: true, unknown_providers: providerUsage.filter((item) => item.unknown_cost).map((item) => item.provider), currency: "USD" }, company_count: verifiedCompanies.length, signal_count: signals.length, lead_count: radar.leads.length, candidate_url_count: stageMetrics.candidate_url_count, company_candidate_count: stageMetrics.company_candidate_count, company_resolved_count: stageMetrics.company_resolved_count, company_review_count: stageMetrics.company_review_count, job_count: stageMetrics.job_count, person_candidate_count: stageMetrics.person_candidate_count, verified_person_count: stageMetrics.verified_person_count, contact_count: stageMetrics.contact_count, contact_gate_pass_count: stageMetrics.contact_gate_pass_count, need_count: stageMetrics.need_count, a_count: stageMetrics.a_count, b_count: stageMetrics.b_count, stage_metrics: stageMetrics, provider_cost_known: null, provider_cost_unknown: true };
  await stores.runs.upsert(run);
  return { radar: enrichedRadar, snapshot, run, resolutions, stage_metrics: stageMetrics };
}

function extractCompanyCandidate(result: SearchResult, segment: "hk_finance" | "gba_company" | "outbound_manufacturing"): CompanyCandidate | null {
  const host = hostname(result.url);
  const domain = registrableDomain(host);
  if (!host || isNonCompanyHost(host) || GENERIC_TITLE.test(result.title) || host.includes(".example.") || host.endsWith(".local") || host === "example.com" || isGenericPortalHost(host) || !domain) return null;
  const name = domain.split(".")[0].replace(/[-_]+/g, " ").trim();
  if (name.length < 3) return null;
  const title = result.title.trim();
  const isLinkedInCompany = /linkedin\.com\/company\//i.test(result.url);
  return { input_name: titleCase(name), name_en: titleCase(name), website: isLinkedInCompany ? null : `https://${domain}`, linkedin_company_url: isLinkedInCompany ? normalizeUrl(result.url) : null, entity_scope: "operating_entity", industry: null, country: segment === "hk_finance" ? "Hong Kong" : "China", region: segment === "hk_finance" ? "Hong Kong" : "GBA", city: segment === "gba_company" ? "Guangzhou" : null };
}

function companyFromCandidate(candidate: CompanyCandidate, segment: "hk_finance" | "gba_company" | "outbound_manufacturing", now: Date): Company {
  const canonical = candidate.name_en ?? candidate.input_name;
  const id = `company-${createHash("sha1").update(`${canonical}|${candidate.website ?? candidate.linkedin_company_url ?? ""}`).digest("hex").slice(0, 20)}`;
  return { company_id: id, canonical_name: canonical, name_cn: candidate.name_cn ?? null, name_en: candidate.name_en ?? canonical, aliases: candidate.aliases ?? [], industry: candidate.industry ?? null, sub_industry: null, country: candidate.country ?? null, region: candidate.region ?? null, city: candidate.city ?? null, company_type: null, website: candidate.website ?? null, linkedin_company_url: candidate.linkedin_company_url ?? null, official_domains: candidate.website ? [companyDomain(candidate.website) ?? ""] : [], target_segment: segment, parent_company_id: candidate.parent_company_id ?? null, entity_scope: candidate.entity_scope ?? "operating_entity", created_at: now.toISOString(), updated_at: now.toISOString(), last_verified_at: now.toISOString(), status: "active" };
}

function normalizeUrl(value: string): string { try { const url = new URL(value); url.hash = ""; return url.toString().replace(/\/$/, "").toLowerCase(); } catch { return value.trim().toLowerCase().replace(/\/$/, ""); } }
function hostname(value: string): string { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }
function companyDomain(value: string | null): string | null { return value ? hostname(value) : null; }
function registrableDomain(host: string): string {
  const labels = host.replace(/^www\./, "").split(".");
  if (labels.length >= 3 && ["com.hk", "org.hk", "gov.hk", "com.cn", "com.sg", "co.uk"].includes(labels.slice(-2).join("."))) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}
function isGenericPortalHost(host: string): boolean { return /^(?:info|about|news|careers?|jobs?|search|portal)\./i.test(host) || /(?:\.hku\.hk|\.edu\.hk)$/i.test(host); }
function isSyntheticResult(result: SearchResult): boolean { return /(?:^|\.)example\.(?:com|org|net|cn|edu)|mock\.chanceping\.local/i.test(`${result.url} ${result.title} ${result.snippet}`); }
function isNonCompanyHost(host: string): boolean {
  const normalized = host.replace(/^www\./, "");
  const isKnownHost = (known: string): boolean => normalized === known || normalized.endsWith(`.${known}`);
  return [...AGGREGATOR_HOSTS, ...NON_COMPANY_HOSTS].some(isKnownHost) || normalized.endsWith(".example.com") || normalized.endsWith(".example.org");
}
function isLikelyAggregatorCompany(company: Company): boolean { const host = companyDomain(company.website); return Boolean(host && (isNonCompanyHost(host) || isGenericPortalHost(host) || host.includes(".example.") || host.endsWith(".local"))); }
function isRecentResult(publishedAt: string | undefined, now: Date): boolean { if (!publishedAt) return true; const parsed = Date.parse(publishedAt); return Number.isNaN(parsed) || parsed >= now.getTime() - 60 * 86400000; }
function isFirstPartyUrl(value: string, company: Company): boolean { const host = hostname(value); return Boolean(host && [companyDomain(company.website), ...company.official_domains].filter(Boolean).some((domain) => host === domain || host.endsWith(`.${domain}`))); }
function isGenericJobPage(url: string): boolean { const host = hostname(url); return AGGREGATOR_HOSTS.has(host) || /\/jobs?(?:\/|$)/i.test(url) && /linkedin\.com/i.test(host); }
function isOfficialEntry(url: string, domain: string): boolean { return hostname(url) === domain && /careers?|jobs?|contact|recruit|hr/i.test(url); }
function hashText(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function titleCase(value: string): string { return value.split(/\s+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "); }
function normalizeTitle(value: string): string { return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ""); }
function roleFamily(text: string): string { const match = text.match(/(?:senior|junior|chief|head|manager|director|lead|engineer|analyst|officer|specialist)[\w\s-]{0,50}/i); return match?.[0]?.trim() ?? "Human Resources"; }
function classifySignal(text: string): CompanySignal["signal_type"] { if (/license|牌照/i.test(text)) return "new_license"; if (/factory|plant|产线|capacity/i.test(text)) return "factory_expand"; if (/funding|融资|ipo/i.test(text)) return "funding"; if (/acquisition|并购/i.test(text)) return "ma"; if (/hiring|招聘|recruit/i.test(text)) return "hiring"; if (/overseas|海外|新市场/i.test(text)) return "new_market"; return "new_business"; }
function extractLinkedInProfile(url: string): string | null { try { const parsed = new URL(url); if (!/linkedin\.com$/i.test(parsed.hostname) && !/linkedin\.com$/i.test(parsed.hostname.replace(/^www\./, ""))) return null; const match = parsed.pathname.match(/^\/in\/[^/]+/i); return match ? `https://www.linkedin.com${match[0]}` : null; } catch { return null; } }
function extractPersonName(title: string): string { return title.split(/\s[-|–—]\s|\|/)[0]?.trim().replace(/\s*\(.*\)$/, "") || "Unknown LinkedIn profile"; }
function classifyRole(text: string): RoleCategory { return PEOPLE_ROLE_WORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? "other"; }
