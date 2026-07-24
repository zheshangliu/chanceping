import type { BusinessEditionId } from "./edition-config";
import type { OpportunityCategory } from "./opportunity";
import { loadSourceRegistry } from "./data-pipeline";

export interface BusinessSource {
  id: string; name: string; officialUrl: string; editions: BusinessEditionId[]; categories: OpportunityCategory[];
  coverage: string; refreshCadence: "daily" | "weekly"; admissionPolicy: string; tier?: "p0" | "p1" | "p2"; role?: "official_fact" | "candidate_discovery" | "reference";
}

/** Official portals only. A portal is a discovery source, not public opportunity data by itself. */
export const BUSINESS_SOURCES: BusinessSource[] = [
  { id: "china-government-procurement", name: "中国政府采购网", officialUrl: "https://www.ccgp.gov.cn/", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["procurement"], coverage: "全国及地方政府采购公告", refreshCadence: "daily", admissionPolicy: "仅采纳可回到项目原文、采购状态可判断且与目标企业相关的公告。" },
  { id: "guangzhou-government", name: "广州市人民政府门户网站", officialUrl: "https://www.gz.gov.cn/", editions: ["guangzhou", "tianhe"], categories: ["policy", "procurement", "competition", "exhibition"], coverage: "广州市政策、通知与公开信息", refreshCadence: "daily", admissionPolicy: "仅采纳明确面向企业、可申报或可参与的官方通知。" },
  { id: "guangzhou-industry-information", name: "广州市工业和信息化局", officialUrl: "https://gxj.gz.gov.cn/", editions: ["guangzhou", "tianhe"], categories: ["policy", "competition", "procurement"], coverage: "中小企业、制造业与产业创新申报", refreshCadence: "daily", admissionPolicy: "优先采纳仍在申报期、面向中小企业且有明确材料或平台入口的通知。" },
  { id: "guangzhou-science-technology", name: "广州市科学技术局", officialUrl: "https://kjj.gz.gov.cn/", editions: ["guangzhou", "tianhe"], categories: ["policy", "competition"], coverage: "科技企业认定与科技项目申报", refreshCadence: "daily", admissionPolicy: "仅采纳申报批次未截止、适用对象和申报流程明确的官方通知。" },
  { id: "guangzhou-commerce", name: "广州市商务局", officialUrl: "https://sw.gz.gov.cn/xxgk/tzgg/index.html", editions: ["guangzhou", "tianhe"], categories: ["exhibition", "channel", "international", "policy"], coverage: "展贸、出海、渠道合作与商务资金", refreshCadence: "daily", admissionPolicy: "仅采纳存在报名、申报、征集或招募行动入口的通知。" },
  { id: "guangzhou-public-resources", name: "广州公共资源交易公共服务平台", officialUrl: "https://www.gzebpubservice.cn/", editions: ["guangzhou", "tianhe"], categories: ["procurement", "channel"], coverage: "工程、采购、产权与项目合作", refreshCadence: "daily", admissionPolicy: "仅采纳招标、资格预审、采购或合作方征集等行动公告；更正和结果仅用于更新。" },
  { id: "tianhe-government", name: "广州市天河区人民政府门户网站", officialUrl: "https://www.thnet.gov.cn/", editions: ["tianhe", "guangzhou"], categories: ["policy", "procurement", "competition"], coverage: "天河区政策、通知与公开信息", refreshCadence: "daily", admissionPolicy: "优先采纳天河区主体可行动且仍在有效期内的公告。" },
  { id: "shaoguan-government", name: "韶关市人民政府门户网站", officialUrl: "https://www.sg.gov.cn/", editions: ["shaoguan"], categories: ["policy", "procurement", "exhibition", "channel"], coverage: "韶关市政策、通知与公开信息", refreshCadence: "daily", admissionPolicy: "仅采纳具备明确受众、申报入口或项目行动信息的公告。" },
  { id: "canton-fair", name: "中国进出口商品交易会参展指引", officialUrl: "https://www.cantonfair.org.cn/zh-CN/customPages/exhibitorGuide", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["exhibition", "international", "channel"], coverage: "广交会参展、供采对接与国际渠道", refreshCadence: "weekly", admissionPolicy: "仅在当前申请窗口、常态化云展厅或明确开放活动时发布。", tier: "p1" },
  { id: "guangzhou-ndrc", name: "广州市发展和改革委员会", officialUrl: "https://fgw.gz.gov.cn/tzgg/index.html", editions: ["guangzhou", "tianhe"], categories: ["policy", "procurement"], coverage: "节能降碳、产业资金与项目征集", refreshCadence: "daily", admissionPolicy: "仅采纳有明确申报对象、期限或办理入口的通知。", tier: "p1" },
  { id: "guangdong-industry-information", name: "广东省工业和信息化厅", officialUrl: "https://gdii.gd.gov.cn/zwgk/tzgg1011/index.html", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["policy", "exhibition"], coverage: "省级制造业、专精特新与数字化项目", refreshCadence: "daily", admissionPolicy: "需本地受理口径时，仅在找到广州或韶关承接通知后发布。", tier: "p1" },
  { id: "guangdong-science-technology", name: "广东省科学技术厅", officialUrl: "https://gdstc.gd.gov.cn/zwgk_n/tzgg/index.html", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["policy", "competition", "international"], coverage: "省级科技计划、成果对接与国际合作", refreshCadence: "daily", admissionPolicy: "仅直接发布企业可申报事项；需属地推荐的先核验本地承接通知。", tier: "p1" },
  { id: "guangdong-procurement-center", name: "广东省政府采购中心", officialUrl: "https://gpcgd.gd.gov.cn/bsfw/cgxx/cgxxgg/index.html", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["procurement"], coverage: "省级政府采购与服务项目", refreshCadence: "daily", admissionPolicy: "以项目编号和采购人为键去重，仅发布当前响应期项目。", tier: "p1" },
  { id: "shaoguan-public-resources", name: "韶关市公共资源交易平台", officialUrl: "https://portal.ythpt.sg.gov.cn/zfcg", editions: ["shaoguan"], categories: ["procurement", "channel"], coverage: "韶关政府采购、工程与服务项目", refreshCadence: "daily", admissionPolicy: "仅采纳招标、采购、磋商等行动公告；结果页仅更新状态。", tier: "p1" },
  { id: "guangdong-government-policy", name: "广东省人民政府政策文件", officialUrl: "https://www.gd.gov.cn/zwgk/wjk/qbwj/index.html", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["policy"], coverage: "省级政策与产业制度", refreshCadence: "weekly", admissionPolicy: "仅在原文含明确对象、期限和办理入口时转为机会。", tier: "p1", role: "reference" },
  { id: "guangzhou-human-resources", name: "广州市人力资源和社会保障局", officialUrl: "https://rsj.gz.gov.cn/ywzt/rcgz/gzzc/tzgg/tzgg/index.html", editions: ["guangzhou", "tianhe"], categories: ["policy", "channel"], coverage: "人才、技能、培训与服务机构征集", refreshCadence: "weekly", admissionPolicy: "仅采纳企业、创业者或企业人才可行动事项。", tier: "p1" },
  { id: "guangdong-government-search", name: "广东省政府站内检索", officialUrl: "https://search.gd.gov.cn/", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["policy", "procurement", "competition", "exhibition", "channel", "international"], coverage: "广东全类型候选发现", refreshCadence: "daily", admissionPolicy: "仅生成候选；必须回到直接发布部门原文后才能发布。", tier: "p2", role: "candidate_discovery" },
  { id: "miit-discovery", name: "工业和信息化部政务公开", officialUrl: "https://www.miit.gov.cn/zwgk/", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["policy", "competition"], coverage: "国家级工业、数字化与示范项目候选", refreshCadence: "daily", admissionPolicy: "仅生成候选，优先等待广东或地市承接通知。", tier: "p2", role: "candidate_discovery" },
  { id: "ndrc-discovery", name: "国家发展和改革委员会通知公告", officialUrl: "https://www.ndrc.gov.cn/xwdt/tzgg/wap_index.html", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["policy", "channel"], coverage: "国家级产业、投资与示范项目候选", refreshCadence: "weekly", admissionPolicy: "仅生成候选，必须确认三地企业的直接行动路径。", tier: "p2", role: "candidate_discovery" },
  { id: "mofcom-discovery", name: "商务部政府信息公开", officialUrl: "https://www.mofcom.gov.cn/zfxxgk/index.html", editions: ["guangzhou", "tianhe", "shaoguan"], categories: ["international", "exhibition", "channel"], coverage: "全国外贸、展会与国际合作候选", refreshCadence: "weekly", admissionPolicy: "仅生成候选，必须回溯至广东、广州或官方主办方的直接行动通知。", tier: "p2", role: "candidate_discovery" },
];

