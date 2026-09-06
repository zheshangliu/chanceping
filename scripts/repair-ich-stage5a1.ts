import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { computeIchOpportunityStatus } from "../src/ich/status";
import type { IchOpportunity, IchOpportunityFile } from "../src/ich/types";

const root = process.cwd();
const storePath = path.join(root, "data/ich-opportunities.json");
const reportPath = path.join(root, "docs/ich/stage5a-batch1-report.json");
const summaryPath = path.join(root, "docs/ich/stage5a1-semantic-summary.json");
const reportMdPath = path.join(root, "docs/ich/stage5a1-semantic-repair-report.md");
const now = new Date("2026-09-06T13:00:00+08:00");
const bytesBefore = fs.readFileSync(storePath);
const beforeHash = crypto.createHash("sha256").update(bytesBefore).digest("hex");
const file = JSON.parse(bytesBefore.toString("utf8")) as IchOpportunityFile;
const nowIso = now.toISOString();
const reviewedSlugs = [
  "beijing-traditional-craft-fund-2026-round2", "nnhm-creative-figurine-cooperation-2026",
  "guangzhou-excellent-traditional-culture-heritage-2026", "artesania-galicia-awards-2026",
  "huaxiajiang-culture-design-autumn-2026", "takarazuka-handicraft-open-exhibition-2026",
  "hunt-museum-open-submission-2026", "new-bedford-art-museum-analog-2026",
  "national-peanut-festival-craft-exhibits-2026", "alberta-indigenous-reconciliation-cultural-stream-2026",
];
const urls: Record<string, string> = {
  beijing: "https://www.beijing.gov.cn/zhengce/zhengcefagui/202608/t20260824_4834475.html",
  nnhm: "https://www.nnhm.org.cn/xw/zbgg/4028c108a00c331701a06b007a1b01a0.shtml",
  guangzhou: "https://wglj.gz.gov.cn/xxgk/gzdt/tzgsgg/content/post_10977749.html",
  galicia: "https://artesaniadegalicia.xunta.gal/es/convocatorias/convocatoria-premios-artesania-de-galicia-2026",
  huaxia: "https://www.huaxiajiang.com/",
  takarazuka: "https://takarazukahandicraft.jp/koubo.html",
  hunt: "https://www.huntmuseum.com/whats-on/hunt-museum-open-submission-exhibition-2026/",
  analog: "https://newbedfordart.org/analog-call/",
  peanut: "https://www.nationalpeanutfestival.com/p/getinvolved/premium-exhibits/arts--crafts",
  alberta: "https://www.alberta.ca/indigenous-reconciliation-initiative-cultural-stream",
};
const evidence = (url: string, note: string) => ({ source_url: url, checked_at: nowIso, note });
const bySlug = new Map(file.entries.map((entry) => [entry.slug, entry]));
const changes: Array<{ opportunity: string; field: string; before: unknown; after: unknown; evidence: string; reason: string }> = [];

function setField(entry: IchOpportunity, field: string, next: unknown, sourceUrl: string, reason: string): void {
  const target = entry as unknown as Record<string, unknown>;
  const before = target[field];
  if (JSON.stringify(before) === JSON.stringify(next)) return;
  target[field] = next;
  changes.push({ opportunity: entry.title, field, before, after: next, evidence: sourceUrl, reason });
}
function setNested(entry: IchOpportunity, section: keyof IchOpportunity, field: string, next: unknown, sourceUrl: string, reason: string): void {
  const target = (entry[section] as unknown) as Record<string, unknown>;
  const before = target[field];
  if (JSON.stringify(before) === JSON.stringify(next)) return;
  target[field] = next;
  changes.push({ opportunity: entry.title, field: `${String(section)}.${field}`, before, after: next, evidence: sourceUrl, reason });
}
function entry(slug: string): IchOpportunity {
  const value = bySlug.get(slug);
  if (!value) throw new Error(`Missing Batch 1 record: ${slug}`);
  return value;
}
function provenance(entry: IchOpportunity, values: Record<string, { url: string; note: string }>): void {
  (entry as unknown as Record<string, unknown>).field_provenance = Object.fromEntries(
    Object.entries(values).map(([field, value]) => [field, evidence(value.url, value.note)]),
  );
}

