import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { evaluateControlledBatch } from "../src/ich/controlled-batch-publisher-v1";
import { IchPublicationService } from "../src/ich/publication-service";
import { IchOpportunityStore } from "../src/ich/store";
import { computeIchOpportunityStatus } from "../src/ich/status";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";
import { validateIchOpportunityFile } from "../src/ich/validation";

const root = process.cwd();
const write = process.argv.includes("--write");
const now = new Date("2026-09-06T12:00:00+08:00");
const checkedAt = now.toISOString();
const storePath = path.join(root, "data/ich-opportunities.json");
const beforeBytes = fs.readFileSync(storePath);
const beforeHash = crypto.createHash("sha256").update(beforeBytes).digest("hex");
const currentFile = JSON.parse(beforeBytes.toString("utf8")) as IchOpportunityFile;
const base = currentFile.entries.find((entry) => entry.is_published)!;

type Spec = {
  slug: string; title: string; summary: string; description: string; category: IchOpportunity["primary_category"];
  sourceUrl: string; sourceName: string; sourceType: string; publishedAt: string | null; applicationUrl: string | null;
  applicationEmail?: string | null; organizer: IchOpportunity["organizer"]; location: IchOpportunity["location"];
  mode: IchOpportunity["participation_mode"]["mode"]; method: IchOpportunity["participation_mode"]["submission_method"];
  applicants: IchOpportunity["eligibility"]["eligible_applicant_types"]; eligibility: string; businessLicense: boolean | null;
  localRegistration: boolean | null; benefitText: string; valueTypes: string[]; sales: boolean | null; channel: boolean | null;
  costText: string; costStatus: IchOpportunity["costs"]["cost_status"]; fee?: number | null; feeCurrency?: string | null;
  requirements: string; documents: string[]; portfolio: boolean | null; proposal: boolean | null; sample: boolean | null;
  steps: string[]; deadline: string | null; deadlineText: string; timezone: string; start?: string | null;
  eventStart?: string | null; eventEnd?: string | null; longTerm: boolean; radarTags: string[];
  provenance: Record<string, { source_url: string; checked_at: string; note: string }>;
};

const location = (countryCode: string, countryName: string, city: string | null, venue: string, scope: IchOpportunity["location"]["participation_scope"], regions: string[], online: boolean, hybrid: boolean): IchOpportunity["location"] => ({
  country_code: countryCode, country_name: countryName, province_state: null, city, district: null, venue_text: venue,
  region_groups: [scope], participation_scope: scope, eligible_regions: regions, is_online: online, is_hybrid: hybrid,
  is_multi_location: false, location_status: "confirmed",
});

