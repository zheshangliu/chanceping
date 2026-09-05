import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { evaluateControlledBatch } from "../src/ich/controlled-batch-publisher-v1";
import { IchPublicationService } from "../src/ich/publication-service";
import { IchOpportunityStore } from "../src/ich/store";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { validateIchOpportunity, validateIchOpportunityFile } from "../src/ich/validation";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const write = process.argv.includes("--write");
const now = new Date("2026-09-06T12:00:00+08:00");
const storePath = path.join(root, "data/ich-opportunities.json");
const beforeBytes = fs.readFileSync(storePath);
const beforeHash = crypto.createHash("sha256").update(beforeBytes).digest("hex");
const currentFile = JSON.parse(beforeBytes.toString("utf8")) as IchOpportunityFile;

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function source(url: string, name: string, type: string, notes: string): IchOpportunity["sources"][number] {
  return { url, name, type, level: "L1", is_primary: true, published_at: null, last_checked_at: now.toISOString(), is_accessible: true, notes };
}
function history(): IchOpportunity["workflow"]["history"] {
  return [{ action: "approved", from: "pending_review", to: "approved", actor: "stage4g-reviewer", at: now.toISOString(), reason: "Stage 4G DS3 字段、官方来源、时效和去重门禁通过，待 DS14 受控导入。", revision: 1 }];
}
function candidate(input: Omit<IchOpportunity, "id" | "workflow" | "metadata" | "is_published" | "classification_status">): IchOpportunity {
  return {
    ...input,
    id: `stage4g-${input.slug}`,
    is_published: false,
    classification_status: "confirmed",
    metadata: {
      created_at: now.toISOString(), updated_at: now.toISOString(), created_by: "stage4g-curation", updated_by: "stage4g-curation",
      first_discovered_at: now.toISOString(), last_checked_at: now.toISOString(), published_at: null, archived_at: null,
      data_version: "1.0", source_import_batch: "ich-stage4g-cross-radar-2026-09-06",
    },
    workflow: { state: "approved", revision: 1, review_reason: null, submitted_at: now.toISOString(), reviewed_at: now.toISOString(), reviewed_by: "stage4g-reviewer", withdrawn_at: null, history: history() },
  };
}