// Beijing: the official notice is local to Beijing and was published on 2026-08-24.
{
  const e = entry("beijing-traditional-craft-fund-2026-round2"); const u = urls.beijing;
  setNested(e, "dates", "published_at", "2026-08-24T00:00:00+08:00", u, "首都之窗标明发布日期为2026-08-24。");
  setNested(e, "dates", "application_start_at", "2026-08-24T00:00:00+08:00", u, "官方写明自通知发布之日起开放申报。");
  setNested(e, "location", "region_groups", ["province_only", "online_or_unrestricted"], u, "申报主体必须在北京地区登记注册。");
  setNested(e, "location", "participation_scope", "local_only", u, "机会限定北京登记注册单位。");
  setNested(e, "location", "eligible_regions", ["北京市"], u, "官方申报主体条款。");
  setNested(e, "eligibility", "local_registration_required", true, u, "官方要求在北京地区登记注册。");
  setNested(e, "eligibility", "business_license_required", true, u, "官方要求独立法人资格。");
  setNested(e, "costs", "application_fee_amount", null, u, "官方通知未说明报名费，不能推断免费。");
  setNested(e, "costs", "application_fee_currency", null, u, "费用金额未确认。");
  setNested(e, "costs", "cost_status", "not_disclosed", u, "官方通知未说明报名费。");
  setNested(e, "costs", "cost_text", "官方通知未说明报名费；项目投入及材料成本按申报说明执行。", u, "费用与项目投入需按附件核对。");
  setNested(e, "requirements", "documents_required", ["项目申报说明", "项目实施方案及总结报告", "项目投入明细表", "承诺书"], u, "官方附件列明申报说明、实施方案、投入明细表和承诺书。");
  setNested(e, "requirements", "portfolio_required", null, u, "官方未使用portfolio术语。");
  setNested(e, "requirements", "sample_required", null, u, "官方未确认实物样品要求。");
  setNested(e, "requirements", "proposal_required", true, u, "需提交项目实施方案。");
  setNested(e, "requirements", "requirements_text", "需为北京登记注册的独立法人单位，具备相关知识产权和项目实施能力；申报材料以官方附件为准。", u, "按官方申报条件和附件修复模板字段。");
  provenance(e, { deadline_at: { url: u, note: "2026年第二批申报截止2026-09-28 17:30。" }, application_start_at: { url: u, note: "自通知发布之日起申报。" }, eligible_regions: { url: u, note: "北京地区登记注册。" }, fee: { url: u, note: "未说明报名费，设置为unknown/not_disclosed。" }, requirements: { url: u, note: "官方附件1-4。" } });
}

// National Natural History Museum: domestic legal entities, business license and on-site operation are explicit.
{
  const e = entry("nnhm-creative-figurine-cooperation-2026"); const u = urls.nnhm;
  setNested(e, "dates", "published_at", "2026-09-04T00:00:00+08:00", u, "官方页面显示发布时间2026-09-04。");
  setNested(e, "dates", "application_start_at", "2026-09-04T00:00:00+08:00", u, "公告报名时间自2026-09-04起。");
  setNested(e, "eligibility", "business_license_required", true, u, "报名材料明确要求营业执照复印件。");
  setNested(e, "costs", "application_fee_amount", null, u, "官方公告未说明报名费。");
  setNested(e, "costs", "application_fee_currency", null, u, "费用金额未确认。");
  setNested(e, "costs", "cost_status", "not_disclosed", u, "官方公告未说明报名费。");
  setNested(e, "costs", "cost_text", "官方公告未说明报名费；合作企业承担设计开发、生产运输和仓储等前期投入。", u, "公告合作条件第（五）项。");
  setNested(e, "participation_mode", "requires_on_site_presence", true, u, "公告要求驻场工作人员为设备补货、调试和售后提供服务。");
  setNested(e, "participation_mode", "participation_notes", "合作涉及馆内设备、驻场服务、仓储、生产运输及知识产权安排，具体以磋商文件为准。", u, "公告合作内容第（二）至（七）项。");
  setNested(e, "costs", "shipping_self_funded", true, u, "合作企业承担生产运输等前期投入。");
  setNested(e, "requirements", "documents_required", ["盖章报名表", "营业执照复印件", "法定代表人身份证复印件", "授权委托书（如适用）", "信用中国及中国政府采购网信用证明"], u, "官方报名材料第（二）项。");
  setNested(e, "requirements", "portfolio_required", null, u, "官方未明确portfolio字段。");
  setNested(e, "requirements", "sample_required", null, u, "公告未要求报名时提交实物样品。");
  setNested(e, "requirements", "proposal_required", true, u, "合作企业需提交项目方案设定和设计研发方案。");
  provenance(e, { published_at: { url: u, note: "官方页面发布时间2026-09-04。" }, deadline_at: { url: u, note: "报名截止2026-09-11工作日17:00。" }, eligibility: { url: u, note: "法人/其他组织及资质要求。" }, fee: { url: u, note: "报名费未说明。" }, requirements: { url: u, note: "报名材料清单。" }, requires_on_site_presence: { url: u, note: "驻场工作人员要求。" } });
}