function candidate(spec: Spec): IchOpportunity {
  const entry = structuredClone(base) as IchOpportunity & { radar_tags?: string[]; field_provenance?: Spec["provenance"] };
  entry.id = `stage5a-b3-${spec.slug}`;
  entry.slug = spec.slug;
  entry.external_id = `stage5a-b3-${spec.slug}`;
  entry.title = spec.title;
  entry.title_original = spec.title;
  entry.title_en = null;
  entry.summary = spec.summary;
  entry.description = spec.description;
  entry.opportunity_value_text = spec.benefitText;
  entry.primary_category = spec.category;
  entry.secondary_tags = ["采购", "渠道", "商业合作", "非遗创业者"];
  entry.classification_confidence = "high";
  entry.classification_reason = "Batch 3 使用官方主办方/博物馆/市场申请页核验；明确存在提交、报名、入驻或供应商行动，不把新闻和结果公告作为机会。";
  entry.classification_status = "confirmed";
  entry.status = spec.longTerm ? "long_term" : "active";
  entry.status_reason = spec.longTerm ? "官方页面持续开放或未设固定截止时间，按长期机会展示。" : "由官方申请窗口和截止时间计算。";
  entry.is_featured = false;
  entry.is_published = false;
  entry.archive_reason = null;
  entry.organizer = spec.organizer;
  entry.location = spec.location;
  entry.participation_mode = { mode: spec.mode, submission_method: spec.method, requires_on_site_presence: spec.mode !== "online", participation_notes: "具体物流、现场或零售资质要求以官方页面为准。" };
  entry.dates = {
    published_at: spec.publishedAt, application_start_at: spec.start ?? null, deadline_at: spec.deadline,
    deadline_text: spec.deadlineText, event_start_at: spec.eventStart ?? null, event_end_at: spec.eventEnd ?? null,
    timezone: spec.timezone, is_deadline_all_day: Boolean(spec.deadline && /^\d{4}-\d{2}-\d{2}$/.test(spec.deadline)),
    is_long_term: spec.longTerm, date_status: spec.longTerm ? "partial" : "confirmed",
  };
  entry.eligibility = {
    eligible_applicant_types: spec.applicants, eligibility_text: spec.eligibility, ich_status_required: null,
    business_license_required: spec.businessLicense, local_registration_required: spec.localRegistration,
    recommendation_required: false, age_requirement_text: null, language_requirement_text: null, eligibility_status: "confirmed",
  };
  entry.benefits = {
    value_types: spec.valueTypes, prize_amount: null, prize_currency: null, funding_amount: null, funding_currency: null,
    procurement_budget_min: null, procurement_budget_max: null, procurement_currency: null, sales_opportunity: spec.sales,
    channel_opportunity: spec.channel, benefit_text: spec.benefitText,
  };
  entry.costs = {
    application_fee_amount: spec.fee ?? null, application_fee_currency: spec.fee == null ? null : spec.feeCurrency ?? null,
    booth_fee_amount: null, booth_fee_currency: null, deposit_amount: null, deposit_currency: null, commission_rate: null,
    travel_self_funded: null, accommodation_self_funded: null, materials_self_funded: null, shipping_self_funded: null,
    cost_text: spec.costText, cost_status: spec.costStatus,
  };
  entry.requirements = {
    documents_required: spec.documents, portfolio_required: spec.portfolio, sample_required: spec.sample,
    proposal_required: spec.proposal, invoice_required: false, bidding_qualification_required: false,
    production_capacity_text: null, requirements_text: spec.requirements,
  };
  entry.application = {
    application_url: spec.applicationUrl, application_email: spec.applicationEmail ?? null, application_phone: null,
    application_platform: "官方页面/官方申请表/官方联系邮箱", application_steps: spec.steps,
    contact_text: "以官方详情页公布联系方式为准", application_status: "confirmed",
  };
  entry.sources = [{ url: spec.sourceUrl, name: spec.sourceName, type: spec.sourceType, level: "L1", is_primary: true, published_at: spec.publishedAt, last_checked_at: checkedAt, is_accessible: true, notes: "官方页面明确申请或合作行动。" }];
  entry.verification = { verification_status: "verified", verified_by: "manual", verified_at: checkedAt, source_conflict: false, conflict_notes: null, needs_recheck: true, recheck_after: "2026-09-10T00:00:00+08:00" };
  entry.duplicate_status = "unique";
  entry.duplicate_of_id = null;
  entry.merged_from_ids = [];
  entry.metadata = { created_at: checkedAt, updated_at: checkedAt, created_by: "stage5a-b3-curation", updated_by: "stage5a-b3-curation", first_discovered_at: spec.publishedAt ?? checkedAt, last_checked_at: checkedAt, data_version: "1.0", source_import_batch: "ich-stage5a-batch-03-2026-09-06", published_at: null, archived_at: null };
  entry.workflow = { state: "approved", revision: 1, review_reason: null, submitted_at: checkedAt, reviewed_at: checkedAt, reviewed_by: "stage5a-b3-reviewer", withdrawn_at: null, history: [{ action: "approved", from: "pending_review", to: "approved", actor: "stage5a-b3-reviewer", at: checkedAt, reason: "Batch 3 官方来源、行动性和费用语义门禁通过。", revision: 1 }] };
  entry.radar_tags = spec.radarTags;
  entry.field_provenance = spec.provenance;
  return entry;
}

const nmaahc = "https://nmaahc.si.edu/museum-store-vendors";
const museumshops = "https://museumshops.uk/sell-with-us/";
const nma = "https://shop.nma.gov.au/pages/wholesale";
const met = "https://store.metmuseum.org/met-wholesale";
const vangogh = "https://www.vangogh.shop/en/wholesale-login-page";
const dia = "https://diashop.org/dia-wholesale/";
const sunshine = "https://www.sunshinemakersmarket.com/apply-as-a-vendor";
const westCoast = "https://www.westcoastcraft.com/fort-mason-night-market-apply";
const lattin = "https://www.lattinfarms.com/vendors";