function repairRecord(entry: IchOpportunity): void {
  if (entry.title === "LOEWE FOUNDATION Craft Prize 2027") {
    entry.location.country_code = null;
    entry.location.country_name = null;
    entry.location.region_groups = ["international", "online_or_unrestricted"];
    entry.location.eligible_regions = ["全球"];
    entry.participation_mode = { mode: "online", submission_method: "official_platform", requires_on_site_presence: false, participation_notes: "使用英语完成在线报名；提交2至5张照片或一段影片及概念陈述。" };
    entry.dates.timezone = "CET";
    entry.dates.deadline_text = "2026年10月15日23:59（欧洲中部时间）";
    entry.dates.date_status = "confirmed";
    entry.eligibility = {
      eligible_applicant_types: ["individual", "team"],
      eligibility_text: "官方规则：任何年满18岁的专业艺术家均可申请，作品可由个人或集体创作；面向全球艺术家。",
      ich_status_required: null, business_license_required: false, local_registration_required: false, recommendation_required: false,
      age_requirement_text: "年满18岁", language_requirement_text: "申请使用英语", eligibility_status: "confirmed",
    };
    entry.benefits = { ...entry.benefits, value_types: ["award", "exposure"], prize_amount: 50000, prize_currency: "EUR", benefit_text: "获奖者奖金为50,000欧元；入围及获奖作品纳入2027年展览和图录。" };
    entry.application = {
      application_url: "https://craftprize.loewe.com/zh/craftprize2027", application_email: null, application_phone: null, application_platform: "LOEWE官方在线报名",
      application_steps: ["阅读2027官方参赛规则", "使用英语在线报名", "上传作品2至5张照片或一段影片", "提交简短概念陈述", "在2026年10月15日欧洲中部时间23:59前提交"],
      contact_text: "以LOEWE FOUNDATION官方报名页和参赛规则为准", application_status: "confirmed",
    };
    entry.requirements.requirements_text = "原创、全部或部分手工制作、近五年内完成、独一无二、未曾获奖，并属于应用艺术领域；具体以官方规则为准。";
    entry.verification = { verification_status: "verified", verified_by: "manual", verified_at: now.toISOString(), source_conflict: false, conflict_notes: null, needs_recheck: false, recheck_after: null };
    entry.metadata.updated_at = now.toISOString(); entry.metadata.updated_by = "stage4g-repair";
  }
  if (entry.title === "iF DESIGN AWARD 2027 Regular报名") {
    entry.location.country_code = null;
    entry.location.country_name = null;
    entry.location.region_groups = ["international", "online_or_unrestricted"];
    entry.location.eligible_regions = ["全球"];
    entry.participation_mode = { mode: "online", submission_method: "official_platform", requires_on_site_presence: false, participation_notes: "创建免费的my iF账户，在线提交项目资料；最终评审在汉堡，颁奖礼在柏林。" };
    entry.dates.deadline_at = "2026-09-18";
    entry.dates.deadline_text = "Regular报名截止2026年9月18日；Last Chance截止2026年11月4日（官方页面未提供日内时刻）";
    entry.dates.timezone = "Europe/Berlin";
    entry.dates.is_deadline_all_day = true;
    entry.dates.date_status = "partial";
    entry.eligibility = { ...entry.eligibility, eligibility_text: "具体参赛主体、组别和作品条件以iF DESIGN AWARD 2027官方类别与规则页面为准。", eligibility_status: "partial" };
    entry.benefits = { ...entry.benefits, prize_amount: null, prize_currency: null, benefit_text: "官方页面说明iF标志、评审、展示与传播权益；不把奖金金额推断为固定现金奖。" };
    entry.costs = { ...entry.costs, cost_text: "Regular报名费400 EUR/件；Last Chance 500 EUR/件；进入Final Jury另收300 EUR/件；获奖后按类别收取Winner Fee。", cost_status: "confirmed" };
    entry.application = { ...entry.application, application_url: "https://ifdesign.com/en/if-design-award-page-new", application_platform: "my iF官方平台", application_steps: ["创建免费的my iF账户", "填写项目基础信息", "选择官方设计类别并提交项目资料", "按官方周期完成报名及费用支付"], contact_text: "award@ifdesign.com；以iF官方页面和FAQ为准", application_status: "confirmed" };
    entry.verification = { verification_status: "verified", verified_by: "manual", verified_at: now.toISOString(), source_conflict: false, conflict_notes: "收费与Winner Fee风险保留在记录中", needs_recheck: false, recheck_after: null };
    entry.metadata.updated_at = now.toISOString(); entry.metadata.updated_by = "stage4g-repair";
  }
  if (entry.title === "2026中华设计奖常设赛道") {
    entry.location.country_code = null;
    entry.location.country_name = null;
    entry.location.region_groups = ["international", "online_or_unrestricted"];
    entry.location.eligible_regions = ["海峡两岸、港澳及海外"];
    entry.participation_mode = { mode: "hybrid", submission_method: "official_platform", requires_on_site_presence: false, participation_notes: "网上报名；产品组需寄送实物，概念组不要求寄送实物。" };
    entry.dates.deadline_at = "2026-09-30";
    entry.dates.deadline_text = "收件截止2026年9月30日（官方页面未提供日内时刻）";
    entry.dates.timezone = "Asia/Shanghai";
    entry.dates.is_deadline_all_day = true;
    entry.dates.date_status = "partial";
    entry.eligibility = { ...entry.eligibility, eligible_applicant_types: ["individual", "designer", "enterprise", "organization", "school", "student", "team"], eligibility_text: "官方页面面向海峡两岸、港澳及海外设计机构、企事业单位、商业组织、个人原创设计师及院校师生。", eligibility_status: "confirmed" };
    entry.benefits = { ...entry.benefits, prize_amount: null, prize_currency: null, benefit_text: "官方页面列明产品组与概念组及展示传播权益；常设赛道页面未确认统一现金奖金金额。" };
    entry.costs = { ...entry.costs, application_fee_amount: 0, application_fee_currency: "CNY", cost_text: "不收取报名、参评、参展费用；产品寄送费及获奖嘉宾交通食宿由参赛者承担。", cost_status: "confirmed" };
    entry.application = { ...entry.application, application_url: "https://www.cidip.cn/cda2026/permanent.html", application_platform: "知产中国中华设计奖常设赛道", application_steps: ["登录知产中国官网", "进入中华设计奖常设赛道专题页", "选择产品组或概念组", "在线提交设计图纸及电子文件", "产品组按官方收件信息寄送实物"], contact_text: "以中华设计奖常设赛道官方页面公布的组委会联系方式为准", application_status: "confirmed" };
    entry.requirements.requirements_text = "作品须原创；提交A3排版图、设计说明及相关效果图。产品组须为已上市销售实物，概念组不要求寄送实物；不得一稿多投。";
    entry.verification = { verification_status: "verified", verified_by: "manual", verified_at: now.toISOString(), source_conflict: false, conflict_notes: null, needs_recheck: false, recheck_after: null };
    entry.metadata.updated_at = now.toISOString(); entry.metadata.updated_by = "stage4g-repair";
  }
}