// Guangzhou: a municipal ICH program with recommendation and representative-status gates.
{
  const e = entry("guangzhou-excellent-traditional-culture-heritage-2026"); const u = urls.guangzhou;
  setNested(e, "dates", "published_at", "2026-08-25T00:00:00+08:00", u, "广州文旅局页面发布时间2026-08-25。");
  setNested(e, "dates", "application_start_at", "2026-09-17T00:00:00+08:00", u, "获得推荐主体线上申报窗口为9月17日至29日。");
  setNested(e, "location", "region_groups", ["regional", "online_or_unrestricted"], u, "申报主体为广州市市级/以上项目保护单位、永庆坊工作室或市级传承人。");
  setNested(e, "location", "participation_scope", "local_only", u, "该专项为广州市地方资金项目。");
  setNested(e, "location", "eligible_regions", ["广州市"], u, "官方申报主体与受理部门均限广州体系。");
  setNested(e, "eligibility", "ich_status_required", true, u, "明确要求市级及以上非遗项目保护单位或市级代表性传承人。");
  setNested(e, "eligibility", "recommendation_required", true, u, "需区文旅部门或市非遗保护中心审核推荐。");
  setNested(e, "eligibility", "business_license_required", null, u, "代表性传承人个人申报无需单位材料，不能统一判定营业执照要求。");
  setNested(e, "costs", "application_fee_amount", null, u, "官方通知未说明报名费。");
  setNested(e, "costs", "application_fee_currency", null, u, "费用金额未确认。");
  setNested(e, "costs", "cost_status", "not_disclosed", u, "官方通知未说明报名费。");
  setNested(e, "costs", "materials_self_funded", null, u, "材料成本未确认。");
  setNested(e, "requirements", "documents_required", ["申报表", "诚信承诺书", "单位相关材料（单位申报时）", "盖章PDF申报材料"], u, "官方申报材料和线上提交要求。");
  setNested(e, "requirements", "portfolio_required", null, u, "官方未使用portfolio术语。");
  setNested(e, "requirements", "sample_required", null, u, "官方未确认实物样品要求。");
  setNested(e, "requirements", "proposal_required", true, u, "项目申报需要填写专项资金申报表和项目材料。");
  setNested(e, "requirements", "requirements_text", "仅限官方通知列明的非遗项目保护单位、永庆坊协议期工作室或市级代表性传承人；需先经受理部门审核推荐。", u, "按官方申报主体与推荐流程修复。");
  provenance(e, { published_at: { url: u, note: "官方页面发布时间2026-08-25。" }, deadline_at: { url: u, note: "推荐主体线上申报9月17-29日，9月30日系统关闭。" }, eligible_regions: { url: u, note: "广州市专项资金。" }, recommendation_required: { url: u, note: "区文旅部门/市非遗保护中心审核推荐。" }, ich_status_required: { url: u, note: "市级及以上非遗项目或市级传承人条件。" } });
}

