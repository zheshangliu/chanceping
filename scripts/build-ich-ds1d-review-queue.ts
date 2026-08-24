import fs from "node:fs";
import path from "node:path";

interface Sample { candidate_id: string; source_id: string; source_url: string; discovery_url: string; title: string; organizer: string | null; deadline_text: string | null; geography: string | null; category_hint: string | null; raw_snapshot_hash: string; review_state: "candidate_only"; field_provenance: Record<string, { confirmed: boolean; evidence_excerpt: string | null }> }
interface SampleFile { runs: Array<{ samples: Sample[] }> }
interface AuditItem { candidate_id: string; source_level: string; source_role: string; source_is_detail_page: boolean; status_hint: string; flags: string[]; admission: string; formal_publish_blocked: true }
interface AuditFile { items: AuditItem[] }

interface ReviewQueueItem {
  review_id: string;
  candidate_id: string;
  source_id: string;
  title: string;
  source_url: string;
  source_level: string;
  source_role: string;
  status_hint: string;
  machine_precheck: {
    action_signal: "possible_action" | "result_or_closed" | "unknown";
    relevance_signal: "possible_ich_context" | "unknown";
    official_detail_page: boolean;
    deadline_present: boolean;
    direct_application_signal: "unknown";
  };
  review_fields: {
    relevant_to_ich: null;
    actionable_for_target_users: null;
    organizer_confirmed: null;
    geography_confirmed: null;
    deadline_confirmed: null;
    application_method_confirmed: null;
    eligibility_confirmed: null;
    decision: null;
  };
  review_state: "pending_manual_review";
  formal_publish_blocked: true;
  evidence_requirements: string[];
}

interface ReviewQueueFile {
  schema_version: "ich-ds1d-review-queue.v1";
  generated_at: string;
  readonly: true;
  production_store_write: false;
  total: number;
  pending_manual_review: number;
  approved: 0;
  items: ReviewQueueItem[];
}

const samplePath = path.resolve("docs/ich/DS1-B-候选样本运行记录_V1.0.json");
const auditPath = path.resolve("docs/ich/DS1-C-候选审计记录_V1.0.json");
const outputPath = path.resolve("docs/ich/DS1-D-人工审核队列_V1.0.json");
const samples = (JSON.parse(fs.readFileSync(samplePath, "utf8")) as SampleFile).runs.flatMap((run) => run.samples);
const auditById = new Map((JSON.parse(fs.readFileSync(auditPath, "utf8")) as AuditFile).items.map((item) => [item.candidate_id, item]));

function actionSignal(title: string): ReviewQueueItem["machine_precheck"]["action_signal"] {
  if (/结果公示|中选结果|中标公告|获奖名单|结果公告/u.test(title)) return "result_or_closed";
  if (/采购|招标|征选|征集|比选|遴选|邀标|揭榜|报名/u.test(title)) return "possible_action";
  return "unknown";
}
function relevanceSignal(title: string): ReviewQueueItem["machine_precheck"]["relevance_signal"] {
  return /非遗|传统工艺|工艺美术|文创|文旅|博物|文化|手工|民俗|展陈|展览|消费券|揭榜/u.test(title) ? "possible_ich_context" : "unknown";
}

const items: ReviewQueueItem[] = samples.map((sample) => {
  const audit = auditById.get(sample.candidate_id);
  const precheck = { action_signal: actionSignal(sample.title), relevance_signal: relevanceSignal(sample.title), official_detail_page: audit?.source_is_detail_page ?? false, deadline_present: Boolean(sample.deadline_text), direct_application_signal: "unknown" as const };
  const requirements = ["确认详情页是否直接面向非遗手艺人、工作室、品牌或文创团队", "确认主办方、地区、截止日期、申请方式和资格字段", "确认机会仍处于可行动状态；结果公示不得作为当前机会", "保留详情页原文证据，不从标题或来源级提示补猜字段"];
  return {
    review_id: `review-${sample.candidate_id}`,
    candidate_id: sample.candidate_id,
    source_id: sample.source_id,
    title: sample.title,
    source_url: sample.source_url,
    source_level: audit?.source_level ?? "unknown",
    source_role: audit?.source_role ?? "unknown",
    status_hint: audit?.status_hint ?? "pending_confirmation",
    machine_precheck: precheck,
    review_fields: { relevant_to_ich: null, actionable_for_target_users: null, organizer_confirmed: null, geography_confirmed: null, deadline_confirmed: null, application_method_confirmed: null, eligibility_confirmed: null, decision: null },
    review_state: "pending_manual_review",
    formal_publish_blocked: true,
    evidence_requirements: requirements,
  };
});

const queue: ReviewQueueFile = { schema_version: "ich-ds1d-review-queue.v1", generated_at: new Date().toISOString(), readonly: true, production_store_write: false, total: items.length, pending_manual_review: items.length, approved: 0, items };
fs.writeFileSync(outputPath, `${JSON.stringify(queue, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(process.cwd(), outputPath), total: queue.total, pending_manual_review: queue.pending_manual_review, approved: queue.approved, production_store_write: queue.production_store_write }, null, 2));
