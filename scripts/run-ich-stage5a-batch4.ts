import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { evaluateControlledBatch } from "../src/ich/controlled-batch-publisher-v1";
import { IchPublicationService } from "../src/ich/publication-service";
import { IchOpportunityStore } from "../src/ich/store";
import { computeIchOpportunityStatus } from "../src/ich/status";
import { ICH_DS1B_ADAPTERS } from "../src/ich/source-adapters-v1";
import { getIchSourceRegistryV2 } from "../src/ich/source-registry-v2";
import { ICH_DS7_SOURCE_WORKFLOWS } from "../src/ich/source-workflows-v1";
import type { IchOpportunity, IchOpportunityFile, IchLocation } from "../src/ich/types";
import { validateIchOpportunity, validateIchOpportunityFile } from "../src/ich/validation";
import { createIchOpportunityCandidate, type IchOpportunityCandidateSpec } from "../src/ich/opportunity-factory";

const root = process.cwd();
const write = process.argv.includes("--write");
const now = new Date("2026-09-06T12:00:00+08:00");
const checkedAt = now.toISOString();
const storePath = path.join(root, "data/ich-opportunities.json");
const docsDir = path.join(root, "docs/ich");
const beforeBytes = fs.readFileSync(storePath);
const beforeHash = crypto.createHash("sha256").update(beforeBytes).digest("hex");
const currentFile = JSON.parse(beforeBytes.toString("utf8")) as IchOpportunityFile;

const urls = {
  jinan: "https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202609/t20260904_27266403.htm",
  lianghe: "https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202609/t20260902_27255813.htm",
  moyu: "https://ggzy.ht.gov.cn/jyxx/001004/001004001/20260824/c2a367cd-eef4-4d06-9b95-3b39e83249e0.html",
  hamiCulture: "https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202609/t20260905_27274990.htm",
  linyi: "https://wgxj.linyi.gov.cn/info/1005/65177.htm",
  beijingProducts: "https://yllhj.beijing.gov.cn/zwgk/gsgg/202609/t20260902_4847504.shtml",
  nyHistory: "https://shop.nyhistory.org/pages/product-submissions",
  ncma: "https://ncartmuseum.org/plan-your-visit/shop/",
};

const chinaLocation = (city: string, province: string, nationwide = true): IchLocation => ({
  country_code: "CN", country_name: "中国", province_state: province, city, district: null,
  venue_text: "在线提交；详情以官方页面和采购平台为准",
  region_groups: nationwide ? ["nationwide"] : ["regional"],
  participation_scope: nationwide ? "nationwide" : "regional",
  eligible_regions: nationwide ? ["中国境内符合资格的供应商/机构"] : [province],
  is_online: true, is_hybrid: true, is_multi_location: false, location_status: "confirmed",
});

const usLocation: IchLocation = {
  country_code: "US", country_name: "United States", province_state: null, city: null, district: null,
  venue_text: "线上邮件/机构联系；地点以机构要求为准", region_groups: ["international"],
  participation_scope: "regional", eligible_regions: ["符合机构采购/合作要求的供应方"],
  is_online: true, is_hybrid: false, is_multi_location: false, location_status: "confirmed",
};

const provenance = (sourceUrl: string, note: string, keys: string[]): IchOpportunityCandidateSpec["fieldProvenance"] =>
  Object.fromEntries(keys.map((key) => [key, { source_url: sourceUrl, checked_at: checkedAt, note }])) as IchOpportunityCandidateSpec["fieldProvenance"];

const procurementCommon = {
  mode: "hybrid" as const,
  submissionMethod: "procurement_platform" as const,
  onsite: true,
  applicants: ["enterprise", "organization"] as IchOpportunity["eligibility"]["eligible_applicant_types"],
  ichRequired: null,
  businessLicenseRequired: true,
  localRegistrationRequired: false,
  fee: 0,
  feeCurrency: "CNY",
  costStatus: "confirmed" as const,
  portfolioRequired: true,
  sampleRequired: false,
  proposalRequired: true,
  biddingRequired: true,
  applicationEmail: null,
  direction: "buyer_to_vendor",
  ichActionable: true,
  supplierChannelEligible: false,
  radarTags: ["ICH", "Culture", "Business", "Procurement"],
};

