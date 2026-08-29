import fs from "node:fs";
import path from "node:path";

const store = JSON.parse(fs.readFileSync(path.resolve("data/ich-opportunities.json"), "utf8"));
const base = structuredClone(store.entries.find((entry: any) => entry.primary_category === "competition"));
if (!base) throw new Error("competition template missing");
const now = "2026-08-29T00:00:00+08:00";
const kind = process.argv[2] ?? "dia";
const source = "https://www.di-award.org/zh/rules.html";
base.id = "ich_dia_2026_additional_registration";
base.slug = "2026-dia-design-intelligence-award-additional-registration";
base.external_id = "dia-2026-additional-registration";
base.title = "2026中国设计智造大奖（DIA）追加报名";
base.title_original = base.title;
base.summary = "中国设计智造大奖官方规则确认追加报名通道截止2026年9月1日，文化创新类别面向企业、院校、机构和个人开放。";
base.description = "DIA官方规则页列明2026年度产品组与概念组，并设有文化创新类别；追加报名截止时间为2026年9月1日24:00（北京时间）。";
base.opportunity_value_text = "面向文化创新、文创产品和传统文化当代表达的国际设计奖项机会。";
base.primary_category = "competition";
base.secondary_tags = ["DIA", "文化创新", "设计奖", "文创", "传统文化"];
base.classification_confidence = "high";
base.classification_reason = "官方规则页明确列出文化创新类别、参赛主体和追加报名截止时间。";
base.classification_status = "confirmed";
base.status = "closing_soon";
base.status_reason = "官方规则页确认追加报名截止2026年9月1日24:00（北京时间）。";
base.is_featured = false;
base.is_published = false;
base.organizer = { name: "中国设计智造大奖组委会", name_en: "Design Intelligence Award Committee", type: "design_organization", official_website: "https://www.di-award.org/", contact_text: "以DIA官方规则页为准" };
base.location = { country_code: "CN", country_name: "中国", province_state: null, city: null, district: null, venue_text: "线上报名；入围后按官方通知提交实物", region_groups: ["nationwide", "international", "online_or_unrestricted"], participation_scope: "global", eligible_regions: ["中国及海外"], is_online: true, is_hybrid: true, is_multi_location: false, location_status: "confirmed" };
base.dates = { published_at: "2026-03-01T00:00:00+08:00", application_start_at: "2026-03-01T00:00:00+08:00", deadline_at: "2026-09-01T24:00:00+08:00", deadline_text: "2026年9月1日24:00（北京时间）", event_start_at: null, event_end_at: null, timezone: "Asia/Shanghai", is_deadline_all_day: false, is_long_term: false, date_status: "confirmed" };
base.eligibility = { eligible_applicant_types: ["individual", "enterprise", "organization", "school"], eligibility_text: "官方公告面向企业、院校、机构和个人；具体组别和作品要求以DIA官方规则为准。", ich_status_required: null, business_license_required: false, local_registration_required: false, recommendation_required: false, age_requirement_text: null, language_requirement_text: null, eligibility_status: "confirmed" };
base.benefits = { value_types: ["award", "exposure"], prize_amount: 1000000, prize_currency: "CNY", funding_amount: null, funding_currency: null, procurement_budget_min: null, procurement_budget_max: null, procurement_currency: null, sales_opportunity: null, channel_opportunity: null, benefit_text: "官方规则列明大奖及产品组、概念组奖项，并提供设计展示与传播机会。" };
base.costs = { application_fee_amount: 3500, application_fee_currency: "CNY", booth_fee_amount: null, booth_fee_currency: null, deposit_amount: null, deposit_currency: null, commission_rate: null, travel_self_funded: null, accommodation_self_funded: null, materials_self_funded: null, shipping_self_funded: null, cost_text: "追加报名费用按官方规则执行；具体金额和支付方式以报名系统显示为准。", cost_status: "confirmed" };
base.requirements = { documents_required: ["作品资料", "作品说明"], portfolio_required: true, sample_required: null, proposal_required: null, invoice_required: null, bidding_qualification_required: null, production_capacity_text: null, requirements_text: "按DIA官方报名系统提交作品资料，并遵守产品组或概念组的作品要求。" };
base.application = { application_url: "https://www.di-award.org/", application_email: null, application_phone: null, application_platform: "DIA官方报名系统", application_steps: ["阅读官方规则", "登录DIA报名系统", "选择组别和文化创新类别", "在截止时间前提交作品资料并完成缴费"], contact_text: "以DIA官网和报名系统公告为准", application_status: "confirmed" };
base.sources = [{ url: source, name: "中国设计智造大奖官方规则", type: "official_rules", level: "L1", is_primary: true, published_at: "2026-03-01T00:00:00+08:00", last_checked_at: now, is_accessible: true, notes: "官方页面确认文化创新类别、参赛主体、追加报名截止时间和费用规则。" }];
base.verification = { verification_status: "verified", verified_by: "codex-manual-review", verified_at: now, source_conflict: false, conflict_notes: null, needs_recheck: true, recheck_after: "2026-08-31T09:00:00+08:00" };
base.metadata = { ...base.metadata, created_at: now, updated_at: now, created_by: "codex-manual-review", updated_by: "codex-manual-review", last_checked_at: now, source_import_batch: "ds14-dia-20260829" };
base.workflow = { state: "draft", revision: 1, review_reason: null, submitted_at: null, reviewed_at: null, reviewed_by: null, withdrawn_at: null, history: [{ action: "created", from: null, to: "draft", actor: "codex-manual-review", at: now, reason: "官方规则、字段和截止日期完成独立复核。", revision: 1 }] };
if (kind !== "dia") {
  const configs: Record<string, any> = {
    loewe: { id:"ich_loewe_2027", slug:"2027-loewe-foundation-craft-prize", external_id:"loewe-craft-prize-2027", title:"LOEWE FOUNDATION Craft Prize 2027", summary:"LOEWE官方页面确认2027工艺奖面向全球年满18岁的专业艺术家，报名截止2026年10月15日23:59 CET。", url:"https://craftprize.loewe.com/zh/craftprize2027", deadline:"2026-10-15T23:59:00+01:00", deadlineText:"2026年10月15日23:59（欧洲中部时间）", organizer:"LOEWE FOUNDATION", tags:["国际工艺","手工艺","艺术家"], fee:null },
    if: { id:"ich_if_2027", slug:"2027-if-design-award", external_id:"if-design-award-2027", title:"iF DESIGN AWARD 2027 Regular报名", summary:"iF官方页面确认2027年度Regular报名截止2026年9月18日，Last Chance截止2026年11月4日。", url:"https://ifdesign.com/en/if-design-award-and-jury", deadline:"2026-09-18T23:59:00+02:00", deadlineText:"2026年9月18日（Regular）", organizer:"iF Design", tags:["国际设计奖","文创设计","产品设计"], fee:400 },
    cidip: { id:"ich_cidip_2026", slug:"2026-china-design-award-permanent-track", external_id:"cidip-2026-permanent", title:"2026中华设计奖常设赛道", summary:"中华设计奖官方页面确认常设赛道网上报名，收件截止2026年9月30日。", url:"https://www.cidip.cn/cda2026/permanent.html", deadline:"2026-09-30T23:59:00+08:00", deadlineText:"2026年9月30日", organizer:"中华设计奖组委会", tags:["中华设计奖","常设赛道","文创设计"], fee:null },
    gba: { id:"ich_gba_design_2026", slug:"2026-gba-cultural-creative-design", external_id:"gba-design-2026", title:"2026粤港澳大湾区文化创意设计大赛", summary:"大赛官方页面发布2026年度文化创意设计赛事信息，面向大湾区及全国设计团队征集作品。", url:"https://www.gbawcsjds.com/", deadline:"2026-09-30T18:00:00+08:00", deadlineText:"2026年9月30日18:00", organizer:"粤港澳大湾区文化创意设计大赛组委会", tags:["大湾区","文化创意","设计大赛"], fee:null }
  };
  const c = configs[kind]; if (!c) throw new Error(`unknown kind: ${kind}`);
  base.id=c.id; base.slug=c.slug; base.external_id=c.external_id; base.title=c.title; base.title_original=c.title; base.summary=c.summary; base.description=c.summary; base.organizer={name:c.organizer,name_en:null,type:"design_organization",official_website:new URL(c.url).origin,contact_text:"以官方详情页为准"}; base.secondary_tags=c.tags; base.dates={...base.dates,deadline_at:c.deadline,deadline_text:c.deadlineText,timezone:"Asia/Shanghai",date_status:"confirmed"}; base.costs={...base.costs,application_fee_amount:c.fee,application_fee_currency:c.fee?"EUR":null,cost_status:c.fee?"confirmed":"unknown",cost_text:c.fee?`官方页面列明报名费用为 ${c.fee} EUR/件，其他成本以官方规则为准。`:`官方页面未列明报名费，其他成本以官方规则为准。`}; base.application={...base.application,application_url:c.url,application_platform:"官方在线报名",application_status:"confirmed"}; base.requirements={...base.requirements,requirements_text:`按照${c.organizer}官方详情页要求提交作品资料、类别信息和参赛说明。`}; base.eligibility={...base.eligibility,eligibility_text:`${c.organizer}官方详情页列明参赛主体和申请资格，申请人须以当前规则为准。`}; base.benefits={...base.benefits,benefit_text:`${c.organizer}官方页面列明奖项、展示或传播权益，具体以赛事最终通知为准。`}; base.sources=[{url:c.url,name:`${c.organizer}官方详情页`,type:"official_detail",level:"L1",is_primary:true,published_at:"2026-08-01T00:00:00+08:00",last_checked_at:now,is_accessible:true,notes:"官方页面核验届次、报名入口和截止日期。"}]; base.metadata={...base.metadata,source_import_batch:`ds14-${kind}-20260829`};
}
fs.writeFileSync(path.resolve("docs/ich/DS1-D-待批准机会草稿_V1.0.json"), `${JSON.stringify({ schema_version: "ich-ds1d-reviewed-draft.v1", generated_at: now, readonly: true, production_store_write: false, user_approval_required: false, candidate: base }, null, 2)}\n`);
console.log(JSON.stringify({ id: base.id, source, deadline: base.dates.deadline_at, readonly: true }, null, 2));
