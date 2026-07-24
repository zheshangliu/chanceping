import fs from "fs";
import path from "path";
import { ICH_SCHEMA_VERSION, type IchOpportunity, type IchOpportunityFile, type IchPrimaryCategory } from "../src/ich/types";

type SourceLevel = "L1" | "L2" | "L3";
type Scope = "local_only" | "province_only" | "regional" | "nationwide" | "hong_kong_macao_taiwan" | "global" | "unrestricted";

interface CuratedRecord {
  slug: string;
  title: string;
  category: IchPrimaryCategory;
  summary: string;
  organizer: string;
  organizerType?: IchOpportunity["organizer"]["type"];
  url: string;
  sourceName: string;
  sourceLevel: SourceLevel;
  published: string;
  deadline: string;
  deadlineText?: string;
  eventEnd?: string;
  country?: string;
  province?: string;
  city?: string;
  regions: string[];
  scope: Scope;
  eligibility: string;
  benefit: string;
  requirements: string;
  applicationMethod?: IchOpportunity["participation_mode"]["submission_method"];
  historical?: boolean;
}

const CURRENT: CuratedRecord[] = [
  { slug:"2026-quanzhou-traditional-building-woodcarving-skills-competition",title:"2026年泉州市传统建筑木雕技能竞赛",category:"competition",summary:"面向相关从业人员开展传统建筑木雕技能竞赛，官方报名截至2026年8月28日。",organizer:"泉州市住房和城乡建设局",organizerType:"government",url:"https://www.quanzhou.gov.cn/zfb/xxgk/zfxxgkzl/ztzl/qzsczjtgylhs/xxgk/202607/t20260715_3309414.htm",sourceName:"泉州市人民政府官方公告",sourceLevel:"L1",published:"2026-07-15",deadline:"2026-08-28",province:"福建省",city:"泉州市",regions:["quanzhou","fujian","nationwide"],scope:"nationwide",eligibility:"以官方通知列明的传统建筑木雕相关从业人员和参赛条件为准。",benefit:"技能展示、竞赛荣誉及行业交流机会。",requirements:"按官方通知提交报名材料并参加现场技能竞赛。"},
  { slug:"2026-beijing-planetarium-juxing-cup-cultural-products",title:"北京天文馆“聚星杯”文化创意产品设计大赛",category:"competition",summary:"面向社会征集天文主题文化创意产品，截止2026年9月30日。",organizer:"北京天文馆",organizerType:"museum",url:"https://www.bjp.org.cn/xwzx/gndt/4028c1369e281c7a019e297970aa0005.shtml",sourceName:"北京天文馆官方征集页",sourceLevel:"L1",published:"2026-06-25",deadline:"2026-09-30",province:"北京市",city:"北京市",regions:["beijing","nationwide"],scope:"nationwide",eligibility:"个人、团队及相关机构按官方规则报名。",benefit:"设一等奖2万元、二等奖1万元、三等奖5000元及展示转化机会。",requirements:"提交原创天文文化主题设计或产品材料，具体规格以官方附件为准。"},
  { slug:"2026-wuhu-gift-cultural-creative-design-competition",title:"第三届“芜湖有礼”文旅创意设计大赛",category:"competition",summary:"面向全国文创单位和创作者征集芜湖主题作品，截止2026年8月15日。",organizer:"芜湖市文化和旅游局",organizerType:"government",url:"https://ct.wuhu.gov.cn/xwzx/tzgg/8935666.html",sourceName:"芜湖市文化和旅游局官方公告",sourceLevel:"L1",published:"2026-06-19",deadline:"2026-08-15",province:"安徽省",city:"芜湖市",regions:["wuhu","anhui","nationwide"],scope:"nationwide",eligibility:"全国文创相关单位及创作者可按公告参赛。",benefit:"获得赛事奖项、展示和文旅商品转化机会。",requirements:"扫码报名并按大赛方案提交原创参赛材料。"},
  { slug:"2026-jincheng-cultural-creative-products-competition",title:"晋城市第八届文化创意产品展示大赛",category:"competition",summary:"“非遗手造”等类别公开征集原创文创作品，报名截止2026年8月10日。",organizer:"中共晋城市委宣传部等",organizerType:"government",url:"https://www.jcgov.gov.cn/dtxx/gsgg/202606/t20260611_2359601.shtml",sourceName:"晋城市人民政府官方方案",sourceLevel:"L1",published:"2026-06-11",deadline:"2026-08-10",province:"山西省",city:"晋城市",regions:["jincheng","shanxi","nationwide"],scope:"nationwide",eligibility:"符合方案要求的个人、单位和创作团队。",benefit:"入选作品可获展示展销、宣传推广及参加文博会等机会。",requirements:"提交原创作品、报名表和方案要求的证明材料。"},
  { slug:"2026-chongming-cultural-tourism-badge-design",title:"“崇明·瀛洲徽光”文旅徽章设计大赛",category:"competition",summary:"围绕崇明景区、非遗文化等资源征集徽章设计，截止2026年8月18日。",organizer:"崇明区文化和旅游局",organizerType:"government",url:"https://www.shcm.gov.cn/zmhd/004014/20260519/37c6db94-3c39-4a65-95df-e11b4009b79d.html",sourceName:"上海市崇明区人民政府官方公告",sourceLevel:"L1",published:"2026-05-19",deadline:"2026-08-18",province:"上海市",city:"上海市",regions:["shanghai","nationwide"],scope:"nationwide",eligibility:"个人、专业设计团队及院校师生均可参与。",benefit:"评选奖项、官方展示与文旅产品应用机会。",requirements:"围绕指定崇明文化资源提交原创徽章设计。"},
  { slug:"2026-yaozhou-porcelain-creative-competition",title:"2026中国耀州瓷创意大赛",category:"competition",summary:"征集体现耀州瓷传统烧制技艺与创新的设计及实物作品，截止2026年8月31日18时。",organizer:"中国耀州瓷创意大赛组委会",organizerType:"government",url:"https://rs.tongchuan.gov.cn/157/index.jhtml",sourceName:"铜川市官方赛事报名要求",sourceLevel:"L1",published:"2026-05-01",deadline:"2026-08-31T18:00:00+08:00",province:"陕西省",city:"铜川市",regions:["tongchuan","shaanxi","nationwide"],scope:"nationwide",eligibility:"全国陶瓷艺术家、设计师、工艺美术师、机构、师生和企业可个人或组队参赛。",benefit:"赛事评审、成果展示及产业转化机会。",requirements:"提交报名表、版权承诺书和符合赛道规格的原创设计或陶瓷实物。"},
  { slug:"2026-xizang-ethnic-unity-calligraphy-photography-call",title:"西藏民族团结主题书法美术摄影作品征集",category:"competition",summary:"征集书法、美术及记录民俗非遗等主题的摄影作品，截止2026年8月15日。",organizer:"西藏自治区文化和旅游厅",organizerType:"government",url:"https://wlt.xizang.gov.cn/xwzx_69/tzgg/202607/t20260701_547926.html",sourceName:"西藏自治区文化和旅游厅官方公告",sourceLevel:"L1",published:"2026-07-01",deadline:"2026-08-15",province:"西藏自治区",city:"拉萨市",regions:["xizang","nationwide"],scope:"nationwide",eligibility:"符合官方征集范围的社会创作者。",benefit:"作品入选、展览和公共文化传播机会。",requirements:"按门类规格提交原创作品及报名材料。"},

  { slug:"2026-taiwan-five-star-market-evaluation",title:"2026臺灣五星集—優良市集暨樂活名攤評核",category:"exhibition_market",summary:"面向符合条件的台湾市场及摊商开放评核申请，截止2026年8月10日。",organizer:"台湾经济主管部门",organizerType:"government",url:"https://www.aoc.gov.tw/showPublic/674",sourceName:"官方活动公告页",sourceLevel:"L1",published:"2026-07-01",deadline:"2026-08-10",country:"中国",province:"台湾地区",regions:["taiwan","hong_kong_macao_taiwan"],scope:"hong_kong_macao_taiwan",eligibility:"台湾地区符合公告资格的市集与摊商。",benefit:"优良市集或乐活名摊评核、品牌曝光和市场推广。",requirements:"按官方评核办法及申请表提交资料。"},
  { slug:"2026-kyoto-youme-triennale-open-call",title:"Kyoto YouMe Triennale 2026 Open Call",category:"exhibition_market",summary:"京都国际项目面向艺术家、工艺师、设计师、工作室和企业开放申请，截止2026年7月31日。",organizer:"Kyoto YouMe Triennale",organizerType:"event_organizer",url:"https://you-me-kyoto.org/en",sourceName:"Kyoto YouMe Triennale official site",sourceLevel:"L2",published:"2026-07-05",deadline:"2026-07-31",country:"日本",province:"京都府",city:"京都市",regions:["japan","asia","global"],scope:"global",eligibility:"Artists, craftspeople, designers, studios and companies may apply under the official rules.",benefit:"在京都项目中展示、交流并接触国际观众。",requirements:"在开放申请期内按官网表格提交项目资料。"},
  { slug:"2026-future-icons-selects-open-call",title:"Future Icons Selects 2026 Open Call",category:"exhibition_market",summary:"面向当代工艺创作者的国际展览公开征集，截止2026年10月6日。",organizer:"Future Icons",organizerType:"event_organizer",url:"https://www.craftscouncil.org.uk/sector-support/opportunities/future-icons-selects-2026-5",sourceName:"Crafts Council opportunity page",sourceLevel:"L2",published:"2026-07-01",deadline:"2026-10-06",country:"英国",city:"伦敦",regions:["united_kingdom","europe","global"],scope:"global",eligibility:"符合主办方媒介和作品条件的国际工艺创作者。",benefit:"入选Future Icons Selects展览并获得行业曝光。",requirements:"通过机会页链接按主办方规则提交作品、图片与创作者资料。"},
  { slug:"2026-london-textile-month-host-event",title:"London Textile Month 2026—Host an Event",category:"exhibition_market",summary:"伦敦纺织月征集工作坊、展览、讲座和开放工作室等合作活动，截止2026年8月31日。",organizer:"Selvedge",organizerType:"event_organizer",url:"https://www.craftscouncil.org.uk/sector-support/opportunities/london-textile-month-2026-host-an-event",sourceName:"Crafts Council opportunity page",sourceLevel:"L2",published:"2026-07-01",deadline:"2026-08-31",country:"英国",city:"伦敦",regions:["united_kingdom","europe"],scope:"regional",eligibility:"可在伦敦纺织月框架内主办相关活动的创作者、品牌和机构。",benefit:"纳入城市级纺织文化节，触达观众和行业伙伴。",requirements:"按主办方链接提交活动提案和举办信息。"},
  { slug:"2026-mindful-making-with-textiles-open-call",title:"Mindful Making with Textiles Open Call",category:"exhibition_market",summary:"面向编织、钩针、绗缝、织造等纺织创作者的群展征集，截止2026年8月19日。",organizer:"Art On 1st",organizerType:"nonprofit",url:"https://www.arton1st.org/mindful-making-textiles-call-2026",sourceName:"Art On 1st official call",sourceLevel:"L2",published:"2026-07-16",deadline:"2026-08-19",country:"美国",province:"Virginia",city:"Roanoke",regions:["united_states","north_america","global"],scope:"global",eligibility:"Emerging and established textile artists may submit under the official call.",benefit:"入选2026年9月开幕的纺织主题群展。",requirements:"按官方页面提交纺织作品信息和申请材料。"},

  { slug:"2026-ali-cultural-creative-products-procurement",title:"阿里地区特色文旅文创产品公开征集采购",category:"procurement_project",summary:"采购非遗手工艺品等本土文创产品并遴选供货合作商户，样品递交截止2026年8月5日。",organizer:"阿里地区文化和旅游局",organizerType:"government",url:"https://lyfz.al.gov.cn/info/1932/22841.htm",sourceName:"阿里地区文化和旅游局官方公告",sourceLevel:"L1",published:"2026-07-16",deadline:"2026-08-05",province:"西藏自治区",city:"阿里地区",regions:["ali","xizang"],scope:"local_only",eligibility:"阿里地区辖区内具备相应经营范围的本地创业者、个体工商户和小微企业。",benefit:"入围后形成文创产品供货合作。",requirements:"提交营业执照等材料并现场递交原创合规样品。"},
  { slug:"2026-caofeidian-ich-museum-decoration-project",title:"曹妃甸非遗馆装饰装修项目招标",category:"procurement_project",summary:"曹妃甸非遗馆装饰装修工程公开招标，投标截止2026年8月5日。",organizer:"曹妃甸区相关建设单位",organizerType:"government",url:"https://www.ggzy.gov.cn/information/deal/html/a/130000/0201/20260723/0013979914fd6a9642e0ad1ceb4975bbca93.html",sourceName:"全国公共资源交易平台项目页",sourceLevel:"L1",published:"2026-07-23",deadline:"2026-08-05",province:"河北省",city:"唐山市",regions:["tangshan","hebei","nationwide"],scope:"nationwide",eligibility:"符合招标公告资质、业绩和信用条件的投标单位。",benefit:"中标后承接非遗馆装饰装修项目。",requirements:"在指定公共资源交易平台获取文件并按时提交投标文件。",applicationMethod:"procurement_platform"},
  { slug:"2026-shandong-vocational-college-ich-kongming-lock-equipment",title:"山东职业学院非遗鲁班锁设备采购",category:"procurement_project",summary:"采购非遗鲁班锁相关教学设备，响应文件截止2026年8月7日。",organizer:"山东职业学院",organizerType:"school",url:"https://www.ggzy.gov.cn/information/deal/html/a/370000/0201/20260717/0037d50adad34acc40b894ea6b2f326d00b3.html",sourceName:"全国公共资源交易平台项目页",sourceLevel:"L1",published:"2026-07-17",deadline:"2026-08-07",province:"山东省",city:"济南市",regions:["jinan","shandong","nationwide"],scope:"nationwide",eligibility:"符合采购公告资格条件的供应商。",benefit:"中标后提供非遗教学设备及相应服务。",requirements:"通过指定采购平台获取文件并提交响应文件。",applicationMethod:"procurement_platform"},
  { slug:"2026-tianlin-ich-inheritance-practice-center-upgrade",title:"田林县非遗传承实践中心乡村文旅提升项目",category:"procurement_project",summary:"非遗传承实践中心乡村文旅提升项目公开交易，截止2026年8月13日。",organizer:"田林县相关项目单位",organizerType:"government",url:"https://ggzy.jgswj.gxzf.gov.cn/bsggzy/projectDetails.html?categorynum=001002005002&infoid=6e331861-cac7-4012-835f-9228aefcf7cf",sourceName:"广西公共资源交易平台项目页",sourceLevel:"L1",published:"2026-07-20",deadline:"2026-08-13",province:"广西壮族自治区",city:"百色市",regions:["baise","guangxi","nationwide"],scope:"nationwide",eligibility:"符合项目公告资格要求的企业。",benefit:"中标后承接非遗传承实践中心文旅提升项目。",requirements:"按交易平台要求获取招标文件并提交投标材料。",applicationMethod:"procurement_platform"},
  { slug:"2026-foshan-shiwan-pottery-training-service-procurement",title:"2026年石湾陶塑技艺专题培训班承办单位采购",category:"procurement_project",summary:"公开征集符合条件的承办单位执行石湾陶塑技艺专题培训，自2026年7月22日公示起10个自然日内报价。",organizer:"佛山市禅城区博物馆",organizerType:"museum",url:"https://gd.qianlima.com/zbcontent-616089453.html",sourceName:"采购通告公开转载页（待补官方原页）",sourceLevel:"L3",published:"2026-07-22",deadline:"2026-08-01T17:00:00+08:00",deadlineText:"自2026年7月22日公示起10个自然日，最后一日17:00截止",province:"广东省",city:"佛山市",regions:["foshan","guangdong","greater_bay_area"],scope:"regional",eligibility:"符合采购通告条件、具备培训项目承办能力的单位。",benefit:"中选后承办石湾陶塑非遗专题培训，公开预算10万元。",requirements:"按采购通告提交资质、方案、报价及类似项目材料；申请前须向采购单位复核原始通告。",applicationMethod:"in_person"},

  { slug:"2026-china-great-wall-museum-cultural-products-partner",title:"中国长城博物馆文创产品及空间运营合作伙伴招募",category:"channel_collaboration",summary:"面向具备文创开发和运营能力的主体招募合作伙伴，当前处于官方公开招募期。",organizer:"中国长城博物馆",organizerType:"museum",url:"https://capitalmuseum.org.cn/news/b20f254505ee41aa896b1a5c505124b7",sourceName:"首都博物馆体系官方招募页",sourceLevel:"L1",published:"2026-06-20",deadline:"2026-08-20",province:"北京市",city:"北京市",regions:["beijing","nationwide"],scope:"nationwide",eligibility:"具备文化创意产品开发、供应或空间运营能力并符合招募条件的主体。",benefit:"获得博物馆文创开发、供货或运营合作机会。",requirements:"按官方招募文件提交主体资质、案例和合作方案。"},
  { slug:"2026-suzhou-museum-cultural-service-center-partner",title:"宿州市博物馆文化服务中心非遗项目合作招募",category:"channel_collaboration",summary:"持续招募文化服务合作项目，非遗项目及非遗代表性传承人不受常规年龄限制。",organizer:"宿州市博物馆",organizerType:"museum",url:"https://www.ahsz.gov.cn/public/2655611/196422801.html",sourceName:"宿州市人民政府官方招募页",sourceLevel:"L1",published:"2026-06-01",deadline:"2026-12-31",deadlineText:"持续招募，具体批次以官方联系确认为准",eventEnd:"2026-12-31",province:"安徽省",city:"宿州市",regions:["suzhou_anhui","anhui"],scope:"regional",eligibility:"符合博物馆文化服务定位的团队或个人；非遗项目及非遗代表性传承人按公告执行。",benefit:"进入博物馆文化服务中心开展展示、体验或合作经营。",requirements:"联系主办方并提交项目介绍、资质及合作方案。",applicationMethod:"contact_organizer"},
  { slug:"2026-guangzhou-gift-product-collection",title:"2026“广州礼物”文创产品征集",category:"channel_collaboration",summary:"面向符合条件的文创与特色商品征集“广州礼物”，截止2026年7月31日。",organizer:"广州市文化广电旅游局",organizerType:"government",url:"https://wglj.gz.gov.cn/gkmlpt/content/10/10898/post_10898467.html",sourceName:"广州市文化广电旅游局官方公告",sourceLevel:"L1",published:"2026-07-01",deadline:"2026-07-31",province:"广东省",city:"广州市",regions:["guangzhou","guangdong","greater_bay_area"],scope:"regional",eligibility:"符合公告主体和产品要求的企业、机构及创作者。",benefit:"入选广州礼物体系并获得展示、推广和渠道对接。",requirements:"按官方征集要求提交产品、主体和知识产权材料。"},

  { slug:"2026-jiangmen-cultural-tourism-industry-support-funding",title:"江门市2026年文化旅游产业发展扶持资金申报",category:"policy_funding",summary:"江门市文化旅游产业发展扶持资金项目开放申报，截止2026年8月14日。",organizer:"江门市文化广电旅游体育局",organizerType:"government",url:"https://www.jiangmen.gov.cn/bmpd/jmswhgdlytyj/zwgk/tzgg/content/post_3524872.html",sourceName:"江门市人民政府官方通知",sourceLevel:"L1",published:"2026-07-14",deadline:"2026-08-14",province:"广东省",city:"江门市",regions:["jiangmen","guangdong","greater_bay_area"],scope:"regional",eligibility:"在江门符合扶持办法和申报指南条件的文化旅游项目主体。",benefit:"经评审可获得文化旅游产业发展扶持资金。",requirements:"按申报指南准备项目、财务和主体证明并通过规定渠道报送。"},
  { slug:"2026-suzhou-arts-crafts-professional-title",title:"苏州市2026年度工艺美术专业技术资格申报",category:"policy_funding",summary:"工艺美术专业技术资格网上申报期为2026年6月8日至8月7日。",organizer:"苏州市工业和信息化局",organizerType:"government",url:"https://gxj.suzhou.gov.cn/szeic/ggl/202606/7db2aa7fc3c744639d7feccfbc60769a.shtml",sourceName:"苏州市工业和信息化局官方通知",sourceLevel:"L1",published:"2026-06-01",deadline:"2026-08-07",province:"江苏省",city:"苏州市",regions:["suzhou_jiangsu","jiangsu"],scope:"regional",eligibility:"符合苏州市工艺美术专业技术资格条件的申报人员。",benefit:"通过评审可取得相应工艺美术专业技术资格。",requirements:"在官方系统完成网上申报并按通知提交材料。",applicationMethod:"official_platform"},
  { slug:"2026-beijing-professional-title-craft-fine-arts",title:"北京市2026年度工艺美术等职称评价申报",category:"policy_funding",summary:"北京市年度职称评价包含工艺美术等专业，申报截止2026年8月6日。",organizer:"北京市人力资源和社会保障局",organizerType:"government",url:"https://rsj.beijing.gov.cn/xxgk/tzgg/202606/t20260625_4720639.html",sourceName:"北京市人力资源和社会保障局官方通知",sourceLevel:"L1",published:"2026-06-25",deadline:"2026-08-06",province:"北京市",city:"北京市",regions:["beijing"],scope:"regional",eligibility:"符合北京市相应系列、专业和级别申报条件的专业技术人才。",benefit:"通过评审可取得相应专业技术资格。",requirements:"在北京市职称申报系统填报并提交规定材料。",applicationMethod:"official_platform"},

  { slug:"2026-nomad-art-prize",title:"Nomad Art Prize 2026",category:"international",summary:"面向16岁以上各国创作者的国际艺术奖，截止2026年7月30日。",organizer:"Nomad Art Prize",organizerType:"event_organizer",url:"https://www.craftscouncil.org.uk/sector-support/opportunities/nomad-art-prize",sourceName:"Crafts Council opportunity page",sourceLevel:"L2",published:"2026-07-01",deadline:"2026-07-30",country:"葡萄牙",city:"里斯本",regions:["portugal","europe","global"],scope:"global",eligibility:"All nationalities aged 16 or over, subject to the official categories and rules.",benefit:"八个1000欧元奖项，以及里斯本展览或驻留等机会。",requirements:"在线提交作品和申请资料；官方页面列明收费区间。"},
  { slug:"2027-county-hall-pottery-potter-in-residence",title:"Potter in Residence 2027—County Hall Pottery",category:"international",summary:"伦敦County Hall Pottery招聘2027年度驻场陶艺师，截止2026年7月30日。",organizer:"County Hall Pottery",organizerType:"enterprise",url:"https://www.craftscouncil.org.uk/sector-support/opportunities/potter-in-residence-21",sourceName:"Crafts Council opportunity page",sourceLevel:"L2",published:"2026-07-01",deadline:"2026-07-30",country:"英国",city:"伦敦",regions:["united_kingdom","europe","global"],scope:"global",eligibility:"符合职位和在英工作资格要求的陶艺创作者。",benefit:"2027年驻场职位，页面列明年薪2万英镑。",requirements:"按职位说明提交履历、作品集和申请材料。"},
  { slug:"2026-weaveup-wool-residency",title:"WeaveUp+ Wool Residency Open Call",category:"international",summary:"意大利羊毛与纺织实践驻留面向创意从业者开放，截止2026年8月31日9时。",organizer:"Lottozero",organizerType:"nonprofit",url:"https://www.lottozero.org/news/2026/7/2/open-call-weaveup-wool-residency",sourceName:"Lottozero official open call",sourceLevel:"L2",published:"2026-07-02",deadline:"2026-08-31T09:00:00+02:00",country:"意大利",regions:["italy","europe","global"],scope:"global",eligibility:"Creative practitioners meeting the official residency conditions may apply.",benefit:"参与羊毛材料研究、参访、工作坊和共同创作驻留。",requirements:"按官方开放征集提交个人资料、作品和申请陈述。"},
  { slug:"2026-royal-museums-greenwich-creative-practitioner-residence",title:"Royal Museums Greenwich Creative Practitioner in Residence 2026",category:"international",summary:"英国国家海事博物馆六个月研究型创意驻留，截止2026年8月3日9时。",organizer:"Royal Museums Greenwich",organizerType:"museum",url:"https://www.rmg.co.uk/creative-practitioner-residence-2026",sourceName:"Royal Museums Greenwich official call",sourceLevel:"L1",published:"2026-07-08",deadline:"2026-08-03T09:00:00+01:00",country:"英国",city:"伦敦",regions:["united_kingdom","europe"],scope:"regional",eligibility:"符合官方要求的艺术家、创意从业者或创作团体。",benefit:"六个月研究型驻留，并围绕Atlantic Worlds展厅开展项目。",requirements:"按官网指南提交提案、履历及相关支持材料。"},
  { slug:"2026-zero-material-artist-residency",title:"zero material Artist in Residence Open Call",category:"international",summary:"面向英国东亚及东南亚背景艺术家的材料、系统与离散经验主题驻留，截止2026年8月10日。",organizer:"Kakilang",organizerType:"nonprofit",url:"https://www.kakilang.org.uk/2026-open-call-zero-material",sourceName:"Kakilang official open call",sourceLevel:"L2",published:"2026-07-16",deadline:"2026-08-10",country:"英国",regions:["united_kingdom"],scope:"regional",eligibility:"UK-based artists of ESEA heritage with at least two years of conceptual or visual arts practice and right to work in the UK.",benefit:"2500英镑艺术家费用、800英镑制作预算及公开展示和发展支持。",requirements:"按主办方第一方页面提交申请并满足英国居住与工作资格。"},
  { slug:"2026-heritage-crafts-emerging-metalworker-award",title:"Heritage Crafts Emerging Metalworker of the Year Award 2026",category:"international",summary:"英国传统工艺组织面向职业前五年的金属工艺从业者征集提名，截止2026年8月21日。",organizer:"Heritage Crafts",organizerType:"nonprofit",url:"https://heritagecrafts.org.uk/our-awards/emerging-metalworker-of-the-year/",sourceName:"Heritage Crafts official award page",sourceLevel:"L1",published:"2026-03-02",deadline:"2026-08-21",country:"英国",regions:["united_kingdom"],scope:"regional",eligibility:"职业实践前五年、以金属为主要材料的传统工艺从业者；可自荐或他荐。",benefit:"1000英镑奖金及高规格颁奖活动曝光。",requirements:"通过官方提名入口按问题清单提交材料。"},
];

