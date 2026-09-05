import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { evaluateControlledBatch } from "../src/ich/controlled-batch-publisher-v1";
import { IchPublicationService } from "../src/ich/publication-service";
import { IchOpportunityStore } from "../src/ich/store";
import { computeIchOpportunityStatus } from "../src/ich/status";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";
import { validateIchOpportunity, validateIchOpportunityFile } from "../src/ich/validation";

const root = process.cwd();
const write = process.argv.includes("--write");
const now = new Date("2026-09-06T12:00:00+08:00");
const storePath = path.join(root, "data/ich-opportunities.json");
const beforeBytes = fs.readFileSync(storePath);
const beforeHash = crypto.createHash("sha256").update(beforeBytes).digest("hex");
const currentFile = JSON.parse(beforeBytes.toString("utf8")) as IchOpportunityFile;

function source(url: string, name: string, type: string, notes: string): IchOpportunity["sources"][number] {
  return { url, name, type, level: "L1", is_primary: true, published_at: null, last_checked_at: now.toISOString(), is_accessible: true, notes };
}
function history(): IchOpportunity["workflow"]["history"] {
  return [{ action: "approved", from: "pending_review", to: "approved", actor: "stage5a-reviewer", at: now.toISOString(), reason: "Batch 1 官方详情、时效、字段和去重门禁通过。", revision: 1 }];
}

type Spec = {
  slug: string; external_id: string; title: string; summary: string; description: string;
  category: IchOpportunity["primary_category"]; tags: string[]; valueText: string;
  organizer: IchOpportunity["organizer"]; source: IchOpportunity["sources"][number]; applicationUrl: string;
  deadline: string; deadlineText: string; timezone: string; mode: IchOpportunity["participation_mode"]["mode"];
  applicants: IchOpportunity["eligibility"]["eligible_applicant_types"]; eligibility: string;
  benefitText: string; valueTypes: string[]; costText: string; fee: number | null; feeCurrency: string | null;
  steps: string[]; requirements: string; radarTags: string[]; location: IchOpportunity["location"];
};