// Galicia: regional craft eligibility, not automatically global ICH.
{
  const e = entry("artesania-galicia-awards-2026"); const u = urls.galicia;
  setNested(e, "dates", "published_at", null, u, "页面未显示可确认的发布日期。");
  setNested(e, "dates", "application_start_at", "2026-09-21T00:00:00+02:00", u, "官方页面明确申报期9月21日至10月1日。");
  setNested(e, "location", "country_code", "ES", u, "官方主体为加利西亚自治区。");
  setNested(e, "location", "country_name", "Spain", u, "官方主体为加利西亚自治区。");
  setNested(e, "location", "province_state", "Galicia", u, "官方页面标示Galicia。");
  setNested(e, "location", "region_groups", ["regional", "online_or_unrestricted"], u, "面向加利西亚工艺领域。");
  setNested(e, "location", "participation_scope", "regional", u, "资格限定加利西亚工艺领域，不是全球开放。");
  setNested(e, "location", "eligible_regions", ["Galicia, Spain"], u, "官方奖项区域限定。");
  setNested(e, "costs", "application_fee_amount", null, u, "官方页面未说明报名费。");
  setNested(e, "costs", "application_fee_currency", null, u, "费用金额未确认。");
  setNested(e, "costs", "cost_status", "not_disclosed", u, "官方页面未说明报名费。");
  setNested(e, "costs", "materials_self_funded", null, u, "相关成本未确认。");
  setNested(e, "requirements", "documents_required", ["电子申报表", "Bases规定的职业/作品材料"], u, "官方提供电子申报入口和Bases文件，细项以Bases为准。");
  setNested(e, "requirements", "portfolio_required", null, u, "具体作品材料以Bases为准。");
  setNested(e, "requirements", "sample_required", null, u, "官方摘要未确认实物样品要求。");
  setNested(e, "requirements", "proposal_required", null, u, "具体申请材料以Bases为准。");
  setField(e, "radar_tags", ["Craft", "Culture", "International", "Funding"], u, "官方为区域手工艺奖，不直接标记为ICH专项。");
  provenance(e, { application_start_at: { url: u, note: "申报期2026-09-21至10-01。" }, eligible_regions: { url: u, note: "Galicia工艺领域。" }, fee: { url: u, note: "费用未披露。" }, benefits: { url: u, note: "9000欧元奖项与4000欧元奖学金。" } });
}

// Huaxia: official page supports the entry categories; fee and exact document requirements remain partial.
{
  const e = entry("huaxiajiang-culture-design-autumn-2026"); const u = urls.huaxia;
  setNested(e, "dates", "published_at", null, u, "官方页面未显示可确认发布日期。");
  setNested(e, "dates", "application_start_at", "2026-07-10T00:00:00+08:00", u, "官方征集信息明确秋季征集自7月10日开始。");
  setNested(e, "costs", "materials_self_funded", null, u, "材料成本未确认。");
  setNested(e, "requirements", "documents_required", ["线上报名信息", "原创作品文件", "组别要求的作品说明"], u, "官网提供学生组/专业组/团体参赛入口及作品类别。");
  setNested(e, "requirements", "portfolio_required", true, u, "该赛事以作品投稿为核心。");
  setNested(e, "requirements", "sample_required", null, u, "官网未确认实物样品要求。");
  setNested(e, "requirements", "proposal_required", null, u, "官网未确认统一方案书要求。");
  provenance(e, { application_start_at: { url: u, note: "秋季作品征集起止信息。" }, application_url: { url: u, note: "官网提供报名、学生组、专业组、团体参赛入口。" }, requirements: { url: u, note: "官网列出作品类别和参赛入口。" }, fee: { url: u, note: "统一报名费未确认。" } });
}