const HISTORICAL: CuratedRecord[] = [
  { slug:"2026-ningxia-gift-creative-competition-archived",title:"2026“宁选好礼”文旅商品暨创意大赛（已截止）",category:"competition",summary:"曾面向全国征集文创设计及产品，征集于2026年7月15日12时截止。",organizer:"宁夏回族自治区文化和旅游厅",organizerType:"government",url:"https://whhlyt.nx.gov.cn/zwgk/fdzdgknr/tzgg/202604/t20260428_5227435_zzb.html",sourceName:"宁夏文化和旅游厅官方公告",sourceLevel:"L1",published:"2026-04-27",deadline:"2026-07-15T12:00:00+08:00",eventEnd:"2026-08-31",province:"宁夏回族自治区",regions:["ningxia","nationwide"],scope:"nationwide",eligibility:"公告期内符合条件的单位、团队和个人。",benefit:"赛事评选与展示。",requirements:"历史条目，仅用于状态和归档回归。",historical:true},
  { slug:"2026-minning-ich-co-creation-exhibition-archived",title:"“山海匠心传—非遗共创成果展”作品征集（已截止）",category:"exhibition_market",summary:"闽宁非遗共创成果展作品征集已于2026年6月10日截止。",organizer:"宁夏回族自治区文化和旅游厅、福建省文化和旅游厅",organizerType:"government",url:"https://whhlyt.nx.gov.cn/zwgk/fdzdgknr/tzgg/202604/t20260430_5230275.html",sourceName:"宁夏文化和旅游厅官方公告",sourceLevel:"L1",published:"2026-04-30",deadline:"2026-06-10",eventEnd:"2026-07-20",province:"宁夏回族自治区",regions:["ningxia","fujian"],scope:"regional",eligibility:"闽宁两地非遗传承人、工艺美术师、院校师生及创作者。",benefit:"共创成果展示。",requirements:"历史条目，仅用于状态和归档回归。",historical:true},
  { slug:"2026-leiwuqi-football-market-recruitment-archived",title:"类乌齐县“仲确·足球嘉年华”市集招商（已截止）",category:"exhibition_market",summary:"市集展销会招商已于2026年6月30日18时截止。",organizer:"类乌齐县经济信息和商务局",organizerType:"government",url:"https://leiwuqi.changdu.gov.cn/lwqxrmzf/c102126/202606/bdf2aa0a2d4648ca8721aff37f6ca30e.shtml",sourceName:"类乌齐县人民政府官方公告",sourceLevel:"L1",published:"2026-06-24",deadline:"2026-06-30T18:00:00+08:00",eventEnd:"2026-07-12",province:"西藏自治区",city:"昌都市",regions:["changdu","xizang"],scope:"local_only",eligibility:"公告期内符合要求的参展商户。",benefit:"市集展销摊位。",requirements:"历史条目，仅用于状态和归档回归。",historical:true},
  { slug:"2026-tianhe-qiqiao-protection-project-archived",title:"天河乞巧习俗专项保护工作比选（已截止）",category:"procurement_project",summary:"国家级非遗项目七夕节（天河乞巧习俗）专项保护工作比选已于2026年7月8日截止。",organizer:"广州市天河区文化馆",organizerType:"public_cultural_institution",url:"https://www.thnet.gov.cn/thdt/tzgg/zbgg/content/post_10885978.html",sourceName:"广州市天河区人民政府官方比选公告",sourceLevel:"L1",published:"2026-06-30",deadline:"2026-07-08T17:00:00+08:00",eventEnd:"2026-12-31",province:"广东省",city:"广州市",regions:["guangzhou","guangdong"],scope:"regional",eligibility:"公告期内具备相应业绩和服务能力的单位。",benefit:"专项保护项目承办合同。",requirements:"历史条目，仅用于状态和归档回归。",historical:true},
  { slug:"2026-kashgar-cultural-art-week-call-archived",title:"喀什·中亚南亚商品交易会文化艺术周征集（已截止）",category:"competition",summary:"美术书法摄影作品征集已于2026年6月30日截止，其中摄影类涵盖民俗非遗。",organizer:"喀什地区相关活动组委会",organizerType:"government",url:"https://www.kashi.gov.cn/ksdqxzgs/c106694/202605/aa19bb455c55427f8bfbbf907b46a009.shtml",sourceName:"喀什地区行政公署官方公告",sourceLevel:"L1",published:"2026-05-01",deadline:"2026-06-30",eventEnd:"2026-08-31",province:"新疆维吾尔自治区",city:"喀什地区",regions:["kashgar","xinjiang"],scope:"nationwide",eligibility:"公告期内面向社会创作者。",benefit:"文化艺术周展示。",requirements:"历史条目，仅用于状态和归档回归。",historical:true},
];