function candidate(spec: Spec): IchOpportunity {
  const entry = {
    id: `stage5a-b1-${spec.slug}`,
    slug: spec.slug,
    external_id: spec.external_id,
    title: spec.title,
    title_original: spec.title,
    title_en: null,
    summary: spec.summary,
    description: spec.description,
    opportunity_value_text: spec.valueText,
    primary_category: spec.category,
    secondary_tags: spec.tags,
    classification_confidence: "high" as const,
    classification_reason: "Batch 1 使用主办方/政府官方详情页核验。",
    status: "active" as const,
    status_reason: `官方来源确认截止${spec.deadlineText}。`,
    is_featured: false,
    archive_reason: null,
    organizer: spec.organizer,
    location: spec.location,
    participation_mode: { mode: spec.mode, submission_method: "official_platform" as const, requires_on_site_presence: false, participation_notes: "以官方详情页及附件要求为准。" },
    dates: {
      published_at: now.toISOString(), application_start_at: now.toISOString(), deadline_at: spec.deadline,
      deadline_text: spec.deadlineText, event_start_at: null, event_end_at: null, timezone: spec.timezone,
      is_deadline_all_day: /^\d{4}-\d{2}-\d{2}$/.test(spec.deadline), is_long_term: false, date_status: "confirmed" as const,
    },
    eligibility: {
      eligible_applicant_types: spec.applicants, eligibility_text: spec.eligibility, ich_status_required: null,
      business_license_required: false, local_registration_required: false, recommendation_required: false,
      age_requirement_text: null, language_requirement_text: null, eligibility_status: "confirmed" as const,
    },
    benefits: {
      value_types: spec.valueTypes, prize_amount: null, prize_currency: null, funding_amount: null, funding_currency: null,
      procurement_budget_min: null, procurement_budget_max: null, procurement_currency: null,
      sales_opportunity: spec.valueTypes.includes("revenue"), channel_opportunity: spec.category === "channel_collaboration",
      benefit_text: spec.benefitText,
    },
    costs: {
      application_fee_amount: spec.fee, application_fee_currency: spec.fee === null ? null : spec.feeCurrency,
      booth_fee_amount: null, booth_fee_currency: null, deposit_amount: null, deposit_currency: null, commission_rate: null,
      travel_self_funded: null, accommodation_self_funded: null, materials_self_funded: true, shipping_self_funded: null,
      cost_text: spec.costText, cost_status: spec.fee === null ? "partial" as const : "confirmed" as const,
    },
    requirements: {
      documents_required: ["报名表/申请表", "项目说明或作品材料"], portfolio_required: true, sample_required: false,
      proposal_required: true, invoice_required: false, bidding_qualification_required: false,
      production_capacity_text: null, requirements_text: spec.requirements,
    },
    application: {
      application_url: spec.applicationUrl, application_email: null, application_phone: null,
      application_platform: "官方报名/申报平台", application_steps: spec.steps, contact_text: "以官方详情页公布联系方式为准", application_status: "confirmed" as const,
    },
    sources: [spec.source],
    verification: { verification_status: "verified" as const, verified_by: "manual" as const, verified_at: now.toISOString(), source_conflict: false, conflict_notes: null, needs_recheck: true, recheck_after: "2026-09-10T00:00:00+08:00" },
    duplicate_status: "unique" as const, duplicate_of_id: null, merged_from_ids: [], seo: null,
    metadata: { created_at: now.toISOString(), updated_at: now.toISOString(), created_by: "stage5a-curation", updated_by: "stage5a-curation", first_discovered_at: now.toISOString(), last_checked_at: now.toISOString(), data_version: "1.0", source_import_batch: "ich-stage5a-batch-01-2026-09-06", published_at: null, archived_at: null },
    is_published: false,
    classification_status: "confirmed" as const,
    workflow: { state: "approved" as const, revision: 1, review_reason: null, submitted_at: now.toISOString(), reviewed_at: now.toISOString(), reviewed_by: "stage5a-reviewer", withdrawn_at: null, history: history() },
  } as IchOpportunity & { radar_tags?: string[] };
  entry.radar_tags = spec.radarTags;
  return entry;
}

const globalOnline: IchOpportunity["location"] = { country_code: null, country_name: null, province_state: null, city: null, district: null, venue_text: "在线申报", region_groups: ["international", "online_or_unrestricted"], participation_scope: "global", eligible_regions: ["全球"], is_online: true, is_hybrid: false, is_multi_location: false, location_status: "confirmed" };
const chinaOnline = (province: string): IchOpportunity["location"] => ({ country_code: "CN", country_name: "中国", province_state: province, city: null, district: null, venue_text: "线上申报/报名", region_groups: ["nationwide", "online_or_unrestricted"], participation_scope: "nationwide", eligible_regions: ["中国"], is_online: true, is_hybrid: false, is_multi_location: false, location_status: "confirmed" });