function registryCategories(value: string): OpportunityCategory[] {
  const categories = new Set<OpportunityCategory>();
  if (/采购|招标|工程/.test(value)) categories.add("procurement");
  if (/政策|资金|补贴|认定|设备更新|人才/.test(value)) categories.add("policy");
  if (/赛事|大赛|征集/.test(value)) categories.add("competition");
  if (/展会|参展/.test(value)) categories.add("exhibition");
  if (/外贸|出口|跨境|国际/.test(value)) categories.add("international");
  if (/合作|招商|渠道|融资/.test(value)) categories.add("channel");
  return categories.size ? [...categories] : ["policy"];
}

/** The public catalogue is derived from the same 48-source registry used by collection. */
export function sourcesForEdition(edition: BusinessEditionId): BusinessSource[] {
  const legacy = BUSINESS_SOURCES.filter((source) => source.editions.includes(edition));
  const registry = loadSourceRegistry().sources.map((source): BusinessSource => ({
    id: source.sourceId, name: source.name, officialUrl: source.entryUrl, editions: ["guangzhou", "tianhe", "shaoguan"], categories: registryCategories(source.categories), coverage: source.categories,
    refreshCadence: source.frequency.includes("日") ? "daily" : "weekly", admissionPolicy: source.role === "candidate_discovery" ? "仅作候选发现；必须回到直接官方原文核验后才能公开。" : `仅采纳满足官方原文、字段核验和行动期要求的机会。${source.health ? ` 当前登记状态：${source.health}。` : ""}`,
    tier: source.priority.toLowerCase() as BusinessSource["tier"], role: source.role,
  }));
  return [...legacy, ...registry.filter((source) => !legacy.some((item) => item.officialUrl === source.officialUrl))];
}