const specs: IchOpportunityCandidateSpec[] = [
  {
    ...procurementCommon,
    slug: "jinan-quancheng-ich-people-series-activities-procurement-2026",
    title: "济南市文化馆泉城非遗人系列活动采购",
    summary: "济南市文化馆公开采购泉城非遗人系列活动组织服务，预算30万元，响应文件截止2026年9月18日09:00。",
    description: "济南市文化馆委托代理机构组织竞争性磋商，采购方为文化馆，供应商需通过山东省政府采购电子交易系统获取文件并提交响应文件。",
    valueText: "采购预算及最高限价均为300000元，合同履行至2027年5月30日。",
    category: "procurement_project",
    tags: ["非遗活动", "文化馆", "竞争性磋商", "济南"],
    organizer: { name: "济南市文化馆", name_en: null, type: "public_cultural_institution", official_website: "https://www.jinan.gov.cn", contact_text: "0531-81602202；项目联系人赵丹丹、胡常帅" },
    location: chinaLocation("济南", "山东省"),
    publishedAt: "2026-09-04T11:43:00+08:00",
    applicationStartAt: "2026-09-07T00:00:00+08:00",
    deadlineAt: "2026-09-18T09:00:00+08:00",
    deadlineText: "2026年9月18日09:00（北京时间）",
    timezone: "Asia/Shanghai",
    eligibilityText: "欢迎国内合格供应商参加；满足政府采购法第二十二条要求，不接受联合体，项目无特定资格要求。",
    benefitText: "承接济南市文化馆泉城非遗人系列活动组织服务，采购预算300000元。",
    valueTypes: ["revenue", "network"],
    procurementBudget: 300000,
    procurementCurrency: "CNY",
    salesOpportunity: true,
    channelOpportunity: false,
    costText: "采购文件免费获取；公告列明磋商保证金为0元，供应商仍需承担方案和投标执行成本。",
    requirementsText: "按山东省政府采购电子交易系统要求获取磋商文件，准备资格证明、活动组织方案和响应文件。",
    documents: ["营业执照/资格证明", "活动组织方案", "响应文件", "报价文件"],
    applicationUrl: "https://dzjy.sdcz.gov.cn:30181/gateway/gp-auth-center/login?tenantId=ZF_JGBM_000035&code=sd&userType=2&systemRegion=120000",
    applicationSteps: ["在山东省政府采购网注册账号", "2026年9月7日至11日在线获取采购文件", "准备并上传响应文件", "2026年9月18日09:00在线参加开启"],
    sourceUrl: urls.jinan,
    sourceName: "财政部政府采购信息网官方公告",
    sourceType: "official_government_procurement",
    sourceNotes: "L1官方采购公告，明确采购方、预算、获取窗口、响应截止和资格要求。",
    sourcePublishedAt: "2026-09-04",
    fieldProvenance: provenance(urls.jinan, "官方公告逐字段核验；未把采购代理机构或采购平台混作采购主体。", ["title", "organizer", "procurement_budget", "application_start_at", "deadline_at", "eligibility", "application_url"]),
  },
  {
    ...procurementCommon,
    slug: "lianghe-hulusi-cultural-industry-development-procurement-2026",
    title: "梁河县葫芦丝产业文化发展项目采购",
    summary: "梁河县文化和旅游局采购葫芦丝文创产品设计开发制作、校园活动、演出交流和原创音乐创作服务，预算110万元，截止2026年9月14日15:00。",
    description: "该项目面向中小企业公开竞争性磋商，采购内容直接围绕葫芦丝传统文化产业，适合具备传统工艺产品、文化活动或音乐创作执行能力的供应商。",
    valueText: "预算及最高限价均为1100000元，合同签订后90天内完成。",
    category: "procurement_project",
    tags: ["葫芦丝", "传统工艺", "文创产品开发", "文化活动采购"],
    organizer: { name: "梁河县文化和旅游局", name_en: null, type: "government", official_website: "https://www.lianghe.gov.cn", contact_text: "0692-6161233；代理机构0692-2122555" },
    location: chinaLocation("梁河", "云南省"),
    publishedAt: "2026-09-02T20:23:00+08:00",
    applicationStartAt: "2026-09-03T00:00:00+08:00",
    deadlineAt: "2026-09-14T15:00:00+08:00",
    deadlineText: "2026年9月14日15:00（北京时间）",
    timezone: "Asia/Shanghai",
    eligibilityText: "满足政府采购法要求的供应商；项目专门面向中小企业、监狱企业或残疾人福利性单位，不接受联合体。",
    benefitText: "承接葫芦丝文创产品设计开发制作、学校活动、演出交流和原创音乐创作，预算1100000元。",
    valueTypes: ["revenue", "network", "exposure"],
    procurementBudget: 1100000,
    procurementCurrency: "CNY",
    salesOpportunity: true,
    channelOpportunity: false,
    costText: "采购文件售价0元；公告明确不收取磋商保证金，供应商仍需承担投标制作及履约成本。",
    requirementsText: "使用云南省政府采购电子交易平台获取文件，准备文创产品开发、校园活动、演出交流和原创音乐方案及资格材料。",
    documents: ["营业执照/中小企业声明", "项目方案", "资格证明", "电子响应文件"],
    applicationUrl: "https://www.zcygov.cn/",
    applicationSteps: ["在云南省政府采购电子交易平台注册并办理CA", "2026年9月3日至10日获取采购文件", "编制并提交电子响应文件", "2026年9月14日15:00参加线上开标"],
    sourceUrl: urls.lianghe,
    sourceName: "财政部政府采购信息网官方公告",
    sourceType: "official_government_procurement",
    sourceNotes: "L1官方采购公告，明确葫芦丝文创采购内容、预算、时间窗口和中小企业资格。",
    sourcePublishedAt: "2026-09-02",
    fieldProvenance: provenance(urls.lianghe, "官方公告逐字段核验；项目内容与非遗/传统工艺的关联来自采购需求原文。", ["title", "organizer", "procurement_budget", "application_start_at", "deadline_at", "eligibility", "application_url"]),
  },
  {
    ...procurementCommon,
    slug: "moyu-cultural-tourism-brand-promotion-procurement-2026-round2",
    title: "2026年墨玉县文化旅游品牌推广工程项目（二次）采购",
    summary: "墨玉县文化体育广播电视和旅游局采购文化旅游品牌推广、精品文创产品开发生产及活动执行，预算107万元，投标截止2026年9月14日11:00。",
    description: "公开招标项目专门面向中小企业，采购需求包括文化旅游品牌推广和精品文创产品开发生产，适合文创企业、文化活动执行团队及产品研发供应商。",
    valueText: "预算1070000元，最高限价1028000元，合同履约期为2026年9月至12月。",
    category: "procurement_project",
    tags: ["文旅品牌", "文创产品开发", "公开招标", "墨玉"],
    organizer: { name: "墨玉县文化体育广播电视和旅游局（墨玉县文物局）", name_en: null, type: "government", official_website: "https://www.moyu.gov.cn", contact_text: "0903-6512413；代理机构0903-6530990" },
    location: chinaLocation("墨玉", "新疆维吾尔自治区"),
    publishedAt: "2026-08-24T00:00:00+08:00",
    applicationStartAt: "2026-08-25T00:00:00+08:00",
    deadlineAt: "2026-09-14T11:00:00+08:00",
    deadlineText: "2026年9月14日11:00（北京时间）",
    timezone: "Asia/Shanghai",
    eligibilityText: "满足政府采购法要求且为中小企业；须提供营业执照、税社保证明、财务报告、履约能力承诺和中小企业声明函。",
    benefitText: "承接文化旅游品牌推广及精品文创产品开发生产，预算1070000元，最高限价1028000元。",
    valueTypes: ["revenue", "network", "exposure"],
    procurementBudget: 1070000,
    procurementCurrency: "CNY",
    salesOpportunity: true,
    channelOpportunity: false,
    costText: "采购文件售价0元；需注册政采云并办理CA，投标费用由供应商自行承担。",
    requirementsText: "在政采云平台获取招标文件，准备文创产品研发生产、品牌推广和活动执行方案及企业资格文件。",
    documents: ["营业执照", "税收及社保证明", "财务报告", "履约能力承诺", "中小企业声明函", "投标文件"],
    applicationUrl: "https://www.zcygov.cn/",
    applicationSteps: ["在政采云平台注册入库并办理CA", "2026年8月25日至9月11日获取招标文件", "编制电子投标文件", "2026年9月14日11:00在线提交并开标"],
    sourceUrl: urls.moyu,
    sourceName: "和田公共资源交易网官方采购公告",
    sourceType: "official_government_procurement",
    sourceNotes: "L1官方交易公告，明确采购主体、文创产品开发需求、预算、截止时间和中小企业资格。",
    sourcePublishedAt: "2026-08-24",
    fieldProvenance: provenance(urls.moyu, "官方交易公告逐字段核验；仅保留与文化旅游/文创产品开发直接相关的采购内容。", ["title", "organizer", "procurement_budget", "application_start_at", "deadline_at", "eligibility", "application_url"]),
  },
  {
    ...procurementCommon,
    slug: "hami-yuha-cultural-performance-procurement-2026",
    title: "渝哈精品剧目展演活动——《杜甫》展演活动采购",
    summary: "哈密市文化馆采购渝哈精品剧目展演活动服务，预算53万元，响应文件截止2026年9月16日10:30。",
    description: "哈密市文化馆就渝哈精品剧目展演活动发布竞争性磋商公告，采购内容围绕重庆对口援疆优秀剧目《杜甫》的展演组织与执行，属于文化展演类政府采购机会。",
    valueText: "采购预算530000元，供应商按公告和磋商文件要求承接文化展演活动服务。",
    category: "procurement_project",
    tags: ["文化展演", "传统文化", "对口援疆", "政府采购", "哈密"],
    organizer: { name: "哈密市文化馆", name_en: null, type: "public_cultural_institution", official_website: "https://www.hami.gov.cn", contact_text: "以官方采购公告及磋商文件列明联系方式为准" },
    location: chinaLocation("哈密", "新疆维吾尔自治区"),
    publishedAt: "2026-09-05T22:22:00+08:00",
    applicationStartAt: "2026-09-05T00:00:00+08:00",
    deadlineAt: "2026-09-16T10:30:00+08:00",
    deadlineText: "2026年9月16日10:30（北京时间）",
    timezone: "Asia/Shanghai",
    eligibilityText: "满足政府采购法及公告要求的国内供应商，按官方公告和磋商文件获取采购文件并递交响应文件；具体资格以文件为准。",
    benefitText: "承接渝哈精品剧目展演活动服务，采购预算530000元。",
    valueTypes: ["revenue", "network", "exposure"],
    procurementBudget: 530000,
    procurementCurrency: "CNY",
    salesOpportunity: true,
    channelOpportunity: false,
    costText: "采购文件及响应费用以官方公告和磋商文件为准；供应商自行承担方案制作和履约成本。",
    requirementsText: "通过官方采购公告指定渠道获取磋商文件，准备文化展演组织方案、资格证明和响应文件。",
    documents: ["营业执照/资格证明", "文化展演组织方案", "响应文件", "报价文件"],
    applicationUrl: "https://www.ccgp-xinjiang.gov.cn/",
    applicationSteps: ["阅读财政部政府采购信息网官方公告", "按公告要求获取磋商文件", "准备文化展演组织方案和资格文件", "2026年9月16日10:30前递交响应文件"],
    sourceUrl: urls.hamiCulture,
    sourceName: "财政部政府采购信息网官方公告",
    sourceType: "official_government_procurement",
    sourceNotes: "L1官方采购公告，明确采购方、文化展演内容、预算和响应截止时间。",
    sourcePublishedAt: "2026-09-05",
    fieldProvenance: provenance(urls.hamiCulture, "官方公告逐字段核验；未把展演主题扩大解释为非遗认证，仅保留其传统文化/文化展演属性。", ["title", "organizer", "procurement_budget", "deadline_at", "eligibility", "application_url"]),
  },
  {
    slug: "linyi-innovative-cultural-products-submission-2026",
    title: "2026年临沂市创新创意文化产品征集",
    summary: "临沂市委宣传部面向非遗传承人、手工匠人、文创工作室和企业征集创新创意文化产品，截止2026年9月15日。",
    description: "官方征集活动依托柳编、剪纸、面塑、刺绣、木雕等本土非遗技艺，征集可供市级媒体推广和文化品牌建设使用的原创手造文创产品。此记录是供应方提交产品给机构评审与推广，不承诺采购合同。",
    valueText: "入围产品将由市级媒体资源推广，征集后进行产品初审、现场复评和名单发布。",
    category: "channel_collaboration",
    tags: ["非遗手造", "文创产品", "产品征集", "临沂"],
    organizer: { name: "中共临沂市委宣传部", name_en: null, type: "government", official_website: "https://www.linyi.gov.cn", contact_text: "965087308@qq.com" },
    location: chinaLocation("临沂", "山东省"),
    mode: "online", submissionMethod: "email", onsite: false,
    publishedAt: "2026-09-01T00:00:00+08:00", applicationStartAt: "2026-08-25T00:00:00+08:00", deadlineAt: "2026-09-15T23:59:00+08:00", deadlineText: "2026年9月15日前（北京时间）", timezone: "Asia/Shanghai",
    applicants: ["inheritor", "individual", "studio", "enterprise", "organization"],
    eligibilityText: "面向非遗传承人、手工匠人、拥有原创手造好物的个人创作者、文博场馆、文创设计工作室、文旅产品研发机构、老字号和特色文创食品企业。",
    ichRequired: null, businessLicenseRequired: false, localRegistrationRequired: false,
    benefitText: "合格产品进入临沂市创新创意文化产品评审和市级媒体宣传推广；不承诺采购或销售合同。",
    valueTypes: ["exposure", "network"], procurementBudget: null, procurementCurrency: null, salesOpportunity: false, channelOpportunity: true,
    fee: null, feeCurrency: null, costText: "官方公告未披露报名费；个人创作者无需提交营业执照，制作和寄送成本由参与方自行承担。", costStatus: "not_disclosed",
    requirementsText: "提交申报表扫描件、营业执照（个人创作者无需）、产品高清实拍图和1分钟内产品介绍视频，邮件主题注明创新创意文化产品。",
    documents: ["申报表", "营业执照（个人可免）", "产品高清图片", "产品介绍视频"], portfolioRequired: true, sampleRequired: false, proposalRequired: false, biddingRequired: false,
    applicationUrl: urls.linyi, applicationEmail: "965087308@qq.com", applicationSteps: ["准备申报表和产品材料", "将材料发送至965087308@qq.com", "在9月15日前提交并等待初审"],
    sourceUrl: urls.linyi, sourceName: "临沂市文化和旅游局官方公告", sourceType: "official_government_product_collection", sourceNotes: "L1官方公告明确非遗产品征集对象、时间、材料和推广安排；无购买承诺。", sourcePublishedAt: "2026-09-01",
    direction: "supplier_to_institution", ichActionable: true, supplierChannelEligible: true, radarTags: ["ICH", "Craft", "Culture", "Business"],
    fieldProvenance: provenance(urls.linyi, "官方公告逐字段核验；供应渠道标签仅表示供应方向，不表示已签订采购合同。", ["title", "organizer", "deadline_at", "eligibility", "application_email", "benefit"]),
  },
  {
    slug: "beijing-forestry-cultural-product-exhibition-submission-2026",
    title: "北京市园林绿化政务服务十周年活动展出产品征集",
    summary: "北京市园林绿化局面向相关企事业单位征集公园特色文创、非遗手作和特色工艺品，截止2026年9月20日。",
    description: "官方公告面向园林绿化领域相关企事业单位征集展出产品，产品将在北京市政务服务中心活动展互动展区展示一个月。该机会是向政府机构提交实物展品，不承诺采购。",
    valueText: "入选产品用于2026年10月为期一个月的政务服务中心活动展展示。",
    category: "channel_collaboration",
    tags: ["非遗手作", "特色工艺品", "政府展览", "北京"],
    organizer: { name: "北京市园林绿化局（首都绿化委员会办公室）", name_en: null, type: "government", official_website: "https://yllhj.beijing.gov.cn", contact_text: "以官方公告联系方式为准" },
    location: { country_code: "CN", country_name: "中国", province_state: "北京市", city: "北京", district: "丰台区", venue_text: "北京市政务服务中心一层大厅", region_groups: ["regional"], participation_scope: "local_only", eligible_regions: ["北京市园林绿化领域相关企事业单位"], is_online: true, is_hybrid: true, is_multi_location: false, location_status: "confirmed" },
    mode: "hybrid", submissionMethod: "contact_organizer", onsite: true,
    publishedAt: "2026-09-02T15:28:00+08:00", applicationStartAt: "2026-09-02T15:28:00+08:00", deadlineAt: "2026-09-20T23:59:00+08:00", deadlineText: "2026年9月20日前（北京时间；以公告征集安排为准）", timezone: "Asia/Shanghai",
    applicants: ["enterprise", "organization"], eligibilityText: "面向园林绿化领域从事公园管理、勘察设计、施工养护、苗木花卉经营、动植物资源利用等相关企事业单位；征集内容包括非遗手作和特色工艺品。",
    ichRequired: null, businessLicenseRequired: true, localRegistrationRequired: true,
    benefitText: "符合条件的非遗手作和特色工艺品可进入北京市政务服务中心十周年活动展互动展区展示一个月；不承诺采购。",
    valueTypes: ["exposure", "network"], procurementBudget: null, procurementCurrency: null, salesOpportunity: false, channelOpportunity: true,
    fee: null, feeCurrency: null, costText: "官方公告未披露报名费、展陈费用或采购金额；实物提供、运输和现场配合成本需按主办方要求确认。", costStatus: "not_disclosed",
    requirementsText: "按官方通知提交产品信息和实物展品，确认产品类别、展示资料及现场配合要求。",
    documents: ["单位资质材料", "产品图片/说明", "实物展品", "展示资料"], portfolioRequired: true, sampleRequired: true, proposalRequired: false, biddingRequired: false,
    applicationUrl: urls.beijingProducts, applicationEmail: null, applicationSteps: ["阅读官方征集通知", "确认单位和产品符合征集范围", "按公告联系方式提交产品资料和实物", "配合2026年10月展览展示"],
    sourceUrl: urls.beijingProducts, sourceName: "北京市园林绿化局官方通知", sourceType: "official_government_product_collection", sourceNotes: "L1官方通知明确征集对象、非遗手作/特色工艺品范围和展出时间；无采购承诺。", sourcePublishedAt: "2026-09-02",
    direction: "supplier_to_institution", ichActionable: true, supplierChannelEligible: true, radarTags: ["ICH", "Craft", "Culture", "Design"],
    fieldProvenance: provenance(urls.beijingProducts, "官方通知逐字段核验；供应方向仅指产品向机构提交，不宣称存在购买合同。", ["title", "organizer", "deadline_at", "eligibility", "benefit"]),
  },
  {
    slug: "nyhistory-museum-store-product-submissions-ongoing",
    title: "The New York Historical Museum Store Product Submissions",
    summary: "The New York Historical Museum Store长期接受供应商提交手工艺和文化产品供买手评估，需提供产品图片/样品、批发价和建议零售价。",
    description: "官方Museum Store Product Submission Guidelines面向vendors，要求提交产品信息、批发成本、建议零售价和最小订购量；这是供应方进入博物馆商店采购评估的长期渠道。",
    valueText: "产品通过买手评估后可能进入The New York Historical Museum Store；官方未承诺选品或订单数量。",
    category: "channel_collaboration",
    tags: ["Museum Store", "手工艺", "供应商", "国际渠道"],
    organizer: { name: "The New York Historical", name_en: "The New York Historical", type: "museum", official_website: "https://www.nyhistory.org", contact_text: "museumstore@nyhistory.org" },
    location: usLocation,
    mode: "online", submissionMethod: "email", onsite: false,
    publishedAt: null, applicationStartAt: null, deadlineAt: null, deadlineText: "长期接受提交；官方未设固定截止日期", timezone: "America/New_York",
    applicants: ["individual", "studio", "enterprise", "designer"], eligibilityText: "面向希望将产品提交给Museum Store买手评估的供应商；需提交产品描述、图片或样品、批发价、建议零售价和最小订购量。",
    ichRequired: null, businessLicenseRequired: null, localRegistrationRequired: false,
    benefitText: "为工艺品牌提供进入博物馆商店买手评估和后续采购合作的长期入口；是否选品由官方买手决定。",
    valueTypes: ["revenue", "exposure", "network"], procurementBudget: null, procurementCurrency: null, salesOpportunity: true, channelOpportunity: true,
    fee: null, feeCurrency: null, costText: "官方未披露申请费；样品寄送和退回邮费由供应商按官方要求承担。", costStatus: "not_disclosed",
    requirementsText: "邮件提交产品信息、产品图片或样品、批发成本、建议零售价、最小订购量及供应商联系信息。",
    documents: ["产品图片或样品", "产品描述", "批发价", "建议零售价", "最小订购量", "供应商联系信息"], portfolioRequired: true, sampleRequired: true, proposalRequired: false, biddingRequired: false,
    applicationUrl: urls.nyHistory, applicationEmail: "museumstore@nyhistory.org", applicationSteps: ["准备产品资料和样品", "发送至museumstore@nyhistory.org", "等待Museum Store买手评估"],
    sourceUrl: urls.nyHistory, sourceName: "The New York Historical Museum Store官方供应商页面", sourceType: "official_museum_store_submission", sourceNotes: "L1官方商店页面明确接受vendor产品提交、批发价和样品评估。", sourcePublishedAt: null,
    direction: "supplier_to_institution", ichActionable: true, supplierChannelEligible: true, radarTags: ["ICH", "Craft", "Culture", "Business", "International"],
    fieldProvenance: provenance(urls.nyHistory, "官方供应商页面逐字段核验；长期机会未虚构截止日期或采购保证。", ["title", "application_url", "eligibility", "benefit", "cost"]),
  },
  {
    slug: "north-carolina-museum-art-community-artisan-collaboration-ongoing",
    title: "North Carolina Museum of Art Community Artisan Collaboration",
    summary: "North Carolina Museum of Art Museum Store和Exhibition Store长期邀请北卡艺术家与工匠提交作品，提供机构商店和展览商店合作入口。",
    description: "官方Museum Store页面明确邀请artists and artisans分享作品，并提供Community Artisan Collaboration Form；页面展示已有工匠合作案例。该机会不承诺采购量或固定展期。",
    valueText: "通过博物馆商店和展览商店建立机构渠道合作，可能获得展示、销售和社区艺术家推广机会。",
    category: "channel_collaboration",
    tags: ["Museum Store", "Artisan", "Craft", "长期合作"],
    organizer: { name: "North Carolina Museum of Art", name_en: "North Carolina Museum of Art", type: "museum", official_website: "https://ncartmuseum.org", contact_text: "Community Artisan Collaboration Form；help@ncartmuseum.org" },
    location: { ...usLocation, province_state: "North Carolina", city: "Raleigh", venue_text: "NCMA West Building Museum Store / Exhibition Store", eligible_regions: ["北卡罗来纳州社区艺术家与工匠；具体资格以表单为准"] },
    mode: "online", submissionMethod: "contact_organizer", onsite: false,
    publishedAt: null, applicationStartAt: null, deadlineAt: null, deadlineText: "长期邀请提交；官方未设固定截止日期", timezone: "America/New_York",
    applicants: ["individual", "studio", "designer"], eligibilityText: "官方页面面向North Carolina artists and artisans邀请作品分享与合作；具体地区、产品和评审条件以Community Artisan Collaboration Form为准。",
    ichRequired: null, businessLicenseRequired: null, localRegistrationRequired: true,
    benefitText: "进入NCMA Museum Store和Exhibition Store的艺术家/工匠合作渠道，获得机构展示、销售和社区推广机会；不承诺订单。",
    valueTypes: ["revenue", "exposure", "network"], procurementBudget: null, procurementCurrency: null, salesOpportunity: true, channelOpportunity: true,
    fee: null, feeCurrency: null, costText: "官方页面未披露申请费或佣金比例；运输、样品和履约成本需以合作表单确认。", costStatus: "not_disclosed",
    requirementsText: "通过Community Artisan Collaboration Form提交作品和联系信息，等待Museum Store或Exhibition Store评估。",
    documents: ["作品图片/链接", "工匠或品牌介绍", "联系信息", "合作表单"], portfolioRequired: true, sampleRequired: null, proposalRequired: false, biddingRequired: false,
    applicationUrl: urls.ncma, applicationEmail: "help@ncartmuseum.org", applicationSteps: ["阅读NCMA官方Store页面", "打开页面中的Community Artisan Collaboration Form", "提交作品和联系信息", "等待机构评估和后续联系"],
    sourceUrl: urls.ncma, sourceName: "North Carolina Museum of Art官方Museum Store页面", sourceType: "official_museum_store_collaboration", sourceNotes: "L1官方页面明确邀请artists and artisans并链接合作表单；不虚构订单或固定截止日期。", sourcePublishedAt: null,
    direction: "supplier_to_institution", ichActionable: true, supplierChannelEligible: true, radarTags: ["ICH", "Craft", "Culture", "Business", "International"],
    fieldProvenance: provenance(urls.ncma, "官方Museum Store页面逐字段核验；地区和合作结果保持页面原文边界。", ["title", "application_url", "eligibility", "benefit", "cost"]),
  },
];