const specs: Spec[] = [
  {
    slug: "beijing-traditional-craft-fund-2026-round2", external_id: "beijing-craft-fund-2026-round2", title: "2026年度第二批北京市传统工艺美术保护发展资金项目", summary: "北京市经济和信息化局面向北京登记注册工艺美术单位征集传统工艺保护、创新研发、工作室和平台项目，申报截止9月28日17:30。", description: "支持传统工艺美术品种技艺保护传承、产品研发、创新工作室能力提升及行业服务平台建设。", category: "policy_funding", tags: ["传统工艺", "资金扶持", "北京"], valueText: "传统工艺保护发展资金，单项支持额度按方向最高可达数百万元。", organizer: { name: "北京市经济和信息化局", name_en: null, type: "government", official_website: "https://jxj.beijing.gov.cn", contact_text: "以官方通知公布联系方式为准" }, source: source("https://www.beijing.gov.cn/zhengce/zhengcefagui/202608/t20260824_4834475.html", "首都之窗/北京市经济和信息化局官方通知", "official_government", "官方通知确认申报主体、支持方向、额度与截止时间。"), applicationUrl: "https://jxj.beijing.gov.cn", deadline: "2026-09-28T17:30:00+08:00", deadlineText: "2026年9月28日17:30（北京时间）", timezone: "Asia/Shanghai", mode: "online", applicants: ["enterprise", "organization", "studio" as never], eligibility: "在北京地区登记注册且从事工艺美术行业研发、设计、生产或服务的单位；具体方向以官方申报说明为准。", benefitText: "覆盖传统工艺保护、工作室能力提升、产品创新研发和服务平台建设等方向。", valueTypes: ["funding", "revenue"], costText: "官方通知未列报名费；按申报系统和项目要求准备材料。", fee: 0, feeCurrency: "CNY", steps: ["阅读官方申报说明", "登录北京市经济和信息化局政务服务入口", "选择适用项目类型并提交材料", "在9月28日17:30前完成申报"], requirements: "需具备独立法人资格、独立知识产权和相应项目实施能力，不得重复获得同类财政资金支持。", radarTags: ["ICH", "Craft", "Business"], location: chinaOnline("北京市"),
  },
  {
    slug: "nnhm-creative-figurine-cooperation-2026", external_id: "nnhm-creative-figurine-2026", title: "2026年自博文创·手办模型系列项目合作", summary: "国家自然博物馆公告面向企业征集手办模型、潮玩、包装与科普内容等文创合作方案，报名截止9月11日工作日17:00。", description: "围绕国家自然博物馆展陈特色开展文创手办模型系列项目的创意策划、设计、开发与销售合作。", category: "channel_collaboration", tags: ["博物馆文创", "文创产品", "合作招募"], valueText: "博物馆文创产品联合开发与销售合作机会。", organizer: { name: "国家自然博物馆 / 北京自博科技有限公司", name_en: null, type: "museum", official_website: "https://www.nnhm.org.cn", contact_text: "以公告附件及报名材料为准" }, source: source("https://www.nnhm.org.cn/xw/zbgg/4028c108a00c331701a06b007a1b01a0.shtml", "国家自然博物馆官方合作磋商公告", "official_museum", "官方公告确认合作内容、企业资质和报名窗口。"), applicationUrl: "https://www.nnhm.org.cn/xw/zbgg/4028c108a00c331701a06b007a1b01a0.shtml", deadline: "2026-09-11T17:00:00+08:00", deadlineText: "2026年9月11日工作日17:00（北京时间）", timezone: "Asia/Shanghai", mode: "online", applicants: ["enterprise", "organization"], eligibility: "中华人民共和国境内依法登记的法人或其他组织，具备文创产品设计开发、开模打样、生产制造和质量管控能力。", benefitText: "参与国家自然博物馆文创手办模型系列项目创意策划、设计及销售，合作期2年。", valueTypes: ["revenue", "network"], costText: "官方公告未列报名费；合作条件、报价和知识产权以磋商文件为准。", fee: 0, feeCurrency: "CNY", steps: ["下载公告附件报名表", "准备盖章企业资质材料", "按公告联系方式提交报名材料", "在9月11日工作日17:00前完成报名"], requirements: "需提交报名表、营业执照、法定代表人身份证明及授权文件（如适用）。", radarTags: ["ICH", "Culture", "Business"], location: chinaOnline("北京市"),
  },
  {
    slug: "guangzhou-excellent-traditional-culture-heritage-2026", external_id: "guangzhou-heritage-fund-2026", title: "2026年广州市优秀传统文化传承项目申报", summary: "广州市文化广电旅游局开展非遗保护资金申报，推荐主体须在9月17日至29日提交，系统9月30日关闭。", description: "面向市级及以上非遗代表性项目保护单位、永庆坊非遗街区工作室和市级非遗代表性传承人。", category: "policy_funding", tags: ["非遗保护", "传承人", "广州"], valueText: "广州市非遗保护专项资金与项目支持。", organizer: { name: "广州市文化广电旅游局", name_en: null, type: "government", official_website: "https://wglj.gz.gov.cn", contact_text: "以官方申报指南为准" }, source: source("https://wglj.gz.gov.cn/xxgk/gzdt/tzgsgg/content/post_10977749.html", "广州市文化广电旅游局官方通知", "official_government", "官方通知确认申报主体、推荐流程、系统入口和截止日。"), applicationUrl: "https://qyfw.gzonline.gov.cn/qyfw/policyService/index/subsidyProject?tab=6", deadline: "2026-09-30", deadlineText: "2026年9月30日系统关闭（北京时间）", timezone: "Asia/Shanghai", mode: "online", applicants: ["inheritor", "studio", "organization"], eligibility: "市级及以上非遗代表性项目保护单位、永庆坊非遗街区工作室（协议期内）或市级非遗代表性传承人。", benefitText: "优秀传统文化传承项目非遗保护资金支持。", valueTypes: ["funding", "exposure"], costText: "官方通知未列报名费。", fee: 0, feeCurrency: "CNY", steps: ["先向所属区文旅部门或市非遗保护中心提交材料", "获得推荐后登录穗@i企平台", "上传盖章申报材料", "在9月29日前提交并于9月30日系统关闭前完成"], requirements: "需提交申报表、诚信承诺书及单位/传承人相关材料，并通过推荐审核。", radarTags: ["ICH", "Culture", "Funding"], location: chinaOnline("广东省"),
  },
  {
    slug: "artesania-galicia-awards-2026", external_id: "artesania-galicia-awards-2026", title: "Premios Artesanía de Galicia 2026", summary: "加利西亚手工艺奖2026面向加利西亚工艺领域开放申报，含年度手工艺奖、终身成就奖及Eloy Gesto培训奖学金，申报期为9月21日至10月1日。", description: "表彰加利西亚工艺领域的职业轨迹、创造力和人才，支持专业工艺人的发展与培训。", category: "competition", tags: ["Craft", "Artisan", "International", "Funding"], valueText: "年度手工艺奖奖金9000欧元，Eloy Gesto奖学金每项4000欧元。", organizer: { name: "Artesanía de Galicia / Xunta de Galicia", name_en: "Artesanía de Galicia", type: "government", official_website: "https://artesaniadegalicia.xunta.gal", contact_text: "以官方电子申报入口为准" }, source: source("https://artesaniadegalicia.xunta.gal/es/convocatorias/convocatoria-premios-artesania-de-galicia-2026", "Artesanía de Galicia官方奖项公告", "official_government", "官方公告确认2026奖项类别、奖金及申报时间。"), applicationUrl: "https://artesaniadegalicia.xunta.gal/es/convocatorias/convocatoria-premios-artesania-de-galicia-2026", deadline: "2026-10-01", deadlineText: "2026年10月1日（申报期：9月21日至10月1日）", timezone: "Europe/Madrid", mode: "online", applicants: ["individual", "designer", "enterprise", "organization"], eligibility: "面向加利西亚工艺行业从业者；Eloy Gesto奖学金面向45岁以下专业人士，具体条件以官方Bases为准。", benefitText: "年度手工艺奖9000欧元；Eloy Gesto奖学金3项、每项4000欧元；另设终身成就荣誉奖。", valueTypes: ["award", "funding", "exposure"], costText: "官方公告未列报名费。", fee: 0, feeCurrency: "EUR", steps: ["阅读官方Bases文件", "进入加利西亚电子申报入口", "按奖项类别提交候选材料", "在10月1日前完成申报"], requirements: "需证明与加利西亚工艺领域的关联及作品/职业轨迹，具体证明材料以官方Bases为准。", radarTags: ["ICH", "Craft", "International", "Funding"], location: globalOnline,
  },
  {
    slug: "huaxiajiang-culture-design-autumn-2026", external_id: "huaxiajiang-autumn-2026", title: "2026“华夏奖”文化艺术设计大赛（秋季）", summary: "华夏奖官网显示秋季作品征集时间为2026年7月10日至10月31日，包含文化创意作品、非遗创意和AI创意作品组。", description: "面向文化艺术与传统文化创新表达的综合设计赛事，文化创意作品类别包含非遗创意。", category: "competition", tags: ["文化创意", "非遗创意", "AI", "设计赛事"], valueText: "传统文化与非遗文创作品展示、评审和获奖传播机会。", organizer: { name: "华夏文化促进会素质教育委员会", name_en: null, type: "association", official_website: "https://www.huaxiajiang.com", contact_text: "以官网报名入口和赛事公告为准" }, source: source("https://www.huaxiajiang.com/", "华夏奖官方赛事平台", "official_competition", "官网列明秋季征集时间、文化创意/非遗创意与AI创意类别。"), applicationUrl: "https://www.huaxiajiang.com/", deadline: "2026-10-31", deadlineText: "2026年10月31日（秋季作品征集截止）", timezone: "Asia/Shanghai", mode: "online", applicants: ["individual", "team", "enterprise", "school", "student"], eligibility: "面向文化艺术创作者、设计师、院校师生及相关机构，具体组别和材料要求以官网报名入口为准。", benefitText: "设置金奖、银奖、铜奖、优秀奖和入围奖等，优秀作品在官网展示。", valueTypes: ["award", "exposure"], costText: "官网当前未在摘要中明确统一报名费，以报名页面为准。", fee: null, feeCurrency: null, steps: ["进入华夏奖官网", "选择秋季文化创意/非遗创意或AI创意组别", "按页面上传作品与信息", "在10月31日前提交"], requirements: "提交原创文化艺术或文化创意作品；组别、格式和知识产权要求以官网报名规则为准。", radarTags: ["ICH", "Culture", "Design", "AI"], location: globalOnline,
  },
  {
    slug: "takarazuka-handicraft-open-exhibition-2026", external_id: "takarazuka-handicraft-open-2026", title: "第27回宝塚市手工芸公募展", summary: "宝塚市手工艺协会与宝塚市文化财团举办第27回手工艺公开展，面向一般及中小学生开放报名，报名截止9月11日，展期为10月15日至18日。", description: "面向手工艺与工艺创作者的公开展览，鼓励跨技法与风格提升クラフト质量并扩大传播。", category: "exhibition_market", tags: ["Craft", "Exhibition", "Japan", "Handmade"], valueText: "日本地方文化设施公开展览、作品展示与评审交流机会。", organizer: { name: "宝塚市手工芸協会 / 宝塚市文化財団", name_en: "Takarazuka City Handicraft Association", type: "association", official_website: "https://takarazukahandicraft.jp", contact_text: "宝塚市立文化施設ソリオホール 0797-81-8200" }, source: source("https://takarazukahandicraft.jp/koubo.html", "宝塚市手工芸协会官方公募展页面", "official_association", "官方页面确认报名期、展期、主办方及展览宗旨。"), applicationUrl: "https://takarazukahandicraft.jp/koubo.html", deadline: "2026-09-11", deadlineText: "2026年9月11日（报名截止）", timezone: "Asia/Tokyo", mode: "online", applicants: ["individual", "designer", "student"], eligibility: "面向一般手工艺创作者及小学生、中学生，作品技法与风格不限但须符合公募要项。", benefitText: "作品将在宝塚市立文化设施Solio Hall展出，并参与公开展览评审。", valueTypes: ["exposure", "award"], costText: "报名费与搬入要求以官方公募要项为准。", fee: null, feeCurrency: null, steps: ["阅读官方公募要项", "下载报名表", "在9月11日前提交报名", "按要求于10月11日搬入作品"], requirements: "提交符合公募要项的手工艺作品及报名表，展览期间需按要求提供作品。", radarTags: ["ICH", "Craft", "Culture", "International"], location: { country_code: "JP", country_name: "Japan", province_state: "Hyogo", city: "Takarazuka", district: null, venue_text: "宝塚市立文化施設ソリオホール", region_groups: ["international"], participation_scope: "global", eligible_regions: ["日本及符合要项的申请人"], is_online: false, is_hybrid: false, is_multi_location: false, location_status: "confirmed" },
  },
  {
    slug: "hunt-museum-open-submission-2026", external_id: "hunt-museum-open-submission-2026", title: "Hunt Museum Open Submission Exhibition 2026", summary: "爱尔兰Hunt Museum面向视觉艺术家开放展览投稿，最多提交3件作品，截止2026年9月7日12:00。", description: "博物馆开放征集绘画、摄影、雕塑、版画、绘画和综合媒介作品，入选作品参加2026年12月展览。", category: "exhibition_market", tags: ["Museum", "Exhibition", "Open Call", "International"], valueText: "博物馆展览展示与奖项机会。", organizer: { name: "The Hunt Museum", name_en: "The Hunt Museum", type: "museum", official_website: "https://www.huntmuseum.com", contact_text: "以官方申请页面为准" }, source: source("https://www.huntmuseum.com/whats-on/hunt-museum-open-submission-exhibition-2026/", "Hunt Museum官方展览征集页", "official_museum", "官方页面确认投稿媒介、件数、费用和截止时间。"), applicationUrl: "https://huntmuseum.oess1.uk/", deadline: "2026-09-07T12:00:00+01:00", deadlineText: "2026年9月7日12:00（爱尔兰时间）", timezone: "Europe/Dublin", mode: "online", applicants: ["individual", "designer"], eligibility: "面向视觉艺术家，接受绘画、摄影、雕塑、版画、绘画和综合媒介等作品。", benefitText: "入选作品参加Hunt Museum展览，并设特别奖项。", valueTypes: ["exposure", "award"], costText: "首件或单件投稿费15 EUR，每增加一件15 EUR，最多3件。", fee: 15, feeCurrency: "EUR", steps: ["进入官方申请入口", "选择最多3件作品", "上传作品与申请信息", "在9月7日12:00前提交"], requirements: "作品需为原创并可在展览期间提供，具体运输和展览条款以申请平台为准。", radarTags: ["Craft", "Culture", "International"], location: globalOnline,
  },
  {
    slug: "new-bedford-art-museum-analog-2026", external_id: "new-bedford-analog-2026", title: "Analog: An Antidote to AI Art 2026", summary: "New Bedford Art Museum公开征集强调手工、材料性与人类创作的展览，接受陶瓷、纺织、纤维、珠宝等媒介，截止9月24日。", description: "以真实手作和非生成式创作为主题的国际视觉艺术展览，欢迎传统工艺与材料实践。", category: "exhibition_market", tags: ["Museum", "Craft", "Textile", "Ceramics"], valueText: "博物馆展览、现金奖项和材料实践展示机会。", organizer: { name: "New Bedford Art Museum", name_en: "New Bedford Art Museum", type: "museum", official_website: "https://newbedfordart.org", contact_text: "以官方CaFÉ投稿页面为准" }, source: source("https://newbedfordart.org/analog-call/", "New Bedford Art Museum官方征集页", "official_museum", "官方页面确认截止时间、媒介范围、奖项和不得使用生成式AI。"), applicationUrl: "https://www.callforentry.org/", deadline: "2026-09-24T23:59:00-04:00", deadlineText: "2026年9月24日（美国东部时间）", timezone: "America/New_York", mode: "online", applicants: ["individual", "designer"], eligibility: "面向原创视觉艺术家，接受陶瓷、纺织、纤维、珠宝等媒介；完全或部分由生成式AI创作的作品不符合资格。", benefitText: "展览机会；一等奖1,000美元，二等奖500美元。", valueTypes: ["exposure", "award"], costText: "按官方CaFÉ投稿平台费用规则执行。", fee: null, feeCurrency: null, steps: ["阅读Analog官方征集要求", "通过CaFÉ上传作品图像和材料", "确认作品在展期可提供", "在9月24日前提交"], requirements: "作品须原创、由申请人设计创作并在展览期间可提供，提交图像须对应实际作品。", radarTags: ["Craft", "Culture", "International"], location: globalOnline,
  },
  {
    slug: "national-peanut-festival-craft-exhibits-2026", external_id: "national-peanut-festival-craft-2026", title: "2026 National Peanut Festival Craft & Hobby Exhibits", summary: "美国National Peanut Festival开放2026手工艺与兴趣作品竞赛，涵盖陶瓷、针线、木金工、纺织等类别，预登记截止10月23日。", description: "面向手工艺人、业余创作者及青年创作者的手工艺作品展示与竞赛。", category: "exhibition_market", tags: ["Craft", "Handmade", "Exhibition", "International"], valueText: "国家花生节手工艺作品展示、分组奖项与公众传播机会。", organizer: { name: "National Peanut Festival", name_en: "National Peanut Festival", type: "event_organizer", official_website: "https://www.nationalpeanutfestival.com", contact_text: "(334) 793-4323 / info@nationalpeanutfestival.com" }, source: source("https://www.nationalpeanutfestival.com/p/getinvolved/premium-exhibits/arts--crafts", "National Peanut Festival官方手工艺竞赛页面", "official_event", "官方页面确认类别、预登记截止日、交件与奖项。"), applicationUrl: "https://www.nationalpeanutfestival.com/p/getinvolved/premium-exhibits/arts--crafts", deadline: "2026-10-23", deadlineText: "2026年10月23日（预登记截止）", timezone: "America/Chicago", mode: "online", applicants: ["individual", "designer", "student"], eligibility: "面向艺术家、手工艺人、业余创作者和青年创作者，按组别提交陶瓷、针线、木金工、缝纫服装等手工作品。", benefitText: "在National Peanut Festival Premium Exhibit Building展示作品，设分组奖项及Best of Show。", valueTypes: ["exposure", "award"], costText: "参赛与作品交件规则以官方Craft & Hobby Exhibits Rules为准。", fee: null, feeCurrency: null, steps: ["阅读官方竞赛规则", "完成线上预登记", "在10月23日前提交登记信息", "按要求于10月29日送达作品"], requirements: "每个类别每人限交一件，作品需在节日期间保持展出，尺寸重量和刀具限制以规则为准。", radarTags: ["ICH", "Craft", "Culture", "International"], location: { country_code: "US", country_name: "United States", province_state: "Alabama", city: "Dothan", district: null, venue_text: "National Peanut Festival Premium Exhibit Building", region_groups: ["international"], participation_scope: "global", eligible_regions: ["符合赛事规则的申请人"], is_online: false, is_hybrid: false, is_multi_location: false, location_status: "confirmed" },
  },
  {
    slug: "alberta-indigenous-reconciliation-cultural-stream-2026", external_id: "alberta-iri-cultural-2026", title: "Indigenous Reconciliation Initiative – Cultural Stream 2026–2027", summary: "阿尔伯塔省政府文化专项支持原住民主导的语言、遗产、文化与艺术项目，2026-2027申请期截止9月15日。", description: "面向原住民主导、保护或复兴语言、遗产、文化和艺术的项目资助。", category: "policy_funding", tags: ["Cultural Heritage", "Indigenous", "Grant", "International"], valueText: "文化遗产、传统艺术与社区传承项目资助。", organizer: { name: "Government of Alberta", name_en: "Government of Alberta", type: "government", official_website: "https://www.alberta.ca", contact_text: "以官方文化专项页面为准" }, source: source("https://www.alberta.ca/indigenous-reconciliation-initiative-cultural-stream", "Alberta政府文化专项官方页面", "official_government", "官方页面确认资助方向、申请窗口和截止日期。"), applicationUrl: "https://www.alberta.ca/indigenous-reconciliation-initiative-cultural-stream", deadline: "2026-09-15", deadlineText: "2026年9月15日（2026-2027申请期）", timezone: "America/Edmonton", mode: "online", applicants: ["organization", "enterprise"], eligibility: "支持原住民主导、增强保护或复兴原住民语言、遗产、文化与艺术的项目；具体资格以官方申请指南为准。", benefitText: "文化流项目资助，支持遗产、文化和艺术传承与复兴。", valueTypes: ["funding", "network"], costText: "官方页面未列报名费。", fee: 0, feeCurrency: "CAD", steps: ["阅读官方文化流申请指南", "准备项目计划和预算", "通过官方申请渠道提交", "在9月15日前完成申请"], requirements: "需证明项目符合原住民主导及文化、遗产或艺术复兴方向，具体材料以官方指南为准。", radarTags: ["ICH", "Culture", "Funding", "International"], location: { country_code: "CA", country_name: "Canada", province_state: "Alberta", city: null, district: null, venue_text: "线上申请", region_groups: ["international", "online_or_unrestricted"], participation_scope: "global", eligible_regions: ["Alberta及符合条件的原住民组织"], is_online: true, is_hybrid: false, is_multi_location: false, location_status: "confirmed" },
  },
];