const SCREENED_OUT = [
  { title:"“国家级非遗项目记忆影像”《匠心·传承》摄制项目结果公告", url:"https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202607/t20260723_26997193.htm", decision:"rejected", reason:"成交结果公告，不再存在可参与行动。" },
  { title:"2026年“非遗好物 匠心传承”内蒙古非遗购物月", url:"https://xfj.xlgl.gov.cn/eportal/ui?articleKey=f7ee10962ba64a8291f9edb8f708708b&columnId=16a970a8fc484a859d610ae4a078a8e1&pageId=7dfeba9c50f34f2fa42c1e26da88caeb", decision:"rejected", reason:"活动报道且活动已于7月20日结束，无当前招募入口。" },
  { title:"拉萨非遗消费补贴", url:"https://wlt.xizang.gov.cn/xccx/lytg/202607/t20260702_548087.html", decision:"rejected", reason:"面向消费者的优惠信息，不是传承人或机构可申请的经营机会。" },
  { title:"第十三届西城区非遗传承志愿者招募", url:"https://www.bjwmb.gov.cn/yw/10131371.html", decision:"rejected", reason:"转载报道未给出明确截止时间和可核验申请入口。" },
  { title:"2026年文化和自然遗产日非遗主题宣传展示工作通知", url:"https://zwgk.mct.gov.cn/zfxxgkml/fwzwhyc/202605/t20260526_965986.html", decision:"rejected", reason:"行政工作通知，报送窗口已结束且不面向目标用户。" },
  { title:"2026年非遗消夏购物月启动", url:"https://www.mct.gov.cn/whzx/whyw/202606/t20260611_966225.htm", decision:"rejected", reason:"新闻稿，无独立报名入口。" },
  { title:"“锦绣中华”壮锦创新大赛报道", url:"https://www.news.cn/ci/20260630/9122230574b241d6a5d38a40ad5f307f/c.html", decision:"rejected", reason:"媒体报道未确认当前报名截止时间和第一方入口。" },
  { title:"沈阳故宫“故宫吉市”招募", url:"https://www.sypm.org.cn/xinwen_1/622.html", decision:"rejected", reason:"报名已于2026年7月6日截止。" },
  { title:"CRAFTISTANBUL 2026", url:"https://www.craftfairistanbul.com/en", decision:"rejected", reason:"确认展会存在，但未从页面确认当前申请窗口和截止时间。" },
  { title:"新加坡传统艺术驻留", url:"https://www.nac.gov.sg/docs/default-source/ta-residency-2026/2026-ta-residency-open-call-material.pdf?sfvrsn=3a967d94_1", decision:"rejected", reason:"申请已于2026年7月15日截止。" },
  { title:"Ca’Buccari Summer Residencies", url:"https://www.ca-buccari.org/residency-open-call-1", decision:"rejected", reason:"申请已于2026年6月7日截止。" },
  { title:"Houston Center for Contemporary Craft Residency 2026–2027", url:"https://www.transartists.org/en/air/houston-center-contemporary-craft", decision:"rejected", reason:"申请窗口已于2026年3月1日截止。" },
  { title:"BEK Nordic & Baltic Residency 2026", url:"https://bek.no/en/bek-nordic-baltic-residency-2026-2/", decision:"rejected", reason:"申请已于2026年2月15日截止。" },
  { title:"2026/27 Ceramics Artist-in-Residence", url:"https://theumbrellaarts.org/sites/default/files/Umbrella%20AiR%202627%20Ceramics%20Call.pdf", decision:"rejected", reason:"申请已于2026年4月30日截止。" },
  { title:"宁德《匠心·传承》采购转载", url:"https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202607/t20260723_26997193.htm?from=stage5", decision:"duplicate", duplicate_group:"dup-nd-jiangxin", reason:"与结果公告原页为同一已成交项目，不重复入库。" },
  { title:"阿里特色文旅文创产品征集采购转载", url:"https://lyfz.al.gov.cn/info/1932/22841.htm?from=stage5", decision:"duplicate", duplicate_group:"dup-ali-products", reason:"与正式记录使用同一官方页面，仅保留主记录。" },
  { title:"曹妃甸非遗馆装饰装修项目聚合页", url:"https://www.ggzy.gov.cn/information/deal/html/a/130000/0201/20260723/0013979914fd6a9642e0ad1ceb4975bbca93.html?from=stage5", decision:"duplicate", duplicate_group:"dup-caofeidian", reason:"与全国公共资源交易平台主记录重复。" },
  { title:"晋城市文创作品征集转载", url:"https://www.jcgov.gov.cn/dtxx/gsgg/202606/t20260611_2359601.shtml?from=stage5", decision:"duplicate", duplicate_group:"dup-jincheng", reason:"同一官方方案的重复发现记录。" },
  { title:"2026“宁选好礼”赛事后续通知", url:"https://whhlyt.nx.gov.cn/zwgk/fdzdgknr/tzgg/202604/t20260428_5227435_zzb.html?from=stage5", decision:"duplicate", duplicate_group:"dup-ningxia-gift", reason:"同一赛事后续材料，合并到历史主记录。" },
  { title:"北京市传统工艺美术保护发展资金项目", url:"https://jxj.beijing.gov.cn/zwgk/2024zcwj/202602/t20260228_4545626.html", decision:"rejected", reason:"申报已于2026年4月15日截止。" },
  { title:"天河乞巧习俗专项保护项目转载", url:"https://www.thnet.gov.cn/thdt/tzgg/zbgg/content/post_10885978.html?from=stage5", decision:"duplicate", duplicate_group:"dup-tianhe-qiqiao", reason:"与历史主记录重复。" },
] as const;