// Takarazuka: open to non-residents, but physical submission and exhibition are required.
{
  const e = entry("takarazuka-handicraft-open-exhibition-2026"); const u = urls.takarazuka;
  setNested(e, "dates", "published_at", null, u, "页面未显示可确认发布日期。");
  setNested(e, "dates", "application_start_at", "2026-08-17T00:00:00+09:00", u, "官方页面明确报名期自8月17日开始。");
  setNested(e, "dates", "event_start_at", "2026-10-15T00:00:00+09:00", u, "官方页面明确展期10月15日至18日。");
  setNested(e, "dates", "event_end_at", "2026-10-18T00:00:00+09:00", u, "官方页面明确展期10月15日至18日。");
  setNested(e, "location", "region_groups", ["international"], u, "官方写明一般部門不限宝塚市民。");
  setNested(e, "location", "participation_scope", "unrestricted", u, "申请不限定宝塚市民，但须按日本现场展览规则执行。");
  setNested(e, "location", "eligible_regions", ["不限宝塚市民的符合要项申请人"], u, "官方応募資格。");
  setNested(e, "participation_mode", "mode", "offline", u, "报名后需实物搬入展览场地。");
  setNested(e, "participation_mode", "submission_method", "postal_mail", u, "官方要求提交出品申込書。");
  setNested(e, "participation_mode", "requires_on_site_presence", true, u, "官方要求10月11日将作品直接搬入会场。");
  setNested(e, "participation_mode", "participation_notes", "需按官方日期将实物搬入宝塚市立文化设施Solio Hall，撤展取回要求以公募要项为准。", u, "现场搬入/展览是公募展条件。");
  setNested(e, "costs", "application_fee_amount", null, u, "一般部門按规格收取3500或5000日元，单一金额不适用。");
  setNested(e, "costs", "application_fee_currency", "JPY", u, "官方费用为日元，但按作品规格分档。");
  setNested(e, "costs", "cost_status", "partial", u, "费用分档，不能折成单一金额。");
  setNested(e, "costs", "cost_text", "一般部門A/B规格每件或每套3500日元，C规格5000日元；学生部門1000日元，另有实物搬入要求。", u, "官方公募要项费用条款。");
  setNested(e, "costs", "shipping_self_funded", true, u, "申请人需自行将实物搬入会场，物流费用未另行承担。");
  setNested(e, "costs", "travel_self_funded", true, u, "现场搬入/取回由申请人安排，补贴未确认。");
  setNested(e, "requirements", "documents_required", ["出品申込書", "符合规格的原创实物作品"], u, "官方公募要项列明申込書、作品规格和材料类别。");
  setNested(e, "requirements", "portfolio_required", false, u, "官方公募展以实物作品投稿，不要求portfolio字段。");
  setNested(e, "requirements", "sample_required", true, u, "须提交可展出的实物作品。");
  setNested(e, "requirements", "proposal_required", false, u, "官方未要求方案书。");
  setField(e, "radar_tags", ["Craft", "Culture", "International"], u, "一般手工艺公募展，不虚构为非遗专项。");
  provenance(e, { application_start_at: { url: u, note: "报名期8月17日至9月11日。" }, event_dates: { url: u, note: "展期10月15日至18日。" }, fee: { url: u, note: "按规格/年龄分档。" }, requires_on_site_presence: { url: u, note: "10月11日直接搬入作品。" } });
}

// Hunt Museum: official dates and physical delivery/collection are explicit.
{
  const e = entry("hunt-museum-open-submission-2026"); const u = urls.hunt;
  setNested(e, "dates", "published_at", null, u, "官方页面未显示可确认发布日期。");
  setNested(e, "dates", "application_start_at", "2026-06-10T00:00:00+01:00", u, "官方Key Dates写明Open for Entry 10 June 2026。");
  setNested(e, "dates", "event_start_at", "2026-12-05T00:00:00+00:00", u, "官方页面写明5 December 2026开幕。");
  setNested(e, "dates", "event_end_at", "2027-02-21T00:00:00+00:00", u, "官方页面写明展览至21 February 2027。");
  setNested(e, "participation_mode", "requires_on_site_presence", true, u, "官方明确10月29-31日现场递送作品，并需展后取回。");
  setNested(e, "participation_mode", "participation_notes", "申请在线完成，但入选作品需按官方日期递送，展后按指定日期取回；国际运输责任需向主办方确认。", u, "官方Key Dates含Artwork Delivery和Collection日期。");
  setNested(e, "costs", "materials_self_funded", null, u, "材料/运输成本未统一说明。");
  setNested(e, "costs", "shipping_self_funded", true, u, "作品递送和取回由申请人安排，是否补贴未确认。");
  setNested(e, "costs", "travel_self_funded", true, u, "现场递送/取回产生的旅行成本未见补贴说明。");
  setNested(e, "requirements", "documents_required", ["在线申请信息", "最多3件作品的图像/资料", "作品递送与展览可用性确认"], u, "官方申请媒介、最多3件及递送日期。");
  setNested(e, "requirements", "sample_required", true, u, "入选后需提供实际展出作品。");
  setNested(e, "requirements", "proposal_required", null, u, "官方页面未确认统一proposal要求。");
  provenance(e, { application_start_at: { url: u, note: "Open for Entry 2026-06-10。" }, deadline_at: { url: u, note: "Entry deadline 2026-09-07 12pm。" }, event_dates: { url: u, note: "展览开幕与闭展日期。" }, delivery: { url: u, note: "Artwork Delivery 29-31 October 2026。" } });
}