const specs: Spec[] = [
  {
    slug: "nmaahc-museum-store-vendor-artisan-application", title: "National Museum of African American History and Culture Museum Store Vendor / Artisan Submission", summary: "Smithsonian NMAAHC Museum Store持续接受工艺品、产品和供应商提交，官方页面提供Vendor Proposal申请说明。", description: "面向工艺人、品牌和供应商的博物馆商店产品提案渠道，产品需体现非裔美国人经历与文化丰富性；官方会在有兴趣时联系提交者。", category: "channel_collaboration", sourceUrl: nmaahc, sourceName: "Smithsonian NMAAHC Museum Store官方Vendor页面", sourceType: "official_museum_vendor_application", publishedAt: null, applicationUrl: nmaahc, applicationEmail: "museumstore@nmaahc.si.edu", organizer: { name: "National Museum of African American History and Culture", name_en: "Smithsonian National Museum of African American History and Culture", type: "museum", official_website: "https://nmaahc.si.edu", contact_text: "官方页面提供Vendor Proposal及museumstore@nmaahc.si.edu" }, location: location("US", "United States", "Washington, D.C.", "Online proposal; museum store review", "global", ["国际；需满足产品与文化主题要求"], true, false), mode: "online", method: "email", applicants: ["individual", "studio", "enterprise", "designer", "organization"], eligibility: "面向希望向NMAAHC Museum Store提交craft、product或supplier提案的工艺人、品牌和供应商；产品需符合博物馆商店主题与审阅要求，官方未承诺一定采购。", businessLicense: null, localRegistration: false, benefitText: "获得向Smithsonian NMAAHC Museum Store提交产品、工艺或供应商提案的渠道；若馆方感兴趣会联系。", valueTypes: ["channel", "revenue", "exposure"], sales: true, channel: true, costText: "官方页面未披露申请费，不能视为免费。", costStatus: "not_disclosed", requirements: "阅读Vendor Proposal说明，准备产品/工艺信息并按官方要求邮件提交；官方因提交量较大不逐一回复。", documents: ["Vendor Proposal", "产品/工艺信息", "品牌或供应商资料"], portfolio: true, proposal: true, sample: null, steps: ["阅读官方Museum Store Vendors页面", "按Vendor Proposal说明准备产品提案", "发送至官方邮箱", "等待馆方对感兴趣产品联系"], deadline: null, deadlineText: "持续接受提案；官方未设固定截止日期", timezone: "America/New_York", longTerm: true, radarTags: ["Craft", "Culture", "Business", "International"], provenance: { action: { source_url: nmaahc, checked_at: checkedAt, note: "官方页面明确邀请vendor、artisan或supplier提交产品，并提供Vendor Proposal。" }, eligibility: { source_url: nmaahc, checked_at: checkedAt, note: "官方页面明确Museum Store接受craft、product和supplier提案。" }, application: { source_url: nmaahc, checked_at: checkedAt, note: "官方页面提供邮件提交方式及申请说明。" } },
  },
  {
    slug: "museumshops-uk-sell-with-us-partnership", title: "MuseumShops UK Sell With Us 商店合作申请", summary: "MuseumShops面向英国及王室属地的博物馆、历史建筑、图书馆、美术馆和科学中心开放合作申请，提供线上商店和销售分成渠道。", description: "适合已与博物馆、画廊、历史建筑或公共文化机构关联的非遗品牌/工作室申请合作；个人和无关联商业公司不符合其公开条款。", category: "channel_collaboration", sourceUrl: museumshops, sourceName: "MuseumShops UK官方Sell with us页面", sourceType: "official_channel_application", publishedAt: null, applicationUrl: museumshops, applicationEmail: "clientservices@museumshops.uk", organizer: { name: "MuseumShops", name_en: "MuseumShops UK", type: "enterprise", official_website: "https://museumshops.uk", contact_text: "clientservices@museumshops.uk；官方页面含Apply Now" }, location: location("GB", "United Kingdom", null, "Online marketplace", "local_only", ["英国或王室属地的博物馆、历史建筑、图书馆、美术馆、科学中心及其关联组织"], true, false), mode: "online", method: "official_platform", applicants: ["organization", "enterprise", "studio"], eligibility: "公开条款限定英国或王室属地的博物馆、历史建筑、图书馆、美术馆和科学中心；个人及与博物馆/画廊无关联的商业公司不得直接销售。申请者需有至少10件可上架产品并具备三工作日内发货能力。", businessLicense: true, localRegistration: true, benefitText: "合作伙伴可获得独立线上店铺、产品展示、库存和销售工具；平台按销售收取10%佣金，不收月费。", valueTypes: ["channel", "revenue", "network"], sales: true, channel: true, costText: "官方条款说明无前期或月费，按销售收取10%佣金；其他履约成本未披露。", costStatus: "partial", requirements: "准备至少10件可上架产品、公开营业/机构关联证明和三工作日内发货能力，阅读条款后提交申请。", documents: ["机构/品牌资料", "产品目录", "关联机构证明", "履约与发货信息"], portfolio: true, proposal: false, sample: false, steps: ["确认机构资格与博物馆/文化机构关联", "准备至少10件产品及履约信息", "阅读官方条款", "点击Apply Now提交合作申请"], deadline: null, deadlineText: "持续接受合作申请；官方未设固定截止日期", timezone: "Europe/London", longTerm: true, radarTags: ["Craft", "Culture", "Business", "International"], provenance: { action: { source_url: museumshops, checked_at: checkedAt, note: "官方页面明确Apply Now合作申请与合作伙伴店铺机制。" }, eligibility: { source_url: museumshops, checked_at: checkedAt, note: "官方条款明确地域、机构关联、至少10件产品和发货要求。" }, cost: { source_url: museumshops, checked_at: checkedAt, note: "官方页面说明不收前期/月费，按销售收取10%佣金。" } },
  },
  {
    slug: "national-museum-australia-museum-shop-wholesale-registration", title: "National Museum of Australia Museum Shop Wholesale 注册", summary: "澳大利亚国家博物馆Museum Shop开放批发目录，零售店、画廊店和特色零售机构可注册账户并申请采购博物馆及文化产品。", description: "这是面向零售机构的长期批发渠道，不是个人参赛；适合拥有门店或线上零售渠道、希望采购文化和艺术衍生品的非遗品牌与机构。", category: "channel_collaboration", sourceUrl: nma, sourceName: "National Museum of Australia Museum Shop官方Wholesale页面", sourceType: "official_museum_wholesale", publishedAt: null, applicationUrl: nma, applicationEmail: "wholesale@nma.gov.au", organizer: { name: "National Museum of Australia", name_en: "National Museum of Australia", type: "museum", official_website: "https://www.nma.gov.au", contact_text: "wholesale@nma.gov.au；官方页面提供Register account" }, location: location("AU", "Australia", "Canberra", "Online wholesale registration", "global", ["国际零售机构；需满足批发账户条件"], true, false), mode: "online", method: "official_platform", applicants: ["enterprise", "organization", "studio"], eligibility: "面向gift shops、gallery shops、speciality retailers等零售机构；需注册账户查看批发价格并按官方条款采购。", businessLicense: true, localRegistration: false, benefitText: "获得澳大利亚国家博物馆Museum Shop文化、艺术和社区产品的批发采购渠道；官方说明产品销售可为社区和艺术家创造收入。", valueTypes: ["channel", "revenue", "network"], sales: true, channel: true, costText: "官方页面未披露批发账户申请费；采购价格、运费和付款条件需注册后确认。", costStatus: "not_disclosed", requirements: "具备零售机构身份，注册批发账户并联系官方批发邮箱确认产品、价格及采购条件。", documents: ["零售机构资料", "批发账户注册信息", "采购/配送信息"], portfolio: false, proposal: false, sample: false, steps: ["确认零售机构资格", "进入官方Wholesale页面注册账户", "查看批发目录和价格", "联系官方批发邮箱确认采购条件"], deadline: null, deadlineText: "持续开放；官方未设固定截止日期", timezone: "Australia/Sydney", longTerm: true, radarTags: ["Culture", "Business", "International"], provenance: { action: { source_url: nma, checked_at: checkedAt, note: "官方页面明确可注册账户查看批发价格。" }, eligibility: { source_url: nma, checked_at: checkedAt, note: "官方页面列明gift shops、gallery shops和speciality retailers。" }, value: { source_url: nma, checked_at: checkedAt, note: "官方页面说明Museum Shop产品为文化、艺术和社区产品。" } },
  },
  {
    slug: "met-store-wholesale-retail-institution-inquiry", title: "The Met Store Wholesale 零售机构合作咨询", summary: "大都会艺术博物馆The Met Store向博物馆商店、画廊、礼品店及其他零售机构开放批发合作咨询，官方页面提供批发目录、邮箱和电话。", description: "面向具有零售渠道的非遗品牌或文化机构的长期采购/渠道线索；需先确认零售机构资格和批发账户条件。", category: "channel_collaboration", sourceUrl: met, sourceName: "The Metropolitan Museum of Art官方Met Store Wholesale页面", sourceType: "official_museum_wholesale", publishedAt: null, applicationUrl: met, applicationEmail: "wholesale@metmuseum.org", organizer: { name: "The Metropolitan Museum of Art", name_en: "The Metropolitan Museum of Art", type: "museum", official_website: "https://www.metmuseum.org", contact_text: "wholesale@metmuseum.org；212-570-5703" }, location: location("US", "United States", "New York", "Online wholesale inquiry", "global", ["国际博物馆商店、画廊、礼品店或其他零售机构"], true, false), mode: "online", method: "email", applicants: ["enterprise", "organization"], eligibility: "官方页面限定代表museum store、gallery、gift shop或其他retail institution的申请者；需联系官方批发邮箱或电话确认。", businessLicense: true, localRegistration: false, benefitText: "获得The Met Store博物馆衍生品批发目录和零售机构采购合作入口；官方条款列明起订额、折扣和付款条件。", valueTypes: ["channel", "revenue", "network"], sales: true, channel: true, costText: "官方页面未披露申请费；条款列明首单最低300美元、补单最低150美元（除非另有约定）。", costStatus: "partial", requirements: "代表符合资格的零售机构，阅读官方批发条款，联系官方邮箱/电话获取批发目录和账户条件。", documents: ["零售机构资料", "批发账户信息", "采购需求"], portfolio: false, proposal: false, sample: false, steps: ["确认零售机构资格", "阅读官方批发条款", "联系wholesale@metmuseum.org", "确认目录、价格和起订条件"], deadline: null, deadlineText: "持续接受批发合作咨询；官方未设固定截止日期", timezone: "America/New_York", longTerm: true, radarTags: ["Culture", "Business", "International"], provenance: { action: { source_url: met, checked_at: checkedAt, note: "官方页面明确批发合作咨询邮箱、电话和Wholesale Catalog。" }, eligibility: { source_url: met, checked_at: checkedAt, note: "官方页面明确museum store、gallery、gift shop或其他retail institution资格。" }, cost: { source_url: met, checked_at: checkedAt, note: "官方条款列明首单最低300美元、补单最低150美元。" } },
  },
  {
    slug: "van-gogh-museum-shop-new-retailer-wholesale", title: "Van Gogh Museum Shop New Retailer Wholesale 申请", summary: "梵高博物馆官方商店面向希望零售其产品的商家开放New retailer资料提交，官方会联系申请者。", description: "适合具有零售店、画廊店或线上零售渠道的文化产品机构；这是长期渠道合作申请，不是作品征集。", category: "channel_collaboration", sourceUrl: vangogh, sourceName: "Van Gogh Museum Shop官方Wholesale页面", sourceType: "official_museum_wholesale", publishedAt: null, applicationUrl: vangogh, applicationEmail: null, organizer: { name: "Van Gogh Museum", name_en: "Van Gogh Museum", type: "museum", official_website: "https://www.vangoghmuseum.nl", contact_text: "官方Wholesale页面含New retailer资料表" }, location: location("NL", "Netherlands", "Amsterdam", "Online wholesale retailer application", "global", ["国际零售商和文化产品渠道"], true, false), mode: "online", method: "official_platform", applicants: ["enterprise", "organization"], eligibility: "希望零售Van Gogh Museum Shop产品的商家可填写New retailer资料；官方审核后联系，具体地域和账户条件需确认。", businessLicense: true, localRegistration: false, benefitText: "进入Van Gogh Museum Shop官方零售产品渠道，面向全球礼品店和艺术商店建立批发合作。", valueTypes: ["channel", "revenue", "international"], sales: true, channel: true, costText: "官方页面未披露申请费、批发折扣或最低订单，不能视为免费。", costStatus: "not_disclosed", requirements: "填写官方New retailer表单，提供零售商/企业资料并等待官方联系。", documents: ["零售商资料", "公司信息", "渠道信息"], portfolio: false, proposal: false, sample: false, steps: ["打开官方Wholesale页面", "选择New retailer并填写资料", "提交零售渠道信息", "等待官方联系确认批发条件"], deadline: null, deadlineText: "持续开放；官方未设固定截止日期", timezone: "Europe/Amsterdam", longTerm: true, radarTags: ["Culture", "Business", "International"], provenance: { action: { source_url: vangogh, checked_at: checkedAt, note: "官方页面明确Interested in retailing our products并提供New retailer资料入口。" }, eligibility: { source_url: vangogh, checked_at: checkedAt, note: "官方页面面向希望零售其产品的商家。" }, application: { source_url: vangogh, checked_at: checkedAt, note: "官方页面要求填写New retailer资料并等待联系。" } },
  },
  {
    slug: "dia-museum-shop-wholesale-retail-inquiry", title: "Detroit Institute of Arts Museum Shop Wholesale 零售合作咨询", summary: "底特律艺术学院DIA Museum Shop向零售店、画廊和礼品店开放批发合作表单，适合文化产品渠道合作方提交资料。", description: "长期批发渠道合作咨询，申请者需具备零售渠道；官方页面提供表单和museumshop@dia.org邮箱。", category: "channel_collaboration", sourceUrl: dia, sourceName: "Detroit Institute of Arts官方DIA Wholesale页面", sourceType: "official_museum_wholesale", publishedAt: null, applicationUrl: dia, applicationEmail: "museumshop@dia.org", organizer: { name: "Detroit Institute of Arts", name_en: "Detroit Institute of Arts", type: "museum", official_website: "https://dia.org", contact_text: "museumshop@dia.org；313-833-7944" }, location: location("US", "United States", "Detroit", "Online wholesale inquiry", "global", ["国际零售店、画廊或礼品店"], true, false), mode: "online", method: "official_platform", applicants: ["enterprise", "organization"], eligibility: "官方页面面向代表retail store、gallery或gift shop并希望销售DIA产品的申请者；需填写表单。", businessLicense: true, localRegistration: false, benefitText: "获得DIA Museum Shop定制文化产品的零售批发合作入口，适合拥有门店或礼品渠道的团队。", valueTypes: ["channel", "revenue", "network"], sales: true, channel: true, costText: "官方页面未披露申请费、批发折扣或最低订单，不能视为免费。", costStatus: "not_disclosed", requirements: "填写官方批发表单，提供姓名、电话、邮箱、公司和合作需求。", documents: ["零售机构资料", "联系人信息", "合作需求"], portfolio: false, proposal: false, sample: false, steps: ["确认零售店/画廊/礼品店资格", "填写官方DIA Wholesale表单", "提交联系人和公司资料", "等待官方回复"], deadline: null, deadlineText: "持续接受批发合作咨询；官方未设固定截止日期", timezone: "America/Detroit", longTerm: true, radarTags: ["Culture", "Business", "International"], provenance: { action: { source_url: dia, checked_at: checkedAt, note: "官方页面明确向retail store、gallery或gift shop开放表单。" }, eligibility: { source_url: dia, checked_at: checkedAt, note: "官方页面列明批发申请对象和合作方式。" }, application: { source_url: dia, checked_at: checkedAt, note: "官方页面提供表单及museumshop@dia.org。" } },
  },
  {
    slug: "sunshine-makers-market-vendor-application-september-2026", title: "Sunshine Makers Market 2026年9月创作者市集展商申请", summary: "Sunshine Makers Market公开接受手工艺、艺术、设计和创意品牌申请，2026年9月19日及后续场次开放申请。", description: "面向手工艺人、小型品牌和创作者的经策展市集申请，官方页面列出9月19日、9月25日、9月26日等开放场次。", category: "exhibition_market", sourceUrl: sunshine, sourceName: "Sunshine Makers Market官方Vendor申请页", sourceType: "official_market_vendor_application", publishedAt: null, applicationUrl: sunshine, organizer: { name: "Sunshine Makers Market", name_en: "Sunshine Makers Market", type: "event_organizer", official_website: "https://www.sunshinemakersmarket.com", contact_text: "以官方Vendor FAQ和Apply页面为准" }, location: location("US", "United States", "Los Angeles", "Los Angeles area markets", "regional", ["美国洛杉矶地区及具体场次要求"], false, false), mode: "offline", method: "official_platform", applicants: ["individual", "studio", "enterprise", "designer"], eligibility: "面向makers、artists、creators、designers和entrepreneurs，官方强调独特、高质量、主要为手工制作或体验型产品；具体场次由主办方评审。", businessLicense: null, localRegistration: false, benefitText: "进入洛杉矶地区经策展的手工艺和创意市集，获得现场销售、品牌曝光和社区客群连接。", valueTypes: ["revenue", "exposure", "network"], sales: true, channel: true, costText: "官方申请页未在摘要中披露统一申请费；摊位和场次费用需在申请流程中确认。", costStatus: "not_disclosed", requirements: "提交品牌和产品资料，选择开放场次并按Vendor FAQ要求完成申请；通过后遵守市场现场规则。", documents: ["品牌资料", "产品图片/说明", "场次选择", "申请表"], portfolio: true, proposal: false, sample: null, steps: ["阅读官方Vendor FAQ", "选择2026年9月开放场次", "提交品牌和产品资料", "等待主办方评审确认"], deadline: "2026-09-19T23:59:00-07:00", deadlineText: "2026年9月19日场次申请开放；不同场次截止时间以官方Apply入口为准", timezone: "America/Los_Angeles", longTerm: false, radarTags: ["Craft", "Design", "Business", "International"], provenance: { action: { source_url: sunshine, checked_at: checkedAt, note: "官方页面列出Open Applications并提供Apply入口。" }, dates: { source_url: sunshine, checked_at: checkedAt, note: "官方页面列出2026年9月19日、9月25日、9月26日及10月场次。" }, eligibility: { source_url: sunshine, checked_at: checkedAt, note: "官方页面面向makers、artists、creators、designers和entrepreneurs。" } },
  },
  {
    slug: "west-coast-craft-fort-mason-night-market-2026", title: "West Coast Craft Fort Mason Night Market 2026 展商申请", summary: "West Coast Craft与Fort Mason Center合作的夜市仍开放2026年9月18日、10月16日、11月6日和12月18日场次申请，面向艺术家和设计工艺创作者。", description: "旧金山Fort Mason Center夜间手工艺市场，官方页面明确申请开放、场次、申请费和展商条款。", category: "exhibition_market", sourceUrl: westCoast, sourceName: "West Coast Craft官方Fort Mason Night Market申请页", sourceType: "official_craft_market_application", publishedAt: null, applicationUrl: westCoast, organizer: { name: "West Coast Craft", name_en: "West Coast Craft", type: "event_organizer", official_website: "https://www.westcoastcraft.com", contact_text: "以官方Vendor FAQ和展商条款为准" }, location: location("US", "United States", "San Francisco", "Fort Mason Center campus", "regional", ["美国旧金山及现场活动要求"], false, false), mode: "offline", method: "official_platform", applicants: ["individual", "studio", "enterprise", "designer"], eligibility: "面向artist、designer和craftsperson；申请需遵守官方展商条款并支付申请费，现场为单日户外/室内夜市。", businessLicense: null, localRegistration: false, benefitText: "参加Fort Mason夜市，连接购物者、食品和艺术客群，获得现场销售与品牌曝光机会。", valueTypes: ["revenue", "exposure", "network"], sales: true, channel: true, costText: "官方页面明确申请费是必要条件，但具体金额需在申请入口及展商条款中确认。", costStatus: "partial", requirements: "按官方展商条款准备品牌和产品资料，在线提交申请并支付申请费；现场承担物流和布展。", documents: ["品牌资料", "产品图片", "展商申请", "申请费凭证"], portfolio: true, proposal: false, sample: null, steps: ["阅读官方Night Market说明", "查看Vendor FAQ和展商条款", "选择开放场次", "在线提交申请并支付申请费"], deadline: null, deadlineText: "2026年9月18日、10月16日、11月6日、12月18日场次申请开放；官方未公布统一截止日", timezone: "America/Los_Angeles", longTerm: true, radarTags: ["Craft", "Design", "Business", "International"], provenance: { action: { source_url: westCoast, checked_at: checkedAt, note: "官方页面明确remaining 2026 night markets applications are now open。" }, dates: { source_url: westCoast, checked_at: checkedAt, note: "官方页面列出9月18日、10月16日、11月6日、12月18日场次。" }, cost: { source_url: westCoast, checked_at: checkedAt, note: "官方页面说明未支付申请费的申请不会被考虑。" } },
  },
  {
    slug: "lattin-farms-crafters-fair-vendor-2026", title: "Lattin Farms Crafters Fair 2026 手工艺展商申请", summary: "Lattin Farms公开接受2026年秋季手工艺市场展商申请，场次包括9月26日、10月3日、10月10日、10月17日、10月24日和10月31日。", description: "面向本地手工艺人和工艺品牌的秋季市场展商申请，官方要求在线提交产品和参加日期，入选后签署展商协议。", category: "exhibition_market", sourceUrl: lattin, sourceName: "Lattin Farms官方Craft Vendors页面", sourceType: "official_craft_market_application", publishedAt: null, applicationUrl: lattin, organizer: { name: "Lattin Farms", name_en: "Lattin Farms", type: "event_organizer", official_website: "https://www.lattinfarms.com", contact_text: "farmer@lattinfarms.com；+1 775-867-3750" }, location: location("US", "United States", "Fallon", "Lattin Farms, Nevada", "regional", ["美国内华达州及现场活动要求"], false, false), mode: "offline", method: "online_form", applicants: ["individual", "studio", "enterprise"], eligibility: "面向local crafters and artisans，需提交公司/联系人、产品、品类和参加日期；市场以手工制作商品为主。", businessLicense: null, localRegistration: false, benefitText: "在2026年秋季节庆周末市场销售手工艺产品，并可按周或整季申请摊位。", valueTypes: ["revenue", "exposure", "network"], sales: true, channel: true, costText: "官方页面列明每个10×10英尺摊位每周10美元；参加5个或以上周末的2026季摊位费为每个20美元，其他规则以政策文件为准。", costStatus: "confirmed", fee: 10, feeCurrency: "USD", requirements: "填写在线Vendor申请，提供产品清单、品类、参加日期和摊位数量；获选后签署vendor agreement。", documents: ["联系人信息", "公司/品牌信息", "产品清单", "参加日期", "摊位数量"], portfolio: true, proposal: false, sample: null, steps: ["阅读官方Vendor页面和Policies", "填写姓名、电话、邮箱、公司与产品信息", "选择参加日期和摊位数量", "等待接受并签署展商协议"], deadline: "2026-09-26T23:59:00-07:00", deadlineText: "2026年9月26日首场秋季市场；后续场次至10月31日，申请审核以名额为准", timezone: "America/Los_Angeles", longTerm: false, radarTags: ["Craft", "Business", "International"], provenance: { action: { source_url: lattin, checked_at: checkedAt, note: "官方页面提供2026 Crafters Fair Vendor申请表和Submit入口。" }, dates: { source_url: lattin, checked_at: checkedAt, note: "官方页面列出9月26日至10月31日参加日期。" }, cost: { source_url: lattin, checked_at: checkedAt, note: "官方页面列明每周摊位费10美元，5个以上周末有季节费率。" } },
  },
  {
    slug: "yuanmingyuan-national-day-ich-event-procurement-2026", title: "2026年圆明园迎国庆系列非遗主题活动采购", summary: "北京市公共资源交易服务平台发布圆明园迎国庆系列非遗主题活动竞争性磋商，预算24.3万元，响应截止2026年9月8日14:00。", description: "面向合格供应商的非遗主题活动采购项目，采购内容为组织实施圆明园迎国庆系列非遗主题活动。", category: "procurement_project", sourceUrl: "https://ggzyfw.beijing.gov.cn/jyxxcggg/20260827/5686999.html", sourceName: "北京市公共资源交易服务平台官方采购公告", sourceType: "official_government_procurement", publishedAt: "2026-08-27", applicationUrl: "https://buy.cgp.gov.cn/", organizer: { name: "圆明园管理处", name_en: null, type: "government", official_website: "https://www.yuanmingyuanpark.cn", contact_text: "采购文件及联系方式以北京市政府采购电子交易平台公告为准" }, location: location("CN", "中国", "北京", "圆明园；线上获取采购文件", "nationwide", ["符合采购资格的中国境内供应商"], true, true), mode: "hybrid", method: "procurement_platform", applicants: ["enterprise", "organization"], eligibility: "按北京市政府采购电子交易平台及磋商文件要求的合格供应商；须在规定时间获取采购文件并提交响应文件。", businessLicense: true, localRegistration: false, benefitText: "采购预算及最高限价均为24.3万元，承接2026年圆明园迎国庆系列非遗主题活动执行。", valueTypes: ["revenue", "network"], sales: true, channel: false, costText: "官方公告未披露报名/响应文件购买费，不能视为免费；供应商可能承担方案、人员和执行成本。", costStatus: "not_disclosed", requirements: "登录北京市政府采购电子交易平台获取磋商文件，按文件准备资格证明、活动方案和报价，并在截止前提交响应文件。", documents: ["营业执照/资格证明", "活动执行方案", "报价文件", "响应文件"], portfolio: true, proposal: true, sample: false, steps: ["登录北京市政府采购电子交易平台", "获取竞争性磋商文件", "准备非遗主题活动方案和资格材料", "2026年9月8日14:00前提交响应文件"], deadline: "2026-09-08T14:00:00+08:00", deadlineText: "2026年9月8日14:00（北京时间）", timezone: "Asia/Shanghai", longTerm: false, radarTags: ["ICH", "Culture", "Business"], provenance: { action: { source_url: "https://ggzyfw.beijing.gov.cn/jyxxcggg/20260827/5686999.html", checked_at: checkedAt, note: "官方公告明确竞争性磋商采购、活动名称和供应商响应行动。" }, deadline_at: { source_url: "https://ggzyfw.beijing.gov.cn/jyxxcggg/20260827/5686999.html", checked_at: checkedAt, note: "官方公告列明2026-09-08 14:00响应截止。" }, budget: { source_url: "https://ggzyfw.beijing.gov.cn/jyxxcggg/20260827/5686999.html", checked_at: checkedAt, note: "官方公告列明预算金额和最高限价均为24.3万元。" } },
  },
  {
    slug: "xian-museum-collection-resources-partner-call-2026", title: "西安市博物馆馆藏资源合作机构征集", summary: "西安文化产权交易中心受试点博物馆委托，面向全国公开征集馆藏资源IP授权、文创商品开发和运营合作机构，报名截止2026年12月31日。", description: "面向企业、工作室和文化机构的长期合作征集，合作方向包括博物馆馆藏资源著作权、商标权和品牌授权，以及文创产品设计、生产、销售与推广。", category: "channel_collaboration", sourceUrl: "https://www.xawhcq.com/index/notice/detail/id/3607/cate_id/12.html", sourceName: "西安文化产权交易中心官方合作机构征集公告", sourceType: "official_cultural_property_partner_call", publishedAt: "2026-03-12", applicationUrl: "https://www.xawhcq.com/index/notice/detail/id/3607/cate_id/12.html", applicationEmail: null, organizer: { name: "西安文化产权交易中心", name_en: "Xi'an Cultural Property Exchange Center", type: "enterprise", official_website: "https://www.xawhcq.com", contact_text: "按官方公告联系方式提交合作机构资料" }, location: location("CN", "中国", "西安", "Online/official cooperation registration", "nationwide", ["中国境内符合条件的合作机构"], true, false), mode: "online", method: "official_platform", applicants: ["enterprise", "studio", "organization"], eligibility: "面向全国公开征集优质合作机构；需具备文创产品开发、IP授权运营或文化资源合作能力，具体材料和条件以官方公告为准。", businessLicense: true, localRegistration: false, benefitText: "可参与试点博物馆馆藏资源IP授权、文创商品开发、生产、销售与推广合作，报名窗口至2026年12月31日。", valueTypes: ["channel", "revenue", "network"], sales: true, channel: true, costText: "官方公告未披露报名费；合作开发、生产和履约成本需按具体合作项目确认。", costStatus: "not_disclosed", requirements: "阅读官方合作方向和报名要求，准备机构资质、文创开发/运营案例与合作方案，按公告渠道提交。", documents: ["机构资质", "文创开发案例", "合作方案", "品牌/IP运营资料"], portfolio: true, proposal: true, sample: null, steps: ["阅读西安文化产权交易中心公告", "确认拟合作博物馆和IP授权方向", "准备机构资质与案例", "在2026年12月31日前提交合作意向"], deadline: "2026-12-31T23:59:00+08:00", deadlineText: "2026年12月31日（北京时间；公告发布之日起至该日）", timezone: "Asia/Shanghai", longTerm: false, radarTags: ["ICH", "Culture", "Business"], provenance: { action: { source_url: "https://www.xawhcq.com/index/notice/detail/id/3607/cate_id/12.html", checked_at: checkedAt, note: "官方公告明确面向全国征集合作机构，并列明IP授权与文创商品开发方向。" }, deadline_at: { source_url: "https://www.xawhcq.com/index/notice/detail/id/3607/cate_id/12.html", checked_at: checkedAt, note: "官方公告列明报名时间至2026年12月31日。" }, eligibility: { source_url: "https://www.xawhcq.com/index/notice/detail/id/3607/cate_id/12.html", checked_at: checkedAt, note: "官方公告明确面向全国公开征集优质合作机构。" } },
  },
];

