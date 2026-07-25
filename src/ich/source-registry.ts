import registry from "./source-registry.json";

export interface IchSourceRegistryEntry {
  source_id: string;
  source_name: string;
  official_url: string;
  source_type: string;
  country: string;
  province?: string;
  city?: string;
  covered_categories: string[];
  scan_frequency: "daily" | "every_3_days" | "weekly";
  adapter_type: "listing" | "search";
  auto_detect_suitability: "high" | "medium" | "low";
  requires_javascript: boolean;
  requires_login: boolean;
  active: boolean;
  verification_status: "confirmed_url" | "unconfirmed";
}

const supplemental: IchSourceRegistryEntry[] = [
  ["sz-culture","深圳市文化广电旅游体育局","https://wtl.sz.gov.cn/","city_government","中国","广东省","深圳市"],
  ["zj-culture","浙江省文化广电和旅游厅","https://ct.zj.gov.cn/","provincial_government","中国","浙江省"],
  ["js-culture","江苏省文化和旅游厅","https://wlt.jiangsu.gov.cn/","provincial_government","中国","江苏省"],
  ["fj-culture","福建省文化和旅游厅","https://wlt.fujian.gov.cn/","provincial_government","中国","福建省"],
  ["sc-culture","四川省文化和旅游厅","https://wlt.sc.gov.cn/","provincial_government","中国","四川省"],
  ["yn-culture","云南省文化和旅游厅","https://dct.yn.gov.cn/","provincial_government","中国","云南省"],
  ["sd-culture","山东省文化和旅游厅","https://whhly.shandong.gov.cn/","provincial_government","中国","山东省"],
  ["henan-culture","河南省文化和旅游厅","https://hct.henan.gov.cn/","provincial_government","中国","河南省"],
  ["shaanxi-culture","陕西省文化和旅游厅","https://whhlyt.shaanxi.gov.cn/","provincial_government","中国","陕西省"],
  ["xizang-culture","西藏自治区文化和旅游厅","https://wlt.xizang.gov.cn/","provincial_government","中国","西藏自治区"],
  ["sh-culture","上海市文化和旅游局","https://whlyj.sh.gov.cn/","city_government","中国","上海市"],
  ["bj-culture","北京市文化和旅游局","https://whlyj.beijing.gov.cn/","city_government","中国","北京市"],
  ["cq-culture","重庆市文化和旅游发展委员会","https://whlyw.cq.gov.cn/","city_government","中国","重庆市"],
  ["hunan-culture","湖南省文化和旅游厅","https://whhlyt.hunan.gov.cn/","provincial_government","中国","湖南省"],
  ["hubei-culture","湖北省文化和旅游厅","https://wlt.hubei.gov.cn/","provincial_government","中国","湖北省"],
  ["guizhou-culture","贵州省文化和旅游厅","https://whhly.guizhou.gov.cn/","provincial_government","中国","贵州省"],
  ["gx-culture","广西壮族自治区文化和旅游厅","http://wlt.gxzf.gov.cn/","provincial_government","中国","广西壮族自治区"],
  ["nmg-culture","内蒙古自治区文化和旅游厅","https://wlt.nmg.gov.cn/","provincial_government","中国","内蒙古自治区"],
  ["gd-procurement","广东政府采购智慧云平台","https://gdgpo.czt.gd.gov.cn/","procurement_platform","中国","广东省"],
  ["gz-ggzy","广州市公共资源交易平台","https://ggzy.gz.gov.cn/","procurement_platform","中国","广东省","广州市"],
  ["sz-ggzy","深圳公共资源交易平台","https://www.szggzy.com/","procurement_platform","中国","广东省","深圳市"],
  ["zj-procurement","浙江政府采购网","https://zfcg.czt.zj.gov.cn/","procurement_platform","中国","浙江省"],
  ["js-procurement","江苏政府采购网","http://www.ccgp-jiangsu.gov.cn/","procurement_platform","中国","江苏省"],
  ["sc-procurement","四川政府采购网","https://www.ccgp-sichuan.gov.cn/","procurement_platform","中国","四川省"],
  ["hb-procurement","湖北政府采购网","https://www.ccgp-hubei.gov.cn/","procurement_platform","中国","湖北省"],
  ["bj-procurement","北京市政府采购网","http://www.ccgp-beijing.gov.cn/","procurement_platform","中国","北京市"],
  ["sh-procurement","上海政府采购网","http://www.zfcg.sh.gov.cn/","procurement_platform","中国","上海市"],
  ["chnmuseum","中国国家博物馆","https://www.chnmuseum.cn/","museum","中国","北京市"],
  ["dpm","故宫博物院","https://www.dpm.org.cn/","museum","中国","北京市"],
  ["namoc","中国美术馆","https://www.namoc.org/","museum","中国","北京市"],
  ["gdmuseum","广东省博物馆","https://www.gdmuseum.org.cn/","museum","中国","广东省"],
  ["gdmoa","广东美术馆","https://www.gdmoa.org/","museum","中国","广东省"],
  ["szmuseum","深圳博物馆","https://www.shenzhenmuseum.com/","museum","中国","广东省","深圳市"],
  ["gz-museum","广州博物馆","https://www.guangzhoumuseum.cn/","museum","中国","广东省","广州市"],
  ["sh-museum","上海博物馆","https://www.shanghaimuseum.net/","museum","中国","上海市"],
  ["njmuseum","南京博物院","https://www.njmuseum.com/","museum","中国","江苏省"],
  ["szmuseum-suzhou","苏州博物馆","https://www.szmuseum.com/","museum","中国","江苏省","苏州市"],
  ["zjmuseum","浙江省博物馆","https://www.zhejiangmuseum.com/","museum","中国","浙江省"],
  ["hnmuseum","湖南博物院","https://www.hnmuseum.com/","museum","中国","湖南省"],
  ["cnaca","中国工艺美术协会","https://www.cnaca.org/","craft_association","中国"],
  ["cnacs","中国工艺美术学会","https://www.cnacs.net.cn/","craft_association","中国"],
  ["chinaich","中国非物质文化遗产保护协会","https://www.chinaich.org/","craft_association","中国"],
  ["cflas","中国民间文艺家协会","https://www.cflas.com.cn/","craft_association","中国"],
  ["bjdw","北京国际设计周","https://www.bjdw.org/","design_platform","中国","北京市"],
  ["sz-design","深圳设计周","https://www.sz.design/","design_platform","中国","广东省","深圳市"],
  ["cnicif","中国国际文化产业博览交易会","https://www.cnicif.com/","culture_expo","中国","广东省","深圳市"],
  ["wcc-europe","World Crafts Council Europe","https://wcc-europe.org/","craft_organization","欧洲"],
  ["dcci","Design & Crafts Council Ireland","https://www.dcci.ie/","craft_organization","爱尔兰"],
  ["craft-scotland","Craft Scotland","https://www.craftscotland.org/","craft_organization","英国","苏格兰"],
  ["american-craft","American Craft Council","https://craftcouncil.org/","craft_organization","美国"],
  ["kcdf","Korea Craft & Design Foundation","https://www.kcdf.kr/","craft_institution","韩国"],
  ["loewe-craft","LOEWE FOUNDATION Craft Prize","https://craftprize.loewefoundation.org/","craft_foundation","国际"],
  ["michelangelo","Michelangelo Foundation","https://www.michelangelofoundation.org/","craft_foundation","瑞士"],
  ["homofaber","Homo Faber Guide","https://www.homofaber.com/","craft_platform","欧洲"],
  ["eu-funding","EU Funding & Tenders Portal","https://funding-tenders.ec.europa.eu/","regional_fund","欧盟"],
  ["acc","Asian Cultural Council","https://www.asianculturalcouncil.org/","international_fund","美国"],
  ["british-council-arts","British Council Arts","https://arts.britishcouncil.org/","cultural_institution","英国"],
  ["callforentry","Call For Entry","https://www.callforentry.org/","discovery_platform","美国"],
  ["curatorspace","CuratorSpace Opportunities","https://www.curatorspace.com/opportunities/","discovery_platform","英国"],
  ["artconnect","ArtConnect Opportunities","https://www.artconnect.com/opportunities","discovery_platform","国际"],
  ["museum-association","英国博物馆协会","https://www.museumsassociation.org/","museum_association","英国"],
  ["australia-craft","Craft Victoria","https://craft.org.au/","craft_organization","澳大利亚"],
  ["craft-new-zealand","Objectspace","https://www.objectspace.org.nz/","craft_institution","新西兰"],
  ["taiwan-craft","台湾工艺研究发展中心","https://www.ntcri.gov.tw/","craft_institution","台湾地区"],
  ["hk-design-centre","香港设计中心","https://www.hkdesigncentre.org/","design_platform","香港"],
  ["macau-cultural","澳门文化局","https://www.icm.gov.mo/","cultural_institution","澳门"],
  ["korea-arts-council","韩国艺术委员会","https://www.arko.or.kr/","national_cultural_institution","韩国"],
  ["taiwan-culture","台湾文化部","https://www.moc.gov.tw/","national_government","台湾地区"],
  ["hongkong-arts","香港艺术发展局","https://www.hkadc.org.hk/","arts_council","香港"],
  ["macau-cultural-industry","澳门文化产业基金","https://www.fic.gov.mo/","cultural_fund","澳门"],
  ["unesco-forms","UNESCO ICH Forms and Deadlines","https://ich.unesco.org/en/forms","international_organization","国际"],
  ["eu-culture-calls","Creative Europe Culture Calls","https://culture.ec.europa.eu/creative-europe/creative-europe-culture","regional_fund","欧盟"],
  ["prince-claus-programs","Prince Claus Fund Programs","https://princeclausfund.org/apply","international_fund","荷兰"],
  ["on-the-move","On the Move","https://www.on-the-move.org/","discovery_platform","国际"],
  ["culture360-calls","ASEF culture360 Calls","https://culture360.asef.org/category/opportunities/","international_platform","亚洲"],
  ["res-artis-members","Res Artis Member Opportunities","https://resartis.org/members/","residency_network","国际"],
  ["transartists-open-calls","TransArtists Open Calls","https://www.transartists.org/en/open-calls","residency_directory","国际"],
  ["heritage-lottery","National Lottery Heritage Fund","https://www.heritagefund.org.uk/","heritage_fund","英国"],
  ["getty-foundation","Getty Foundation Grants","https://www.getty.edu/foundation/","international_fund","美国"],
  ["ford-culture","Ford Foundation Creativity","https://www.fordfoundation.org/","international_fund","美国"],
  ["unesco-culture","UNESCO Culture","https://www.unesco.org/en/culture","international_organization","国际"]
].map(([id, name, url, type, country, province, city]) => ({ source_id:id, source_name:name, official_url:url, source_type:type, country, province, city, covered_categories:["international"], scan_frequency:"every_3_days", adapter_type:"listing", auto_detect_suitability:"medium", requires_javascript:false, requires_login:false, active:false, verification_status:"unconfirmed" } as IchSourceRegistryEntry));

export function listIchSources(): IchSourceRegistryEntry[] {
  return [...registry.sources as IchSourceRegistryEntry[], ...supplemental];
}

export function listActiveIchSources(): IchSourceRegistryEntry[] {
  return listIchSources().filter((source) => source.active && source.verification_status === "confirmed_url");
}