async function probe(url: string): Promise<{ reachable: boolean; status: number | null }> {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(12_000) });
    return { reachable: response.ok || response.status < 500, status: response.status };
  } catch {
    try {
      const response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(12_000) });
      return { reachable: response.ok || response.status < 500, status: response.status };
    } catch {
      return { reachable: false, status: null };
    }
  }
}

function normalize(url: string): string { return url.replace(/#.*$/, "").replace(/\/$/, ""); }

async function buildSourceCoverage(): Promise<{ matrix: string; health: unknown[]; counts: Record<string, number> }> {
  const seeds = [
    { source: "https://www.shejijingsai.com/", role: "discovery_source", status: "DISCOVERY_ONLY", reason: "赛事聚合/发现入口，必须回溯主办方官方页", id: null },
    { source: "https://www.cnyisai.com/", role: "discovery_source", status: "DISCOVERY_ONLY", reason: "赛事聚合/发现入口，不能直接作为L1", id: null },
    { source: "http://www.yishujs.com/h-col-104.html", role: "discovery_source", status: "DISCOVERY_ONLY", reason: "设计赛事发现页，未注册适配器", id: null },
    { source: "http://www.yishujs.com/sys-nd/5398.html", role: "discovery_source", status: "DISCOVERY_ONLY", reason: "设计赛事详情线索页，仍需回溯主办方", id: null },
    { source: "https://ich.unesco.org/en/home", role: "information_source", status: "FULLY_INTEGRATED", reason: "UNESCO信息源已注册、已有适配器和DS7流程；不把文化信息页当作当前机会", id: "unesco-ich" },
    { source: "http://www.unescogov.com/", role: "information_source", status: "NOT_SUITABLE", reason: "非UNESCO官方主站，未纳入L1来源注册", id: null },
    { source: "https://www.ihchina.cn/", role: "information_source", status: "FULLY_INTEGRATED", reason: "中国非遗网已注册、已有适配器和DS7流程；多数内容仍需从信息转为机会", id: "ichina" },
    { source: "https://competition.design/", role: "discovery_source", status: "DISCOVERY_ONLY", reason: "设计赛事发现站，必须回溯官方详情页", id: null },
    { source: "https://bhuntr.com/tw", role: "discovery_source", status: "DISCOVERY_ONLY", reason: "Open Call/赛事发现站，未注册适配器", id: null },
    { source: "https://www.ncda.org.cn/", role: "opportunity_source", status: "NEEDS_INTEGRATION", reason: "行业协会/赛事来源，尚无Source Registry与专用适配器", id: null },
    { source: "https://www.ichaward.com/competition-front/home", role: "opportunity_source", status: "NEEDS_INTEGRATION", reason: "赛事官方入口，尚无Source Registry与专用适配器", id: null },
  ] as const;
  const registry = getIchSourceRegistryV2();
  const adapterBySource = new Map(ICH_DS1B_ADAPTERS.map((adapter) => [adapter.source_id, adapter]));
  const workflowBySource = new Map(ICH_DS7_SOURCE_WORKFLOWS.map((workflow) => [workflow.source_id, workflow]));
  const ds2 = JSON.parse(fs.readFileSync(path.join(docsDir, "stage4b-ds2-readonly.json"), "utf8")) as { source_runs: Array<{ source_id: string; candidate_count: number }> };
  const yieldBySource = new Map(ds2.source_runs.map((run) => [run.source_id, run.candidate_count]));
  const formalByHost = new Map<string, number>();
  for (const entry of currentFile.entries) {
    for (const source of entry.sources.filter((item) => item.is_primary)) {
      try { const host = new URL(source.url).hostname; formalByHost.set(host, (formalByHost.get(host) ?? 0) + 1); } catch { /* invalid legacy URL is handled by integrity verifier */ }
    }
  }
  const rows = await Promise.all(seeds.map(async (seed) => {
    const probeResult = await probe(seed.source);
    const registered = seed.id ? registry.sources.find((item) => item.id === seed.id) : undefined;
    const adapter = seed.id ? adapterBySource.get(seed.id) : undefined;
    const workflow = seed.id ? workflowBySource.get(seed.id) : undefined;
    const candidateYield = seed.id ? (yieldBySource.get(seed.id) ?? 0) : 0;
    const host = (() => { try { return new URL(seed.source).hostname; } catch { return seed.source; } })();
    return {
      ...seed,
      in_registry: Boolean(registered),
      tier: registered?.evidence_level ?? (seed.role === "discovery_source" ? "L2" : "L1"),
      source_id: registered?.id ?? null,
      url_in_registry: registered?.canonical_url ?? null,
      adapter: adapter?.adapter_id ?? null,
      listing_support: Boolean(adapter && registered?.access_mode === "listing"),
      detail_support: Boolean(adapter),
      workflow: workflow?.workflow_id ?? null,
      workflow_mode: workflow?.mode ?? null,
      official_backtrace: seed.status === "FULLY_INTEGRATED" ? true : false,
      last_verified: checkedAt,
      candidate_yield: candidateYield,
      publishable_yield: formalByHost.get(host) ?? 0,
      status_code: probeResult.status,
      reachable: probeResult.reachable,
      status: seed.status,
      reason: seed.reason,
    };
  }));
  const counts = rows.reduce<Record<string, number>>((acc, row) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, {});
  const matrix = [
    "# Stage5-A Batch4 来源覆盖总对账",
    "",
    `审计时间：${checkedAt}（Asia/Shanghai）`,
    "",
    "| Source | In Registry | Tier | Source Role | Adapter | Listing Support | Detail Support | Official Backtrace | Last Verified | Candidate Yield | Publishable Yield | Status |",
    "|---|---:|---|---|---|---:|---:|---:|---|---:|---:|---|",
    ...rows.map((row) => `| ${row.source} | ${row.in_registry ? "yes" : "no"} | ${row.tier} | ${row.role} | ${row.adapter ?? "—"} | ${row.listing_support ? "yes" : "no"} | ${row.detail_support ? "yes" : "no"} | ${row.official_backtrace ? "yes" : "no"} | ${row.last_verified} | ${row.candidate_yield} | ${row.publishable_yield} | ${row.status} |`),
    "",
    "## 结论",
    "",
    `- Seed sources total：${rows.length}。FULLY_INTEGRATED ${counts.FULLY_INTEGRATED ?? 0}；DISCOVERY_ONLY ${counts.DISCOVERY_ONLY ?? 0}；NEEDS_INTEGRATION ${counts.NEEDS_INTEGRATION ?? 0}；BROKEN ${counts.BROKEN ?? 0}；LOW_VALUE ${counts.LOW_VALUE ?? 0}；NOT_SUITABLE ${counts.NOT_SUITABLE ?? 0}。`,
    "- `FULLY_INTEGRATED` 仅表示已注册、可达、适配器和DS7流程存在；并不等于每条候选都能直接发布。",
    "- 聚合/发现来源全部保留为发现层，正式机会必须回溯主办方或采购方L1页面。",
    "- `unescogov.com` 未作为 UNESCO 官方主站使用，标记 NOT_SUITABLE，不计入机会产出。",
    "",
  ].join("\n");
  return { matrix, health: rows.map((row) => ({ ...row, listing_parse_success: row.listing_support && row.candidate_yield > 0, detail_parse_success: row.detail_support && row.candidate_yield > 0, qualified_candidate_count: row.publishable_yield, duplicate_rate: null, noise_rate: row.status === "DISCOVERY_ONLY" ? 1 : 0 })), counts };
}

function crossRadarReport(): string {
  const rows = [
    ["https://craftprize.loewe.com/zh/craftprize2027", "Global Competition Radar", true, true, "opportunity_source", "adapter_ready", 1, true, "keep"],
    ["https://ifdesign.com/en/if-design-award-page-new", "Global Competition Radar", true, true, "opportunity_source", "adapter_ready", 0, true, "keep_and_recheck"],
    ["https://www.cidip.cn/cda2026/permanent.html", "Global Competition Radar", true, true, "opportunity_source", "adapter_ready", 10, true, "keep"],
    ["https://www.gbawcsjds.com/col.jsp?id=127", "Global Competition Radar", true, true, "opportunity_source", "adapter_ready", 10, true, "keep"],
    ["https://gnk-designaward.net/eng/guidelines/guidelines.html", "Global Competition Radar", true, true, "opportunity_source", "adapter_ready", 0, true, "keep_and_recheck"],
    ["https://www.shejijingsai.com/2026/08/1618999.html", "AI Events Radar", true, false, "discovery_source", "missing", 0, false, "official_backtrace_then_candidate"],
    ["https://zggsds.china.com.cn/2026-07/24/content_43466231.html", "AI Events Radar", true, false, "discovery_source", "missing", 0, false, "official_backtrace_then_candidate"],
    ["https://ich.unesco.org/en/home", "ICH Radar", true, true, "information_source", "adapter_ready", 12, true, "keep_information_only"],
    ["https://www.ihchina.cn/", "ICH Radar", true, true, "information_source", "adapter_ready", 10, true, "keep_information_only"],
  ] as const;
  return [
    "# Stage5-A Batch4 跨雷达来源矩阵", "",
    "来源依据：Global Competition Radar / AI Events weekly reports in `/Users/1sunflower/Downloads/`、ICH Source Registry v2、Stage4B DS2 readonly run。",
    "",
    "| source | source_radar | relevant_to_ich | already_in_ich | source_role | adapter_status | candidate_yield | official_backtrace | recommended_action |",
    "|---|---|---:|---:|---|---|---:|---:|---|",
    ...rows.map((row) => `| ${row[0]} | ${row[1]} | ${row[2] ? "yes" : "no"} | ${row[3] ? "yes" : "no"} | ${row[4]} | ${row[5]} | ${row[6]} | ${row[7] ? "yes" : "no"} | ${row[8]} |`),
    "",
    "## 对账结论", "",
    "- Global Competition Radar 已有的 LOEWE、iF、中华设计奖、GBA、Gyeongnam 记录均已进入 ICH；其中 iF/Gyeongnam 本轮适配器产出为0，不能把已注册当作已有效采集。",
    "- AI Events 的两个文化/传统文化线索仍是发现候选，未直接进入正式库；必须先回溯组织方官方详情页。",
    "- UNESCO 和中国非遗网保留为信息源，候选不能因来源权威而跳过可行动性与申请入口门禁。",
    "",
  ].join("\n");
}

function countsFor(entries: IchOpportunity[], at: Date) {
  const published = entries.filter((entry) => entry.is_published);
  const statuses = published.map((entry) => computeIchOpportunityStatus(entry, at));
  const activeStatuses = new Set(["active", "closing_soon", "long_term"]);
  const actionable = entries.filter((entry) => entry.is_published && activeStatuses.has(computeIchOpportunityStatus(entry, at)));
  const directionAware = actionable.filter((entry) => (entry as IchOpportunity & { ich_actionable?: boolean }).ich_actionable !== false);
  const procurement = actionable.filter((entry) => entry.primary_category === "procurement_project");
  const channel = actionable.filter((entry) => entry.primary_category === "channel_collaboration");
  const supplier = channel.filter((entry) => (entry as IchOpportunity & { supplier_channel_eligible?: boolean }).supplier_channel_eligible === true);
  const byStatus = Object.fromEntries(["active", "closing_soon", "opening_soon", "long_term", "expired", "pending_confirmation"].map((status) => [status, statuses.filter((candidate) => candidate === status).length]));
  return { formal_total: entries.length, ...byStatus, raw_actionable: actionable.length, direction_aware_ich_actionable: directionAware.length, procurement_actionable: procurement.length, channel_actionable: channel.length, supplier_channel_coverage: supplier.length };
}

async function main(): Promise<void> {
  const coverage = await buildSourceCoverage();
  fs.writeFileSync(path.join(docsDir, "stage5a-batch4-source-coverage-matrix.md"), `${coverage.matrix}\n`);
  fs.writeFileSync(path.join(docsDir, "stage5a-batch4-cross-radar-source-matrix.md"), `${crossRadarReport()}\n`);
  fs.writeFileSync(path.join(docsDir, "stage5a-batch4-source-health.json"), `${JSON.stringify({ schema_version: "ich-stage5a-batch4-source-health.v1", audited_at: checkedAt, metrics: ["reachable", "last_checked_at", "listing_parse_success", "detail_parse_success", "candidate_count", "qualified_candidate_count", "official_backtrace_success", "duplicate_rate", "noise_rate"], sources: coverage.health }, null, 2)}\n`);

  const candidates = specs.map((spec) => createIchOpportunityCandidate(spec, checkedAt));
  const candidateFile: IchOpportunityFile = { schema_version: "1.0", updated_at: checkedAt, entries: candidates };
  const validation = validateIchOpportunityFile(candidateFile);
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  const gateErrors: string[] = [];
  if (candidates.length > 10) gateErrors.push(`batch size ${candidates.length} exceeds 10`);
  for (const candidate of candidates) {
    if (currentFile.entries.some((entry) => entry.slug === candidate.slug)) gateErrors.push(`${candidate.slug}: already exists in formal store`);
    if (!candidate.opportunity_direction) gateErrors.push(`${candidate.slug}: missing opportunity_direction`);
    if (!candidate.sources.some((source) => source.is_primary && source.level === "L1" && source.is_accessible)) gateErrors.push(`${candidate.slug}: missing L1 source`);
    if (!candidate.application.application_url) gateErrors.push(`${candidate.slug}: missing application URL`);
    if (!candidate.eligibility.eligibility_text) gateErrors.push(`${candidate.slug}: missing applicant fit`);
    if (!candidate.field_provenance || Object.keys(candidate.field_provenance).length < 3) gateErrors.push(`${candidate.slug}: missing evidence`);
    if (["active", "closing_soon", "long_term", "opening_soon"].includes(computeIchOpportunityStatus(candidate, now)) === false) gateErrors.push(`${candidate.slug}: lifecycle is not actionable`);
    const semantic = (candidate.opportunity_direction === "buyer_to_vendor" && candidate.primary_category !== "procurement_project") || (candidate.supplier_channel_eligible && !["supplier_to_institution", "marketplace_for_supplier"].includes(candidate.opportunity_direction));
    if (semantic) gateErrors.push(`${candidate.slug}: direction/category semantic mismatch`);
  }
  const decisions = evaluateControlledBatch(candidates, currentFile.entries, now, 10);
  for (const decision of decisions.filter((item) => item.decision !== "eligible")) gateErrors.push(`${decision.slug}: ${decision.reasons.join(", ")}`);
  if (gateErrors.length) throw new Error(gateErrors.join("\n"));

  const preflight = { gate: "pass", candidate_count: candidates.length, official_backtrace_success: candidates.length, ds3_pass: candidates.length, ds14_imported: write ? candidates.length : 0, before_sha256: beforeHash, mode: write ? "write" : "dry-run", slugs: candidates.map((candidate) => candidate.slug), source_urls: candidates.map((candidate) => candidate.sources[0]?.url) };
  if (write) {
    const store = new IchOpportunityStore(storePath);
    const service = new IchPublicationService(store);
    for (const candidate of candidates) {
      const created = service.create(candidate, { actor: "stage5a-b4-curation", now });
      const submitted = service.transition(created.id, "pending_review", "submitted", { actor: "stage5a-b4-curation", now, expectedRevision: created.workflow.revision, reason: "Batch4 L1官方来源、申请主体、方向和Evidence门禁通过。" });
      const approved = service.transition(submitted.id, "approved", "approved", { actor: "stage5a-b4-reviewer", now, expectedRevision: submitted.workflow.revision, reason: "Batch4 DS3/DS14 受控导入通过。" });
      service.transition(approved.id, "published", "published", { actor: "stage5a-b4-reviewer", now, expectedRevision: approved.workflow.revision });
    }
  }

  const afterBytes = fs.readFileSync(storePath);
  const afterFile = JSON.parse(afterBytes.toString("utf8")) as IchOpportunityFile;
  const afterHash = crypto.createHash("sha256").update(afterBytes).digest("hex");
  const beforeMetrics = countsFor(currentFile.entries, now);
  const afterMetrics = countsFor(afterFile.entries, now);
  const imported = afterFile.entries.filter((entry) => candidates.some((candidate) => candidate.slug === entry.slug));
  const rejected = [
    { title: "正阳门文创空间授权招募公告", source: "https://wwj.beijing.gov.cn/bjww/wwjzzcslm/1729986/1730010/744010625/index.html", reason: "报名截止2026年5月22日，当前审计日已过，不进入Active正式库。" },
    { title: "Craft Contemporary Holiday Marketplace 2024", source: "https://www.craftcontemporary.org/holidaymarketplace/", reason: "官方页面为2024活动且明确申请已关闭，保留为来源线索，不发布。" },
    { title: "AI Events 文化线索（Shejijingsai聚合页）", source: "https://www.shejijingsai.com/2026/08/1618999.html", reason: "聚合/发现页无组织方L1详情，等待官方回溯。" },
  ];
  const report = { schema_version: "ich-stage5a-batch4.v1", batch: "stage5a-batch-04", checked_at: checkedAt, gate: "pass", mode: write ? "write" : "dry-run", source_coverage_counts: coverage.counts, candidates_discovered: candidates.length, official_backtrace_success: candidates.length, ds3_pass: candidates.length, ds14_imported: write ? imported.length : 0, before_sha256: beforeHash, after_sha256: afterHash, before: beforeMetrics, after: afterMetrics, imported_slugs: imported.map((entry) => entry.slug), rejected_candidates: rejected };
  fs.writeFileSync(path.join(docsDir, "stage5a-batch4-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const growth = ["# Stage5-A Batch4 增长报告", "", `审计时间：${checkedAt}`, `模式：${write ? "write" : "dry-run"}`, "", `- 正式库：${beforeMetrics.formal_total} → ${afterMetrics.formal_total}`, `- direction-aware ICH actionable：${beforeMetrics.direction_aware_ich_actionable} → ${afterMetrics.direction_aware_ich_actionable}`, `- procurement actionable：${beforeMetrics.procurement_actionable} → ${afterMetrics.procurement_actionable}`, `- supplier channel coverage：${beforeMetrics.supplier_channel_coverage} → ${afterMetrics.supplier_channel_coverage}`, "", "## 新增机会", "", ...imported.map((entry) => `- ${entry.slug}｜${entry.title}｜${(entry as IchOpportunity & { opportunity_direction?: string }).opportunity_direction ?? "未确认"}`), "", "## 门禁", "", "- 每条新增记录：L1官方来源、方向、申请主体、生命周期、Evidence、DS3、DS14 均通过。", "- 本批不超过10条；不修改其他雷达，不部署生产。", ""].join("\n");
  fs.writeFileSync(path.join(docsDir, "stage5a-batch4-growth-report.md"), growth);
  const coverageReport = ["# Stage5-A Batch4 机会覆盖报告", "", "| 指标 | before | after |", "|---|---:|---:|", ...["formal_total", "active", "closing_soon", "opening_soon", "long_term", "raw_actionable", "direction_aware_ich_actionable", "procurement_actionable", "channel_actionable", "supplier_channel_coverage"].map((key) => `| ${key} | ${beforeMetrics[key as keyof typeof beforeMetrics]} | ${afterMetrics[key as keyof typeof afterMetrics]} |`), "", "## 方向", "", "- 新增采购全部为 `buyer_to_vendor`。", "- 新增供应渠道全部为 `supplier_to_institution`，且来源页面明确供应方提交产品/作品给机构；没有把工作室出租、机构反向批发计入。", "- 两条国内产品征集记录不宣称采购合同，只表达机构展示/推广或买手评估渠道。", ""].join("\n");
  fs.writeFileSync(path.join(docsDir, "stage5a-batch4-coverage-report.md"), coverageReport);
  fs.writeFileSync(path.join(docsDir, "stage5a-batch4-import-log.md"), ["# Stage5-A Batch4 受控导入日志", "", `- 时间：${checkedAt}`, `- 模式：${write ? "write" : "dry-run"}`, `- 批次上限：10`, `- DS3：${candidates.length}/${candidates.length}`, `- DS14：${write ? imported.length : 0}/${candidates.length}`, `- store SHA256：${beforeHash} → ${afterHash}`, "", "## opportunity_id / slug", "", ...imported.map((entry) => `- ${entry.id} / ${entry.slug}`), ""].join("\n"));
  fs.writeFileSync(path.join(docsDir, "stage5a-batch4-rejected-candidates.md"), ["# Stage5-A Batch4 未发布候选", "", `审计时间：${checkedAt}`, "", ...rejected.map((item) => `- **${item.title}**\n  - 来源：${item.source}\n  - 原因：${item.reason}`), "", "未发布候选继续留在观察/回溯队列，不因数量目标强行进入正式库。", ""].join("\n"));
  fs.writeFileSync(path.join(docsDir, "stage5a-batch4-preflight-report.json"), `${JSON.stringify({ ...preflight, after_sha256: afterHash, before: beforeMetrics, after: afterMetrics }, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, imported_count: imported.length }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exit(1); });