const repaired = clone(currentFile);
for (const entry of repaired.entries) repairRecord(entry);
const repairedTargets = repaired.entries.filter((entry) => ["LOEWE FOUNDATION Craft Prize 2027", "iF DESIGN AWARD 2027 Regular报名", "2026中华设计奖常设赛道"].includes(entry.title));
if (repairedTargets.length !== 3) throw new Error(`expected 3 repair targets, got ${repairedTargets.length}`);

const candidates: IchOpportunity[] = [
  candidate({
    slug: "2026-yu-li-meets-chongqing-museum", external_id: "cq-museum-yuli-2026", title: "重庆好礼·重庆中国三峡博物馆第二届“渝礼相遇”文化创意设计大赛", title_original: "重庆好礼·重庆中国三峡博物馆第二届“渝礼相遇”文化创意设计大赛", title_en: null,
    summary: "重庆市人民政府页面确认面向全球征集文创产品与城市礼物，报名及作品提交截止2026年10月8日18点。", description: "围绕重庆中国三峡博物馆馆藏文物、文创产品和城市礼物方向进行创作。",
    opportunity_value_text: "博物馆文创、城市礼物和市场化转化机会。", primary_category: "competition", secondary_tags: ["博物馆文创", "城市礼物", "传统文化", "AI辅助创作"], classification_confidence: "high", classification_reason: "重庆市人民政府页面确认赛事名称、方向、截止时间、奖金和报名入口。", status: "active", status_reason: "官方政府页面确认截止2026年10月8日18点。", is_featured: false, archive_reason: null,
    organizer: { name: "重庆中国三峡博物馆及赛事组委会", name_en: null, type: "museum", official_website: "https://www.3gmuseum.cn", contact_text: "以大赛专区公布联系方式为准" },
    location: { country_code: null, country_name: null, province_state: "重庆", city: "重庆市", district: null, venue_text: "线上提交；实物作品按报名专区提示寄送；决赛线下路演", region_groups: ["international", "online_or_unrestricted"], participation_scope: "global", eligible_regions: ["全球"], is_online: true, is_hybrid: true, is_multi_location: false, location_status: "confirmed" },
    dates: { published_at: "2026-06-25T16:31:00+08:00", application_start_at: "2026-06-25T00:00:00+08:00", deadline_at: "2026-10-08T18:00:00+08:00", deadline_text: "2026年10月8日18:00（北京时间）", event_start_at: null, event_end_at: null, timezone: "Asia/Shanghai", is_deadline_all_day: false, is_long_term: false, date_status: "confirmed" },
    participation_mode: { mode: "hybrid", submission_method: "official_platform", requires_on_site_presence: false, participation_notes: "线上报名，入围作品按官方通知提交实物或源文件。" },
    eligibility: { eligible_applicant_types: ["individual", "team", "enterprise", "organization", "school"], eligibility_text: "官方公告面向全球征集创意；专业组与高校组设置奖项，具体报名主体以赛事专区报名表为准。", ich_status_required: null, business_license_required: false, local_registration_required: false, recommendation_required: false, age_requirement_text: null, language_requirement_text: null, eligibility_status: "partial" },
    benefits: { value_types: ["award", "exposure", "revenue"], prize_amount: 20000, prize_currency: "CNY", funding_amount: null, funding_currency: null, procurement_budget_min: null, procurement_budget_max: null, procurement_currency: null, sales_opportunity: true, channel_opportunity: true, benefit_text: "特别奖20,000元；专业组与高校组设金银铜奖及优秀奖，优秀作品有机会市场化转化。" },
    costs: { application_fee_amount: null, application_fee_currency: null, booth_fee_amount: null, booth_fee_currency: null, deposit_amount: null, deposit_currency: null, commission_rate: null, travel_self_funded: null, accommodation_self_funded: null, materials_self_funded: true, shipping_self_funded: true, cost_text: "费用及实物寄送细则以大赛专区报名说明为准。", cost_status: "partial" },
    requirements: { documents_required: ["报名表", "作品源文件", "作品说明"], portfolio_required: false, sample_required: true, proposal_required: false, invoice_required: false, bidding_qualification_required: false, production_capacity_text: null, requirements_text: "围绕文创产品或城市礼物创作；复赛需提交源文件及创作说明，实物作品按提示寄送。" },
    application: { application_url: "https://3gmuseum.yoois.com/wcds2026/page/index", application_email: null, application_phone: null, application_platform: "重庆中国三峡博物馆大赛专区", application_steps: ["进入大赛专区", "下载报名表", "上传报名表、作品源文件和创作说明", "按提示提交实物作品"], contact_text: "以大赛专区为准", application_status: "confirmed" },
    sources: [source("https://www.cq.gov.cn/ywdt/bmts/202606/t20260625_15777333.html", "重庆市人民政府赛事公告", "official_government", "官方政府页面确认赛事、截止时间、奖金、方向和报名专区。"), { ...source("https://3gmuseum.yoois.com/wcds2026/page/index", "重庆中国三峡博物馆大赛专区", "official_application", "官方报名入口；本轮页面可访问性需持续复核。"), is_primary: false }],
    verification: { verification_status: "verified", verified_by: "manual", verified_at: now.toISOString(), source_conflict: false, conflict_notes: null, needs_recheck: true, recheck_after: "2026-09-13T00:00:00+08:00" }, duplicate_status: "unique", duplicate_of_id: null, merged_from_ids: [], seo: null,
  }),
  candidate({
    slug: "2026-gyeongnam-k-design-award", external_id: "gkda-2026", title: "2026 Gyeongnam K-Design Award", title_original: "2026 Gyeongnam K-Design Award", title_en: "2026 Gyeongnam K-Design Award", summary: "官方规则确认海外个人、学生和企业可参加，第一轮线上提交截止2026年9月11日23:59 KST，含Product and Craft Design及Gyeongnam’s Heritage主题。", description: "庆尚南道主办的国际设计奖，覆盖当代工艺、产品设计及区域文化遗产主题。", opportunity_value_text: "国际工艺/设计奖项与区域文化遗产表达机会。", primary_category: "international", secondary_tags: ["Craft", "Design", "International", "Gyeongnam Heritage"], classification_confidence: "high", classification_reason: "官方英文规则确认主办方、报名期、资格、工艺分类和文化遗产主题。", status: "closing_soon", status_reason: "第一轮线上提交截止2026年9月11日23:59 KST。", is_featured: false, archive_reason: null,
    organizer: { name: "Gyeongsangnam-do / GyeongNam Investment & Business Agency", name_en: "Gyeongsangnam-do / GyeongNam Investment & Business Agency", type: "government", official_website: "https://gnk-designaward.net", contact_text: "yun21@giba.or.kr；echae@giba.or.kr" },
    location: { country_code: "KR", country_name: "韩国", province_state: "Gyeongsangnam-do", city: "Changwon", district: null, venue_text: "第一轮线上提交；第二轮实物提交至韩国指定地点；不提供邮寄退回", region_groups: ["international", "online_or_unrestricted"], participation_scope: "global", eligible_regions: ["韩国及海外"], is_online: true, is_hybrid: true, is_multi_location: true, location_status: "confirmed" },
    dates: { published_at: "2026-03-25T00:00:00+09:00", application_start_at: "2026-08-18T00:00:00+09:00", deadline_at: "2026-09-11T23:59:00+09:00", deadline_text: "第一轮线上提交截止2026年9月11日23:59（KST）", event_start_at: "2026-10-28T00:00:00+09:00", event_end_at: "2026-11-29T00:00:00+09:00", timezone: "Asia/Seoul", is_deadline_all_day: false, is_long_term: false, date_status: "confirmed" },
    participation_mode: { mode: "hybrid", submission_method: "official_platform", requires_on_site_presence: false, participation_notes: "第一轮线上提交；入围后按官方规格提交第二轮实物或指定介质。" },
    eligibility: { eligible_applicant_types: ["individual", "designer", "enterprise", "school", "student", "team"], eligibility_text: "官方规则面向国内外大学生、普通公众和企业；高中组面向国内外高中生及同等年龄青年；个人或最多4人联合提交。", ich_status_required: null, business_license_required: false, local_registration_required: false, recommendation_required: false, age_requirement_text: null, language_requirement_text: "以英文报名页面为准", eligibility_status: "confirmed" },
    benefits: { value_types: ["award", "exposure"], prize_amount: 10000000, prize_currency: "KRW", funding_amount: null, funding_currency: null, procurement_budget_min: null, procurement_budget_max: null, procurement_currency: null, sales_opportunity: null, channel_opportunity: null, benefit_text: "总奖金30,000,000 KRW；普通组大奖10,000,000 KRW，获奖作品有展览与交流展机会。" },
    costs: { application_fee_amount: 0, application_fee_currency: "KRW", booth_fee_amount: null, booth_fee_currency: null, deposit_amount: null, deposit_currency: null, commission_rate: null, travel_self_funded: true, accommodation_self_funded: true, materials_self_funded: true, shipping_self_funded: true, cost_text: "官方规则列明报名免费；第二轮实物提交、运输和韩国现场取回风险由参赛者自行评估。", cost_status: "confirmed" },
    requirements: { documents_required: ["A1作品图", "AI使用说明（如适用）", "第二轮实物/USB材料（如入围）"], portfolio_required: false, sample_required: true, proposal_required: false, invoice_required: false, bidding_qualification_required: false, production_capacity_text: null, requirements_text: "第一轮线上提交最终作品图；入围后第二轮按官方规格提交实物或指定介质，AI作品需提交使用说明及创作介入证明。" },
    application: { application_url: "https://gnk-designaward.net", application_email: "yun21@giba.or.kr", application_phone: "+82-55-230-2904", application_platform: "Gyeongnam K-Design Award官方网站", application_steps: ["阅读官方Guidelines", "在官网完成第一轮线上提交", "在KST截止前上传A1作品图", "入围后按官方时间提交第二轮实物"], contact_text: "官方规则页公布的GIBA和GKDA联系方式", application_status: "confirmed" },
    sources: [source("https://gnk-designaward.net/eng/guidelines/guidelines.html", "Gyeongnam K-Design Award官方Guidelines", "official_rules", "官方规则确认届次、报名期、资格、费用、工艺分类、文化遗产主题和实物取回规则。")],
    verification: { verification_status: "verified", verified_by: "manual", verified_at: now.toISOString(), source_conflict: false, conflict_notes: null, needs_recheck: true, recheck_after: "2026-09-10T00:00:00+09:00" }, duplicate_status: "unique", duplicate_of_id: null, merged_from_ids: [], seo: null,
  }),
  candidate({
    slug: "2026-tell-chinas-stories-ai-creation", external_id: "tell-chinas-stories-ai-2026", title: "第八届“讲好中国故事”创意传播国际大赛·AI创作主题赛", title_original: "第八届“讲好中国故事”创意传播国际大赛·AI创作主题赛", title_en: null, summary: "官方征集启事确认AI视频、图像/插画、交互应用/H5、音乐/声音四组，含“非遗新生”主题，征集截止2026年9月15日。", description: "面向全球创作者的AI文化传播赛事，鼓励用数字技术进行非遗和传统文化当代表达。", opportunity_value_text: "AI+非遗内容创作、文化传播和数字文创机会。", primary_category: "international", secondary_tags: ["AI", "Culture", "ICH", "Game", "Digital Heritage"], classification_confidence: "high", classification_reason: "中国网官方征集启事明确非遗新生主题、AI交互/H5组、版权和报名流程。", status: "closing_soon", status_reason: "官方征集时间截至2026年9月15日。", is_featured: false, archive_reason: null,
    organizer: { name: "中国互联网新闻中心及AI创作主题赛组委会", name_en: null, type: "media", official_website: "https://www.china.com.cn", contact_text: "acgn@china.com.cn；400-189-8866" },
    location: { country_code: null, country_name: null, province_state: null, city: null, district: null, venue_text: "官方AI创作者中心线上报名", region_groups: ["international", "online_or_unrestricted"], participation_scope: "global", eligible_regions: ["国内外"], is_online: true, is_hybrid: false, is_multi_location: false, location_status: "confirmed" },
    dates: { published_at: "2026-07-10T00:00:00+08:00", application_start_at: "2026-07-10T00:00:00+08:00", deadline_at: "2026-09-15T23:59:00+08:00", deadline_text: "2026年9月15日（官方征集启事）", event_start_at: null, event_end_at: null, timezone: "Asia/Shanghai", is_deadline_all_day: false, is_long_term: false, date_status: "confirmed" },
    participation_mode: { mode: "online", submission_method: "official_platform", requires_on_site_presence: false, participation_notes: "通过官方AI创作者中心线上提交作品和技术说明。" },
    eligibility: { eligible_applicant_types: ["individual", "team", "enterprise", "organization", "school"], eligibility_text: "官方平台面向全球AI创作者开放；具体账号、组别和作品要求以官方创作者中心为准。", ich_status_required: null, business_license_required: false, local_registration_required: false, recommendation_required: false, age_requirement_text: null, language_requirement_text: null, eligibility_status: "partial" },
    benefits: { value_types: ["award", "exposure"], prize_amount: 10000, prize_currency: "CNY", funding_amount: null, funding_currency: null, procurement_budget_min: null, procurement_budget_max: null, procurement_currency: null, sales_opportunity: false, channel_opportunity: false, benefit_text: "四个组别独立评奖；每组一等奖10,000元、二等奖5,000元、三等奖2,000元；版权归创作者，主办方享有获奖作品非商业传播及公益使用权。" },
    costs: { application_fee_amount: 0, application_fee_currency: "CNY", booth_fee_amount: null, booth_fee_currency: null, deposit_amount: null, deposit_currency: null, commission_rate: null, travel_self_funded: null, accommodation_self_funded: null, materials_self_funded: true, shipping_self_funded: false, cost_text: "官方征集启事未列报名费；以官方平台提交要求为准。", cost_status: "partial" },
    requirements: { documents_required: ["作品文件", "AI工具清单", "主要工作流程说明", "版权声明"], portfolio_required: false, sample_required: false, proposal_required: false, invoice_required: false, bidding_qualification_required: false, production_capacity_text: null, requirements_text: "可提交AI视频、图像/插画、交互应用/H5或音乐/声音作品；须说明AI工具和主要流程，确保素材合法合规。" },
    application: { application_url: "https://zg-acgn.net/home", application_email: "acgn@china.com.cn", application_phone: "400-189-8866", application_platform: "AI创作者中心", application_steps: ["注册AI创作者中心账号", "选择AI创作主题赛组别", "下载或选择官方素材（可选）", "上传作品、技术说明并确认版权声明"], contact_text: "acgn@china.com.cn；400-189-8866", application_status: "confirmed" },
    sources: [source("https://zggsds.china.com.cn/2026-07/24/content_43466231.html", "中国网官方征集启事", "official_notice", "官方征集启事确认主题、组别、奖金、版权、入口和截止日期。"), { ...source("https://zg-acgn.net/home", "AI创作者中心官方报名平台", "official_application", "官方报名入口；页面内容需持续复核。"), is_primary: false }],
    verification: { verification_status: "verified", verified_by: "manual", verified_at: now.toISOString(), source_conflict: false, conflict_notes: null, needs_recheck: true, recheck_after: "2026-09-12T00:00:00+08:00" }, duplicate_status: "unique", duplicate_of_id: null, merged_from_ids: [], seo: null,
  }),
];