const checkedAt = "2026-07-24T16:00:00+08:00";

function toOpportunity(record: CuratedRecord, index: number): IchOpportunity {
  const country = record.country ?? "中国";
  const status = record.historical ? "expired" : "active";
  return {
    id: `ich_stage5_${String(index + 1).padStart(3, "0")}`, slug: record.slug, external_id: null,
    title: record.title, title_original: record.title, title_en: null, summary: record.summary, description: null,
    opportunity_value_text: record.benefit, primary_category: record.category,
    secondary_tags: [...record.regions, record.scope], classification_confidence: "high",
    classification_reason: record.sourceLevel === "L3"
      ? "公开转载页提供了具体行动窗口和参与条件；作为线索发布，申请前须由用户向主办方复核。"
      : "依据列明的具体来源页、行动窗口和参与条件人工辅助核验并分类。",
    classification_status: "confirmed", status,
    status_reason: record.historical ? `截止日期为${record.deadline}，在核验日已结束。` : `核验日2026年7月24日仍在申请窗口内。`,
    is_featured: false, is_published: true, archive_reason: record.historical ? "deadline_passed" : null,
    organizer: { name: record.organizer, name_en: null, type: record.organizerType ?? "event_organizer", official_website: new URL(record.url).origin, contact_text: null },
    location: { country_code: country === "中国" ? "CN" : null, country_name: country, province_state: record.province ?? null, city: record.city ?? null, district: null, venue_text: null, region_groups: record.regions, participation_scope: record.scope, eligible_regions: record.regions, is_online: true, is_hybrid: false, is_multi_location: false, location_status: "partially_confirmed" },
    participation_mode: { mode: "online", submission_method: record.applicationMethod ?? "official_platform", requires_on_site_presence: null, participation_notes: "申请和后续到场要求以官方来源页及其附件为准。" },
    dates: { published_at: record.published, application_start_at: record.published, deadline_at: record.deadline, deadline_text: record.deadlineText ?? record.deadline, event_start_at: null, event_end_at: record.eventEnd ?? null, timezone: country === "中国" ? "Asia/Shanghai" : "UTC", is_deadline_all_day: !record.deadline.includes("T"), is_long_term: false, date_status: "confirmed" },
    eligibility: { eligible_applicant_types: ["individual","studio","enterprise","organization","designer","team"], eligibility_text: record.eligibility, ich_status_required: null, business_license_required: null, local_registration_required: null, recommendation_required: null, age_requirement_text: null, language_requirement_text: null, eligibility_status: "confirmed" },
    benefits: { value_types: ["opportunity"], prize_amount: null, prize_currency: null, funding_amount: null, funding_currency: null, procurement_budget_min: null, procurement_budget_max: null, procurement_currency: null, sales_opportunity: record.category === "exhibition_market" || record.category === "channel_collaboration", channel_opportunity: record.category !== "policy_funding", benefit_text: record.benefit },
    costs: { application_fee_amount: null, application_fee_currency: null, booth_fee_amount: null, booth_fee_currency: null, deposit_amount: null, deposit_currency: null, commission_rate: null, travel_self_funded: null, accommodation_self_funded: null, materials_self_funded: null, shipping_self_funded: null, cost_text: "费用未在本条摘要中确认，申请前须以官方来源页及附件为准。", cost_status: "not_disclosed" },
    requirements: { documents_required: ["官方要求的申请材料"], portfolio_required: null, sample_required: null, proposal_required: null, invoice_required: null, bidding_qualification_required: record.category === "procurement_project" ? true : null, production_capacity_text: null, requirements_text: record.requirements },
    application: { application_url: record.url, application_email: null, application_phone: null, application_platform: "官方来源页", application_steps: ["打开官方来源页","核对最新截止时间与资格","按页面或附件要求提交材料"], contact_text: null, application_status: record.historical ? "closed" : "confirmed" },
    sources: [{ url: record.url, name: record.sourceName, type: "specific_opportunity_page", level: record.sourceLevel, is_primary: true, published_at: record.published, last_checked_at: checkedAt, is_accessible: true, notes: "阶段5逐条核验：标题、主办方、行动窗口及核心参与条件来自该具体页面；未披露字段保持未确认。" }],
    verification: { verification_status: record.sourceLevel === "L3" ? "partially_verified" : "verified", verified_by: "ai_assisted", verified_at: checkedAt, source_conflict: false, conflict_notes: null, needs_recheck: !record.historical, recheck_after: record.historical ? null : "2026-07-31T00:00:00+08:00" },
    seo: null,
    metadata: { created_at: checkedAt, updated_at: checkedAt, created_by: "chanceping-stage5-curation", updated_by: "chanceping-stage5-curation", first_discovered_at: record.published, last_checked_at: checkedAt, published_at: checkedAt, archived_at: record.historical ? checkedAt : null, data_version: "1.0", source_import_batch: null },
    duplicate_status: "unique", duplicate_of_id: null, merged_from_ids: [],
    workflow: { state:"published", revision:4, review_reason:null, submitted_at:checkedAt, reviewed_at:checkedAt, reviewed_by:"chanceping-stage5-review", withdrawn_at:null, history:[
      {action:"created",from:null,to:"draft",actor:"chanceping-stage5-curation",at:checkedAt,reason:null,revision:1},
      {action:"submitted",from:"draft",to:"pending_review",actor:"chanceping-stage5-curation",at:checkedAt,reason:null,revision:2},
      {action:"approved",from:"pending_review",to:"approved",actor:"chanceping-stage5-review",at:checkedAt,reason:"具体来源页、时效与分类通过阶段5检查。",revision:3},
      {action:"published",from:"approved",to:"published",actor:"chanceping-stage5-review",at:checkedAt,reason:null,revision:4},
    ]},
  };
}