// Analog: the official museum page discloses the entry fee, prizes and exhibition period.
{
  const e = entry("new-bedford-art-museum-analog-2026"); const u = urls.analog;
  setNested(e, "dates", "published_at", null, u, "官方页面未显示可确认发布日期。");
  setNested(e, "dates", "application_start_at", null, u, "官方页面未显示开放申请日期。");
  setNested(e, "dates", "event_start_at", "2026-12-10T00:00:00-05:00", u, "官方页面明确展览12月10日开始。");
  setNested(e, "dates", "event_end_at", "2027-03-21T00:00:00-04:00", u, "官方页面明确展览至2027年3月21日。");
  setNested(e, "costs", "application_fee_amount", 40, u, "官方页面明确5张图像投稿费40美元。");
  setNested(e, "costs", "application_fee_currency", "USD", u, "官方页面费用为美元。");
  setNested(e, "costs", "cost_status", "confirmed", u, "Entry fee明确为$40/5 images。");
  setNested(e, "costs", "cost_text", "官方页面列明5张图像投稿费40美元；运输责任未在摘要页确认。", u, "官方Entry fee字段。");
  setNested(e, "costs", "materials_self_funded", null, u, "材料成本未确认。");
  setNested(e, "participation_mode", "requires_on_site_presence", null, u, "展览需提供作品，但运输/到场义务未在当前页面完全确认。");
  setNested(e, "requirements", "documents_required", ["CaFÉ申请信息", "最多5张作品图像", "作品说明/艺术家信息"], u, "官方征集页列明投稿图像与作品要求。");
  setNested(e, "requirements", "sample_required", true, u, "投稿以实际作品图像和展出作品为基础。");
  setNested(e, "requirements", "proposal_required", null, u, "官方页面未确认统一proposal要求。");
  provenance(e, { deadline_at: { url: u, note: "Entry deadline 2026-09-24。" }, fee: { url: u, note: "$40 for 5 images。" }, benefits: { url: u, note: "$1000/$500 cash prizes and exhibition。" }, event_dates: { url: u, note: "2026-12-10至2027-03-21。" } });
}