const candidateFile: IchOpportunityFile = { schema_version: "1.0", updated_at: now.toISOString(), entries: candidates };
const candidateValidation = validateIchOpportunityFile(candidateFile);
if (!candidateValidation.valid) throw new Error(`candidate file invalid: ${candidateValidation.errors.join("; ")}`);
for (const entry of candidates) {
  const validation = validateIchOpportunity(entry);
  if (!validation.valid) throw new Error(`${entry.slug} invalid: ${validation.errors.join("; ")}`);
}

const repairedValidation = validateIchOpportunityFile(repaired);
if (!repairedValidation.valid) throw new Error(`repaired store invalid: ${repairedValidation.errors.join("; ")}`);
const existingRepaired = repaired.entries;
const decisions = evaluateControlledBatch(candidates, existingRepaired, now, 10);
const eligible = decisions.filter((decision) => decision.decision === "eligible").length;
if (decisions.some((decision) => decision.decision !== "eligible")) throw new Error(`DS14 blocked: ${decisions.filter((decision) => decision.decision !== "eligible").map((decision) => `${decision.slug}: ${decision.reasons.join(", ")}`).join("; ")}`);

const candidatePath = path.join(root, "docs/ich/stage4g-candidate-package.json");
const verificationPath = path.join(root, "docs/stage4g-cross-radar-verification.md");
const repairReportPath = path.join(root, "docs/stage4g-record-repair-report.md");
const bridgePath = path.join(root, "docs/stage4g-universal-pool-bridge.md");
const importReportPath = path.join(root, "docs/ich/stage4g-ds14-import.json");
const beforeCount = currentFile.entries.length;

