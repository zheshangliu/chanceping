import type { Company } from "../model/company";
import type { RawEvidence, EvidenceRecord } from "../model/evidence";
import type { CompanySignal } from "../model/signal";
import type { Job } from "../model/job";
import type { Person } from "../model/person";
import type { ContactEntry } from "../model/contact";
import { isContactGateEligible } from "../model/contact";
import { evaluateEntityRelation, isOfficialCompanyDomain } from "./entity-relation-filter";
import { evaluateTriggerQuality, isGenericTriggerPage } from "./trigger-quality";
import { isGenericJobSourceUrl } from "./quality-filters";

export type EligibilityStatus =
  | "eligible"
  | "stale"
  | "entity_mismatch"
  | "region_mismatch"
  | "employer_mismatch"
  | "insufficient_date"
  | "generic_reference"
  | "invalid_relation"
  | "unknown";

export interface EligibilityDecision<T> {
  item: T;
  eligible: boolean;
  status: EligibilityStatus;
  reasons: string[];
}

export interface EligibilityReasonCounts {
  [reason: string]: number;
  invalid_relation: number;
  stale: number;
  entity_mismatch: number;
  region_mismatch: number;
  employer_mismatch: number;
  generic_reference: number;
  insufficient_date: number;
  unknown: number;
}

export interface EligibilityCollections {
  allSignals: CompanySignal[];
  eligibleSignals: CompanySignal[];
  allJobs: Job[];
  eligibleJobs: Job[];
  allPeople: Person[];
  eligiblePeople: Person[];
  allContacts: ContactEntry[];
  eligibleContacts: ContactEntry[];
  signalDecisions: EligibilityDecision<CompanySignal>[];
  jobDecisions: EligibilityDecision<Job>[];
  personDecisions: EligibilityDecision<Person>[];
  contactDecisions: EligibilityDecision<ContactEntry>[];
  ineligibleByReason: EligibilityReasonCounts;
}

const OFFICIAL_CONTACT_KINDS = new Set(["email", "phone", "corporate_email", "corporate_phone", "contact_form", "company_contact_form", "careers_form", "careers_entry", "official_website", "website"]);

export function revalidateSignals(signals: CompanySignal[], companies: Company[], evidences: Array<RawEvidence | EvidenceRecord>, now: Date): EligibilityDecision<CompanySignal>[] {
  const companyMap = new Map(companies.map((company) => [company.company_id, company]));
  const evidenceMap = new Map(evidences.map((evidence) => [evidence.evidence_id, evidence]));
  return signals.map((signal) => {
    const company = companyMap.get(signal.company_id);
    if (!company || company.status !== "active") return decision(signal, "invalid_relation", ["company is not an active verified entity"]);
    const source = (signal.primary_source_id ? evidenceMap.get(signal.primary_source_id) : undefined) ?? (signal.evidence_ids ?? []).map((id) => evidenceMap.get(id)).find(Boolean);
    const rawEventDate = signal.event_date;
    const eventTimestamp = rawEventDate ? Date.parse(rawEventDate) : Number.NaN;
    if (!Number.isFinite(eventTimestamp)) return decision(signal, "insufficient_date", ["event_date is missing or unparsable"]);
    if (eventTimestamp > now.getTime()) return decision(signal, "invalid_relation", ["event_date is in the future"]);
    const ageDays = (now.getTime() - eventTimestamp) / 86400000;
    if (ageDays > 60) return decision(signal, "stale", ["event_date is older than 60 days"]);
    const sourceUrl = source?.source_url ?? "";
    const title = signal.title ?? "";
    const body = `${title} ${signal.fact_summary ?? ""} ${source?.excerpt ?? ""}`;
    if (isGenericTriggerPage(sourceUrl, title, body)) return decision(signal, "generic_reference", ["generic page cannot be a current Trigger"]);
    const relation = evaluateEntityRelation({
      target_company: company,
      candidate: { title, snippet: body, url: sourceUrl, location: company.city ?? company.region ?? company.country },
      candidate_type: "signal",
      expected_region: company.city ?? company.region ?? company.country,
    });
    if (!relation.company_match) return decision(signal, "entity_mismatch", relation.reasons);
    if (relation.region_match === false) return decision(signal, "region_mismatch", relation.reasons);
    const quality = evaluateTriggerQuality({ title, snippet: body, url: sourceUrl, event_date: signal.event_date, source_type: source?.source_type ?? null }, {
      now,
      target_company_name: company.canonical_name,
      target_company_aliases: [company.name_en, company.name_cn, ...company.aliases].filter((value): value is string => Boolean(value)),
      target_region: company.city ?? company.region ?? company.country,
      target_website: company.website,
    });
    if (!quality.valid_for_a_gate) return decision(signal, statusForTrigger(quality.status), quality.reasons);
    return eligible(signal);
  });
}