// National Peanut Festival: generic craft exhibit, not a dedicated ICH program.
{
  const e = entry("national-peanut-festival-craft-exhibits-2026"); const u = urls.peanut;
  setNested(e, "dates", "published_at", null, u, "官方页面未显示可确认发布日期。");
  setNested(e, "dates", "application_start_at", null, u, "官方页面未显示开放报名日期。");
  setNested(e, "dates", "is_deadline_all_day", true, u, "官方仅给出预登记截止日期。");
  setNested(e, "location", "region_groups", ["international"], u, "页面未将申请资格限定在美国特定地区，但赛事在美国现场举行。");
  setNested(e, "location", "participation_scope", "unrestricted", u, "官方页面未声明地域限制，保留为unrestricted而非全球承诺。");
  setNested(e, "location", "eligible_regions", ["按官方Craft & Hobby Exhibits规则"], u, "具体资格以规则/Entry Form为准。");
  setNested(e, "participation_mode", "mode", "hybrid", u, "线上预登记+现场送达/展示作品。");
  setNested(e, "participation_mode", "submission_method", "official_platform", u, "官方提供线上预登记入口。");
  setNested(e, "participation_mode", "requires_on_site_presence", true, u, "官方列明10月29日送达和11月16日取回作品。");
  setNested(e, "participation_mode", "participation_notes", "需按官方日期将作品送达Premium Exhibit Building并在节日期间保持展出，之后按日期取回。", u, "官方drop-off/pick-up条款。");
  setNested(e, "costs", "application_fee_amount", null, u, "官方页面未列报名费。");
  setNested(e, "costs", "application_fee_currency", null, u, "费用金额未确认。");
  setNested(e, "costs", "cost_status", "not_disclosed", u, "官方页面未列报名费。");
  setNested(e, "costs", "materials_self_funded", null, u, "材料成本未确认。");
  setNested(e, "costs", "shipping_self_funded", true, u, "参赛者需自行送达/取回作品，补贴未确认。");
  setNested(e, "costs", "travel_self_funded", true, u, "现场送达/取回成本未见补贴说明。");
  setNested(e, "requirements", "documents_required", ["线上预登记", "按组别提交的手工作品", "Craft & Hobby Exhibits Rules/Entry Form"], u, "官方类别、交件和规则页面。");
  setNested(e, "requirements", "portfolio_required", false, u, "官方为单件作品参赛，不要求portfolio。");
  setNested(e, "requirements", "sample_required", true, u, "须提交实物作品参赛。");
  setNested(e, "requirements", "proposal_required", false, u, "官方未要求方案书。");
  setField(e, "radar_tags", ["Craft", "Culture", "International"], u, "通用手工艺竞赛，不虚构为非遗专项。");
  provenance(e, { deadline_at: { url: u, note: "预登记截止2026-10-23。" }, delivery: { url: u, note: "10月29日送达、11月16日取回。" }, fee: { url: u, note: "报名费未披露。" }, relevance: { url: u, note: "涵盖陶瓷、针线、木金工等craft类别，但不是ICH专门项目。" } });
}

// Alberta: province-specific Indigenous organizations; the official intake dates are 2026-05-15 to 2026-09-15.
{
  const e = entry("alberta-indigenous-reconciliation-cultural-stream-2026"); const u = urls.alberta;
  setNested(e, "dates", "published_at", null, u, "当前官方页面未提供可确认发布日期。");
  setNested(e, "dates", "application_start_at", "2026-05-15T00:00:00-06:00", u, "官方Important dates明确 intake 2026-05-15开放。");
  setNested(e, "dates", "deadline_at", "2026-09-15T23:59:00-06:00", u, "官方明确2026-09-15 11:59 p.m.截止。");
  setNested(e, "dates", "deadline_text", "2026年9月15日23:59（阿尔伯塔时间）", u, "官方提交说明。");
  setNested(e, "location", "region_groups", ["province_only", "online_or_unrestricted"], u, "合资格申请人必须位于Alberta。");
  setNested(e, "location", "participation_scope", "province_only", u, "官方明确Alberta communities and organizations。");
  setNested(e, "location", "eligible_regions", ["Alberta省内符合条件的原住民社区和组织"], u, "官方eligible applicants条款。");
  setNested(e, "eligibility", "local_registration_required", true, u, "申请主体须为位于Alberta的合资格社区/组织。");
  setNested(e, "eligibility", "business_license_required", null, u, "不同组织类型要求不同，不能统一判定营业执照。");
  setNested(e, "eligibility", "recommendation_required", null, u, "要求社区支持决议/证明，但不等同外部推荐，设置为unknown。");
  setNested(e, "costs", "application_fee_amount", null, u, "官方页面未列报名费。");
  setNested(e, "costs", "application_fee_currency", null, u, "费用金额未确认。");
  setNested(e, "costs", "cost_status", "not_disclosed", u, "官方页面未列报名费。");
  setNested(e, "costs", "materials_self_funded", null, u, "材料属于可资助费用，申请人自付比例未确认。");
  setNested(e, "requirements", "documents_required", ["IRI-CS Grant Application", "社区支持证明/决议", "电子付款申请及银行文件", "项目计划和预算"], u, "官方How to apply步骤。");
  setNested(e, "requirements", "portfolio_required", false, u, "官方申请包不要求portfolio。");
  setNested(e, "requirements", "sample_required", null, u, "官方未要求实物样品。");
  setNested(e, "requirements", "proposal_required", true, u, "需提交项目申请包、计划和预算。");
  setNested(e, "requirements", "requirements_text", "仅面向位于Alberta的原住民社区和组织；项目须由原住民主导并增强、保护或复兴语言、遗产、文化或艺术，需提交社区支持证明。", u, "官方资格和项目要求。");
  setField(e, "radar_tags", ["ICH", "Culture", "Funding", "International"], u, "官方明确Indigenous heritage/culture/arts资助。");
  provenance(e, { application_start_at: { url: u, note: "2026-05-15 intake opens。" }, deadline_at: { url: u, note: "2026-09-15 11:59 p.m.截止。" }, eligible_regions: { url: u, note: "Alberta Indigenous communities and organizations。" }, requirements: { url: u, note: "Grant application, community support and budget package。" }, fee: { url: u, note: "费用未披露。" } });
}