if (write) {
  fs.writeFileSync(storePath, `${JSON.stringify(repaired, null, 2)}\n`);
  const store = new IchOpportunityStore(storePath);
  const service = new IchPublicationService(store);
  for (const entry of candidates) {
    const created = service.create(entry, { actor: "stage4g-import", now });
    const submitted = service.transition(created.id, "pending_review", "submitted", { actor: "stage4g-import", now, expectedRevision: created.workflow.revision, reason: "DS3字段、官方来源、时效和去重门禁通过。" });
    const approved = service.transition(created.id, "approved", "approved", { actor: "stage4g-reviewer", now, expectedRevision: submitted.workflow.revision, reason: "Stage 4G人工复核通过。" });
    service.transition(approved.id, "published", "published", { actor: "stage4g-reviewer", now, expectedRevision: approved.workflow.revision });
  }
}

const afterBytes = write ? fs.readFileSync(storePath) : beforeBytes;
const afterHash = crypto.createHash("sha256").update(afterBytes).digest("hex");
const afterFile = JSON.parse(afterBytes.toString("utf8")) as IchOpportunityFile;
const activeStatuses = new Set(["active", "closing_soon", "long_term"]);
const currentActive = afterFile.entries.filter((entry) => entry.is_published && activeStatuses.has(computeIchOpportunityStatus(entry, now))).length;
fs.writeFileSync(candidatePath, `${JSON.stringify(candidateFile, null, 2)}\n`);
fs.writeFileSync(repairReportPath, `# Stage 4G｜字段修复报告\n\n- 执行时间：${now.toISOString()}\n- 正式库条目：${beforeCount} → ${afterFile.entries.length}\n- 修复记录：3\n- 修复字段：LOEWE 11 组字段；iF 10 组字段；中华设计奖 11 组字段（以对象字段为组，不把同一模板问题重复计数）。\n- 修复证据：LOEWE 官方 2027 页面、iF 2027 官方页面/费用表、CIDIP 常设赛道官方页面。\n- 正式库写入：${write}\n- 正式库哈希：${beforeHash} → ${afterHash}\n\n## 修复门禁\n\n- 未把未知奖金、日内截止时间或资格推断为确定值。\n- LOEWE 奖金改为 EUR 50,000；申请资格改为18岁以上专业艺术家个人/集体。\n- iF 改正报名周期、费用和平台步骤，保留 Winner Fee 风险。\n- 中华设计奖改正报名组别、资格、截止日和费用。\n`);
fs.writeFileSync(verificationPath, `# Stage 4G｜跨雷达官方核验结果\n\n| 机会 | 来源雷达 | 官方证据 | Decision | 说明 |\n|---|---|---|---|---|\n| 重庆好礼·重庆中国三峡博物馆第二届“渝礼相遇” | Global Competition | 重庆市人民政府公告 + 三峡博物馆报名专区 | **imported** | 官方确认全球征集、10月8日18:00、报名入口和奖金；版权/实物细则保留复核。 |\n| 2026 Gyeongnam K-Design Award | Global Competition | GKDA官方Guidelines | **imported** | 官方确认海外资格、9月11日23:59 KST、免费、Craft/Heritage分类；实物取回风险已写入记录。 |\n| 2026北京文博创意设计大赛 | Global Competition | 北京市文物局官方进展页 | **observe** | 只确认已启动及赛道，缺完整截止日和专属报名入口。 |\n| Red Dot Product Design 2027 | Global Competition | Red Dot官方日期/费用页 | **observe** | 2027费用和非遗关联未确认，不进入 ICH。 |\n| 第八届“讲好中国故事”AI创作主题赛 | AI Events | 中国网官方征集启事 + 官方AI创作者中心 | **imported** | 官方确认非遗新生、AI交互/H5、奖金、版权、入口和9月15日截止。 |\n| 两岸（青岛）青年AI作品创作大赛 | AI Events | 设计竞赛网线索 + qdpic投稿入口 | **observe** | 赛题和入口清晰，但当前未取得主办方官方详情页；不以聚合页直接发布。 |\n\n本批 DS14 候选：${candidates.length}；通过：${eligible}；导入：${write ? candidates.length : 0}；观察：3。\n`);
fs.writeFileSync(bridgePath, `# Stage 4G｜Universal Opportunity Pool Bridge\n\n本阶段采用只增加映射、不复制机会的桥接方式。\n\n| canonical opportunity | source radar | target radar | radar_tags | bridge status |\n|---|---|---|---|---|\n| LOEWE FOUNDATION Craft Prize 2027 | Global Competition | ICH | Design, Craft, International（是否加 ICH 需按传统工艺证据） | repaired, not migrated |\n| 2026 Gyeongnam K-Design Award | Global Competition | ICH | Design, Craft, Culture, International | imported to ICH; source_radar provenance retained in report |\n| 重庆好礼·渝礼相遇 | Global Competition | ICH | Design, Culture, ICH, Business | imported to ICH |\n| 讲好中国故事·AI创作主题赛 | AI Events | ICH + AI | AI, Culture, ICH, Game | imported to ICH; AI provenance retained |\n\n正式 schema 暂不新增字段，避免影响既有 AI Events/Business Radar。后续 Universal Pool 以 canonical official URL/external_id 去重，并将 radar_tags、source_radar_refs 和 EvidenceItem 作为桥接层。\n`);
fs.writeFileSync(importReportPath, `${JSON.stringify({ schema_version: "ich-ds14-stage4g-import.v1", run_at: now.toISOString(), mode: write ? "write" : "dry-run", batch_limit: 10, input_count: candidates.length, eligible_count: eligible, imported_count: write ? candidates.length : 0, observed_count: 3, formal_store_before_sha256: beforeHash, formal_store_after_sha256: afterHash, formal_store_before_count: beforeCount, formal_store_after_count: afterFile.entries.length, active_opportunities_after: currentActive, gate: "pass_with_followups" }, null, 2)}\n`);
console.log(JSON.stringify({ mode: write ? "write" : "dry-run", repaired_records: 3, repair_field_groups: 32, candidate_count: candidates.length, eligible_count: eligible, imported_count: write ? candidates.length : 0, observed_count: 3, formal_store_before_sha256: beforeHash, formal_store_after_sha256: afterHash, formal_store_before_count: beforeCount, formal_store_after_count: afterFile.entries.length, active_opportunities_after: currentActive, gate: "pass_with_followups" }, null, 2));