export function revalidateJobs(jobs: Job[], companies: Company[], now: Date): EligibilityDecision<Job>[] {
  const companyMap = new Map(companies.map((company) => [company.company_id, company]));
  return jobs.map((job) => {
    const company = companyMap.get(job.company_id);
    if (!company || company.status !== "active") return decision(job, "invalid_relation", ["company is not an active verified entity"]);
    if (job.current_status !== "open") return decision(job, "stale", [`job status is ${job.current_status}`]);
    const lastSeen = Date.parse(job.last_seen_at);
    if (!Number.isFinite(lastSeen)) return decision(job, "unknown", ["last_seen_at is missing or unparsable"]);
    if ((now.getTime() - lastSeen) / 86400000 > 90) return decision(job, "stale", ["job was not observed within 90 days"]);
    const title = `${job.canonical_title} ${(job.original_titles ?? []).join(" ")}`;
    const urls = job.source_urls ?? [];
    if (!urls.length) return decision(job, "unknown", ["job has no source URL"]);
    if (urls.some((url) => isGenericJobSourceUrl(url) || isKnownThirdPartyJobHost(url))) {
      // A third-party result is allowed only when the title contains an
      // explicit employer binding and no conflicting employer is present.
      if (!explicitEmployerMatch(title, company) || hasConflictingEmployer(title, company)) return decision(job, "employer_mismatch", ["job source is generic or employer is not explicitly bound"]);
    }
    if (hasConflictingEmployer(title, company)) return decision(job, "employer_mismatch", ["job title names a different employer"]);
    const official = urls.some((url) => isOfficialCompanyDomain(url, company));
    const relation = evaluateEntityRelation({
      target_company: company,
      candidate: { title, company_name: explicitEmployerMatch(title, company) ? company.canonical_name : null, url: urls[0], location: job.location },
      candidate_type: "job",
      expected_region: company.city ?? company.region ?? company.country,
    });
    if (!relation.company_match) return decision(job, "entity_mismatch", relation.reasons);
    if (relation.region_match === false) return decision(job, "region_mismatch", relation.reasons);
    if (!job.location) return decision(job, "unknown", ["job geography is not stated"]);
    if (!official && !explicitEmployerMatch(title, company)) return decision(job, "employer_mismatch", ["non-first-party job has no explicit employer binding"]);
    return eligible(job);
  });
}

export function revalidatePeople(people: Person[], companies: Company[], now: Date): EligibilityDecision<Person>[] {
  const companyIds = new Set(companies.filter((company) => company.status === "active").map((company) => company.company_id));
  return people.map((person) => {
    if (!person.current_company_id || !companyIds.has(person.current_company_id)) return decision(person, "entity_mismatch", ["person is not bound to an active target company"]);
    if (person.employment_status !== "verified_current") return decision(person, person.employment_status === "stale" ? "stale" : "unknown", [`employment_status=${person.employment_status}`]);
    const verifiedAt = person.employment_verified_at ? Date.parse(person.employment_verified_at) : Number.NaN;
    if (!Number.isFinite(verifiedAt)) return decision(person, "unknown", ["employment_verified_at is missing or unparsable"]);
    if (verifiedAt > now.getTime() || (now.getTime() - verifiedAt) / 86400000 > 90) return decision(person, "stale", ["employment verification is older than 90 days"]);
    if (!person.source_urls?.length) return decision(person, "unknown", ["person has no source URL"]);
    return eligible(person);
  });
}

