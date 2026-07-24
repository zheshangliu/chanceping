import { canonicalizeOfficialUrl, canUseAsOfficialUrl, contentFingerprint, exactDuplicateReason, isEvidenceFresh, isFixedDeadlineCurrent } from "../src/business/data-quality";
import { loadSourceRegistry, type CandidateRecord, type EvidenceRecord } from "../src/business/data-pipeline";

let failures = 0;
function check(name: string, condition: boolean): void { console.log(`${condition ? "PASS" : "FAIL"} ${name}`); if (!condition) failures += 1; }
const now = new Date("2026-07-24T12:00:00+08:00");
const candidate: CandidateRecord = { candidateId: "cand-1", sourceId: "src_gz_science", discoveryUrl: "https://kjj.gz.gov.cn/a", canonicalUrl: "https://kjj.gz.gov.cn/a?utm_source=x", sourceRecordId: "1", rawTitle: "测试", state: "NORMALIZED", createdAt: now.toISOString(), updatedAt: now.toISOString() };
const duplicate: CandidateRecord = { ...candidate, candidateId: "cand-2", sourceRecordId: "2", canonicalUrl: "https://kjj.gz.gov.cn/a" };
const evidence: EvidenceRecord = { candidateId: candidate.candidateId, sourceId: candidate.sourceId, discoveryUrl: candidate.discoveryUrl, fetchedAt: now.toISOString(), lastVerifiedAt: "2026-07-20T12:00:00+08:00", fieldEvidence: {} };
const source = loadSourceRegistry().sources.find((item) => item.sourceId === candidate.sourceId)!;
check("canonical URL removes tracking parameters", canonicalizeOfficialUrl(candidate.canonicalUrl!) === "https://kjj.gz.gov.cn/a");
check("fingerprint normalizes whitespace", contentFingerprint("a  b") === contentFingerprint("a b"));
check("exact canonical URL duplicates are detected", exactDuplicateReason(candidate, duplicate) === "canonical_url");
check("official fact source accepts its direct HTTPS domain", canUseAsOfficialUrl(source, "https://kjj.gz.gov.cn/xxgk/detail"));
check("P2 discovery source cannot become official URL", !canUseAsOfficialUrl(loadSourceRegistry().sources.find((item) => item.sourceId === "src_miit")!, "https://www.miit.gov.cn/zwgk/"));
check("fixed future deadline is current", isFixedDeadlineCurrent("2026-07-24T23:59:59+08:00", now));
check("fixed past deadline is not current", !isFixedDeadlineCurrent("2026-07-23T23:59:59+08:00", now));
check("recent evidence passes freshness", isEvidenceFresh(evidence, 7, now));
check("old evidence fails freshness", !isEvidenceFresh({ ...evidence, lastVerifiedAt: "2026-07-01T12:00:00+08:00" }, 7, now));
if (failures > 0) process.exitCode = 1;