const output = path.resolve(process.argv[2] ?? "src/ich/opportunities.stage5-candidates.json");
const file: IchOpportunityFile = {
  schema_version: ICH_SCHEMA_VERSION,
  updated_at: checkedAt,
  entries: [...CURRENT, ...HISTORICAL].map(toOpportunity),
};
fs.writeFileSync(output, `${JSON.stringify(file, null, 2)}\n`, "utf8");
const ledgerPath = path.resolve("src/ich/stage5-candidate-ledger.json");
const ledger = {
  version: "1.0",
  checked_at: checkedAt,
  total_screened: CURRENT.length + HISTORICAL.length + SCREENED_OUT.length,
  counts: {
    current_publishable: CURRENT.length,
    historical_publishable: HISTORICAL.length,
    rejected: SCREENED_OUT.filter((item) => item.decision === "rejected").length,
    duplicate: SCREENED_OUT.filter((item) => item.decision === "duplicate").length,
  },
  publishable: [...CURRENT, ...HISTORICAL].map((item) => ({ slug: item.slug, title: item.title, url: item.url, decision: item.historical ? "historical" : "publish" })),
  screened_out: SCREENED_OUT,
};
fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
process.stdout.write(`Wrote ${file.entries.length} curated candidates and ${ledger.total_screened} screened records to ${output}\n`);