export function revalidateContacts(contacts: ContactEntry[], companies: Company[], eligiblePeople: Person[]): EligibilityDecision<ContactEntry>[] {
  const companyMap = new Map(companies.map((company) => [company.company_id, company]));
  const eligiblePersonIds = new Set(eligiblePeople.map((person) => person.person_id));
  return contacts.map((contact) => {
    const company = companyMap.get(contact.company_id);
    if (!company || company.status !== "active") return decision(contact, "invalid_relation", ["contact company is not active"]);
    if (!isContactGateEligible(contact)) return decision(contact, "unknown", ["contact is not public and professional"]);
    if (contact.kind === "linkedin_profile" && (!contact.person_id || !eligiblePersonIds.has(contact.person_id))) return decision(contact, "employer_mismatch", ["LinkedIn contact requires an eligible current Person"]);
    if (OFFICIAL_CONTACT_KINDS.has(contact.kind) && !isOfficialCompanyDomain(contact.source_url, company)) return decision(contact, "invalid_relation", ["official contact source is not the company domain"]);
    if (!contact.source_url) return decision(contact, "unknown", ["contact has no source URL"]);
    return eligible(contact);
  });
}

export function buildEligibilityCollections(input: { signals: CompanySignal[]; jobs: Job[]; people: Person[]; contacts: ContactEntry[]; companies: Company[]; evidences: Array<RawEvidence | EvidenceRecord>; now: Date }): EligibilityCollections {
  const signalDecisions = revalidateSignals(input.signals, input.companies, input.evidences, input.now);
  const jobDecisions = revalidateJobs(input.jobs, input.companies, input.now);
  const personDecisions = revalidatePeople(input.people, input.companies, input.now);
  const contactDecisions = revalidateContacts(input.contacts, input.companies, personDecisions.filter((item) => item.eligible).map((item) => item.item));
  const all = [...signalDecisions, ...jobDecisions, ...personDecisions, ...contactDecisions];
  const ineligibleByReason = emptyReasonCounts();
  for (const item of all) if (!item.eligible && item.status !== "eligible") ineligibleByReason[item.status] += 1;
  return {
    allSignals: input.signals,
    eligibleSignals: signalDecisions.filter((item) => item.eligible).map((item) => item.item),
    allJobs: input.jobs,
    eligibleJobs: jobDecisions.filter((item) => item.eligible).map((item) => item.item),
    allPeople: input.people,
    eligiblePeople: personDecisions.filter((item) => item.eligible).map((item) => item.item),
    allContacts: input.contacts,
    eligibleContacts: contactDecisions.filter((item) => item.eligible).map((item) => item.item),
    signalDecisions, jobDecisions, personDecisions, contactDecisions, ineligibleByReason,
  };
}

function eligible<T>(item: T): EligibilityDecision<T> { return { item, eligible: true, status: "eligible", reasons: [] }; }
function decision<T>(item: T, status: EligibilityStatus, reasons: string[]): EligibilityDecision<T> { return { item, eligible: false, status, reasons }; }
function emptyReasonCounts(): EligibilityReasonCounts { return { invalid_relation: 0, stale: 0, entity_mismatch: 0, region_mismatch: 0, employer_mismatch: 0, generic_reference: 0, insufficient_date: 0, unknown: 0 }; }
function statusForTrigger(status: string): EligibilityStatus { if (status === "stale") return "stale"; if (status === "entity_mismatch") return "entity_mismatch"; if (status === "region_mismatch") return "region_mismatch"; if (status === "generic_page" || status === "evergreen_reference") return "generic_reference"; if (status === "insufficient_event_evidence") return "insufficient_date"; return "invalid_relation"; }
function normalized(value: string): string { return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ""); }
function explicitEmployerMatch(title: string, company: Company): boolean { return [company.canonical_name, company.name_en, company.name_cn, ...company.aliases].filter(Boolean).some((name) => normalized(title).includes(normalized(name as string)));
}
function hasConflictingEmployer(title: string, company: Company): boolean {
  const text = title.toLowerCase();
  const target = company.canonical_name.toLowerCase();
  // BOCHK is the public operating-brand abbreviation for Bank of China
  // (Hong Kong) Limited. Official BOCHK career pages commonly use the legal
  // name in their titles, so this pairing must not be treated as a different
  // employer during revalidation.
  if (target.includes("bochk") && text.includes("bank of china (hong kong)")) return false;
  const conflicts = ["hk express", "bank of china (hong kong)", "bochk", "protiviti india", "india", "naukri", "powerchina"];
  return conflicts.some((value) => text.includes(value) && !target.includes(value));
}
function isKnownThirdPartyJobHost(url: string): boolean { try { return /(?:efinancialcareers|ctgoodjobs|naukri|michaelpage|indeed|jobsdb|linkedin)\./i.test(new URL(url).hostname); } catch { return true; } }