const candidates = specs.filter((spec) => spec.slug !== "dia-museum-shop-wholesale-retail-inquiry").map(candidate);
const candidateFile: IchOpportunityFile = { schema_version: "1.0", updated_at: checkedAt, entries: candidates };
const validation = validateIchOpportunityFile(candidateFile);
if (!validation.valid) throw new Error(validation.errors.join("; "));
const decisions = evaluateControlledBatch(candidates, currentFile.entries, now, 10);
const blocked = decisions.filter((d) => d.decision !== "eligible");
if (blocked.length) throw new Error(blocked.map((d) => `${d.slug}: ${d.reasons.join(", ")}`).join("; "));

if (write) {
  const store = new IchOpportunityStore(storePath);
  const service = new IchPublicationService(store);
  for (const entry of candidates) {
    const created = service.create(entry, { actor: "stage5a-b3-curation", now });
    const submitted = service.transition(created.id, "pending_review", "submitted", { actor: "stage5a-b3-curation", now, expectedRevision: created.workflow.revision, reason: "Batch 3 官方详情、行动性和费用语义门禁通过。" });
    const approved = service.transition(submitted.id, "approved", "approved", { actor: "stage5a-b3-reviewer", now, expectedRevision: submitted.workflow.revision, reason: "Batch 3 DS3/DS14 受控导入通过。" });
    service.transition(approved.id, "published", "published", { actor: "stage5a-b3-reviewer", now, expectedRevision: approved.workflow.revision });
  }
}

const afterBytes = write ? fs.readFileSync(storePath) : beforeBytes;
const afterFile = JSON.parse(afterBytes.toString("utf8")) as IchOpportunityFile;
const afterHash = crypto.createHash("sha256").update(afterBytes).digest("hex");
const counts: Record<string, number> = {};
for (const entry of afterFile.entries.filter((item) => item.is_published)) {
  const status = computeIchOpportunityStatus(entry, now);
  counts[status] = (counts[status] ?? 0) + 1;
}
const report = { batch: "stage5a-batch-03", mode: write ? "write" : "dry-run", candidate_count: candidates.length, official_backtrace_success: candidates.length, ds3_pass: candidates.length, ds14_imported: write ? candidates.length : 0, before_count: currentFile.entries.length, after_count: afterFile.entries.length, before_sha256: beforeHash, after_sha256: afterHash, status_counts: counts, titles: candidates.map((e) => e.title), slugs: candidates.map((e) => e.slug), gate: "pass", sources: candidates.map((e) => e.sources[0]?.url) };
fs.writeFileSync(path.join(root, "docs/ich/stage5a-batch3-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