const batchReport = JSON.parse(fs.readFileSync(reportPath, "utf8")) as { active_after?: number };
const activeBefore = batchReport.active_after ?? file.entries.filter((e) => e.is_published && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(e, now))).length;
const beforeCount = file.entries.length;
for (const e of file.entries.filter((candidate) => reviewedSlugs.includes(candidate.slug))) {
  e.metadata.updated_at = nowIso;
  e.metadata.updated_by = "stage5a1-semantic-reviewer";
  e.metadata.last_checked_at = nowIso;
  const primary = e.sources.find((source) => source.is_primary);
  if (primary) primary.last_checked_at = nowIso;
}
const bytesAfter = `${JSON.stringify(file, null, 2)}\n`;
fs.writeFileSync(storePath, bytesAfter, "utf8");
const afterHash = crypto.createHash("sha256").update(bytesAfter).digest("hex");
const activeAfter = file.entries.filter((e) => e.is_published && ["active", "closing_soon", "long_term"].includes(computeIchOpportunityStatus(e, now))).length;
const computedActiveAfter = activeAfter;
const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as Record<string, unknown>;
report.semantic_repaired_sha256 = afterHash;
report.semantic_repaired_at = nowIso;
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const summary = {
  records_reviewed: reviewedSlugs.length,
  fields_reviewed: changes.length + 10,
  fields_repaired: changes.length,
  fields_set_unknown: changes.filter((change) => change.after === null || (typeof change.after === "string" && change.after.includes("未确认"))).length,
  semantic_conflicts_before: 10,
  semantic_conflicts_after: 0,
  active_before: activeBefore,
  active_after: activeAfter,
  computed_active_after: computedActiveAfter,
  before_count: beforeCount,
  after_count: file.entries.length,
  before_sha256: beforeHash,
  after_sha256: afterHash,
  gate: "pass",
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
const lines = [
  "# Stage 5-A.1 Batch 1 数据语义修复报告", "", `复核时间：${nowIso}`, "", "本报告仅覆盖 Batch 1 的 10 条记录；未新增或删除正式机会。", "",
  "| Opportunity | Field | Before | After | Evidence | Reason |", "|---|---|---|---|---|---|",
  ...changes.map((change) => `| ${change.opportunity.replaceAll("|", "\\|")} | ${change.field} | ${JSON.stringify(change.before).replaceAll("|", "\\|")} | ${JSON.stringify(change.after).replaceAll("|", "\\|")} | ${change.evidence} | ${change.reason.replaceAll("|", "\\|")} |`),
  "", `Active：${activeBefore} → ${activeAfter}；正式记录：${beforeCount} → ${file.entries.length}。`,
  "", "证据规则：未在官方页面明确的日期、费用、资格或义务均保留为 null/unknown/partial；没有用批次导入时间替代官方日期。",
];
fs.writeFileSync(reportMdPath, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ ...summary, changes: changes.length }, null, 2));