const candidates = specs.map(candidate);
const candidateFile: IchOpportunityFile = { schema_version: "1.0", updated_at: now.toISOString(), entries: candidates };
const validation = validateIchOpportunityFile(candidateFile);
if (!validation.valid) throw new Error(validation.errors.join("; "));
const repairedExisting = currentFile.entries;
const decisions = evaluateControlledBatch(candidates, repairedExisting, now, 10);
const blocked = decisions.filter((d) => d.decision !== "eligible");
if (blocked.length) throw new Error(blocked.map((d) => `${d.slug}: ${d.reasons.join(", ")}`).join("; "));

if (write) {
  const store = new IchOpportunityStore(storePath);
  const service = new IchPublicationService(store);
  for (const entry of candidates) {
    const created = service.create(entry, { actor: "stage5a-curation", now });
    const submitted = service.transition(created.id, "pending_review", "submitted", { actor: "stage5a-curation", now, expectedRevision: created.workflow.revision, reason: "Batch 1 官方详情与字段门禁通过。" });
    const approved = service.transition(submitted.id, "approved", "approved", { actor: "stage5a-reviewer", now, expectedRevision: submitted.workflow.revision, reason: "Batch 1 DS3/DS14 受控导入通过。" });
    service.transition(approved.id, "published", "published", { actor: "stage5a-reviewer", now, expectedRevision: approved.workflow.revision });
  }
}

const afterBytes = write ? fs.readFileSync(storePath) : beforeBytes;
const afterFile = JSON.parse(afterBytes.toString("utf8")) as IchOpportunityFile;
const afterHash = crypto.createHash("sha256").update(afterBytes).digest("hex");
const activeStatuses = new Set(["active", "closing_soon", "long_term"]);
const activeCount = afterFile.entries.filter((e) => e.is_published && activeStatuses.has(computeIchOpportunityStatus(e, now))).length;
const report = { batch: "stage5a-batch-01", mode: write ? "write" : "dry-run", input: candidates.length, eligible: candidates.length, imported: write ? candidates.length : 0, before_count: currentFile.entries.length, after_count: afterFile.entries.length, active_after: activeCount, before_sha256: beforeHash, after_sha256: afterHash, titles: candidates.map((e) => e.title), gate: "pass" };
fs.writeFileSync(path.join(root, "docs/ich/stage5a-batch1-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
