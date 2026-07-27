# 非遗机会雷达 Expansion 数据源完整性审计（2026-07-27）

## 结论

- 审计范围：`expansion-batch-*` 74 条。
- P0：74/74 在导入时复用了同一条“粤韵新彩”记录的描述、报名邮箱、奖项与 SEO 字段，无法继续视为逐条语义核验。
- P0：`expansion-batch-03-007` 的来源域名属于北京生态设计与绿色制造促进会，与声称的广东省工艺美术协会不匹配。该记录已撤下、清空未确认报名字段并转为待核验。
- P1：9/74 的主来源只是网站首页而非具体机会详情页；其中 1 条已撤下，剩余 8 条需优先复核。
- 当前处置：1 条撤下，73 条暂未批量下架，等待逐条重新抓取或产品侧确认批量降级方案。

## 已撤下记录

| Slug | 标题 | 当前来源 | 状态 |
|---|---|---|---|
| expansion-batch-03-007 | 2026广东省工艺美术精品展作品征集 | http://www.gzartware.com/ | withdrawn / pending_verification |

## 首页型来源（优先复核）

| Slug | 标题 | 主来源 | 状态 |
|---|---|---|---|
| expansion-batch-03-007 | 2026广东省工艺美术精品展作品征集 | http://www.gzartware.com/ | withdrawn |
| expansion-batch-03-008 | 2026景德镇陶瓷创新设计大赛 | https://www.jdz.gov.cn/ | published |
| expansion-batch-03-013 | 2026北京国际设计周非遗设计单元征集 | https://www.bjdw.org/ | published |
| expansion-batch-03-019 | 2026云南民族手工艺创新大赛 | https://www.yn.gov.cn/ | published |
| expansion-batch-03-020 | 2026苏州传统工艺美术展作品征集 | https://www.suzhou.gov.cn/ | published |
| expansion-batch-03-033 | 2026世界工艺理事会区域展征集 | https://worldcraftscouncil.org/ | published |
| expansion-batch-03-045 | Best of Tennessee Craft 2026 | https://tennesseecraft.org/ | published |
| expansion-batch-03-046 | LOEWE FOUNDATION Craft Prize 2026 | https://craftprize.loewe.com/ | published |
| expansion-batch-03-061 | D’Oyly Carte Charitable Trust Heritage Crafts Grants 2026 | https://doylycartecharitabletrust.org/ | published |

## 其余模板污染记录

下列记录的标题与来源可能仍可作为线索，但描述、报名邮箱、奖项、资格、费用和 SEO 信息不得视为已核验：

| Slug | 标题 | 主来源 |
|---|---|---|
| expansion-batch-01-001 | 关于公开征集采购特色文旅文创产品的公告 | https://lyfz.al.gov.cn/info/1932/22841.htm |
| expansion-batch-01-002 | 崇明·瀛洲徽光文旅徽章设计大赛 | https://www.shcm.gov.cn/zmhd/004014/20260519/37c6db94-3c39-4a65-95df-e11b4009b79d.html |
| expansion-batch-01-003 | 2026第九届金茶花国际文创设计大赛 | https://www.ynxc.gov.cn/html/2026/gongzuodongtai_0320/3032954.html |
| expansion-batch-01-005 | 雪域赤橙 文创蓝焰第七届消防文创作品大赛 | https://lasa.xzdw.gov.cn/fbt/gsgg/202605/t20260515_671077.html |
| expansion-batch-01-006 | 第八届北京市大学生文化创意设计竞赛 | https://jw.beijing.gov.cn/gjc/tzgg_15688/202605/t20260528_4669903.html |
| expansion-batch-01-007 | Craft Archive Fellowship 2026 | https://www.centerforcraft.org/grants-and-fellowships/craft-archive-fellowship |
| expansion-batch-01-011 | Shared Ceramics Studio Space Motley | https://www.craftscouncil.org.uk/sector-support/opportunities |
| expansion-batch-01-018 | Austin FY27 Heritage Preservation Grant | https://www.austintexas.gov/arts-culture/heritage-preservation-grant |
| expansion-batch-01-019 | British Council Cultural Protection Fund 2026 | https://cultural-protection-fund.britishcouncil.org/2026-funding-round |
| expansion-batch-01-020 | SAM Residencies Cycle 4 2027/2028 | https://samresidencies.smapply.org/prog/cycle4/ |
| expansion-batch-01-022 | Spaces to rent in shared space for ceramics | https://www.craftscouncil.org.uk/sector-support/opportunities/spaces-to-rent-in-shared-space-for-ceramics |
| expansion-batch-01-023 | Studio space available East London | https://www.craftscouncil.org.uk/sector-support/opportunities/studio-space-available |
| expansion-batch-01-024 | National Heritage Fellowships Events 2027 | https://www.arts.gov/sites/default/files/National-Heritage-Fellowships-Events-2027.pdf |
| expansion-batch-01-026 | Shared Ceramics Studio Space Peckham | https://www.craftscouncil.org.uk/sector-support/opportunities/shared-ceramics-studio-space-2 |
| expansion-batch-01-027 | Potter in Residence 2027 County Hall Pottery | https://www.craftscouncil.org.uk/sector-support/opportunities/potter-in-residence-21 |
| expansion-batch-01-028 | あったらいいな！こんな伝統工芸品 Design Contest 2026 | https://www.dentoukougei.jp/topics/2026/design-contest.html |
| expansion-batch-02-001 | XIII Concurso Nacional Grandes Maestras y Maestros del Patrimonio Artesanal de México 2026 | https://convocatorias.cultura.gob.mx/vigentes/detalle/4081/xiii-edicion-del-concurso-nacional-grandes-maestras-y-maestros-del-patrimonio-artesanal-de-mexico-2026 |
| expansion-batch-02-003 | Horizon Europe 2026 Cultural Heritage and Creative Industries | https://rea.ec.europa.eu/funding-and-grants/horizon-europe-cluster-2-culture-creativity-and-inclusive-society/european-cultural-heritage-and-cultural-and-creative-industries_en |
| expansion-batch-02-004 | Historic England Grant Calls for Proposals 2026 | https://historicengland.org.uk/advice/grants/what-we-fund/proposals/ |
| expansion-batch-02-005 | WeaveUp+ Wool Residency Lottozero 2026 | https://www.lottozero.org/news/2026/7/2/open-call-weaveup-wool-residency |
| expansion-batch-02-006 | International Folk Art Market Santa Fe 2027 Artist Application | https://folkartmarket.org/become-an-ifam-artist |
| expansion-batch-02-008 | 现代手工芸展 2026 | https://www.gssk.jp/gendaisyukougeiten%202026%20entry.html |
| expansion-batch-03-008 | 2026景德镇陶瓷创新设计大赛 | https://www.jdz.gov.cn/ |
| expansion-batch-03-013 | 2026北京国际设计周非遗设计单元征集 | https://www.bjdw.org/ |
| expansion-batch-03-016 | 2026国际传统工艺驻地计划 | https://www.transartists.org/en/calls |
| expansion-batch-03-019 | 2026云南民族手工艺创新大赛 | https://www.yn.gov.cn/ |
| expansion-batch-03-020 | 2026苏州传统工艺美术展作品征集 | https://www.suzhou.gov.cn/ |
| expansion-batch-03-021 | 2026文创园区非遗工坊入驻招募 | https://www.gov.cn/zhengce/zuixin.htm |
| expansion-batch-03-022 | 2026传统工艺乡村振兴项目资金申报 | https://www.moa.gov.cn/gk/tzgg_1/ |
| expansion-batch-03-027 | 2026传统工艺主题巡展报名 | https://www.ihchina.cn/zhengce |
| expansion-batch-03-028 | 2026博物馆非遗展陈项目采购 | https://www.ccgp.gov.cn/cggg/dfgg/ |
| expansion-batch-03-030 | 2026传统工艺保护专项申报指南 | https://www.gov.cn/zhengce/content/ |
| expansion-batch-03-031 | 2026地方非遗传承发展资金申报 | https://www.mof.gov.cn/zhengwuxinxi/caizhengxinwen/ |
| expansion-batch-03-033 | 2026世界工艺理事会区域展征集 | https://worldcraftscouncil.org/ |
| expansion-batch-03-040 | 2026国际传统工艺线上展报名 | https://www.craftscouncil.org.uk/sector-support/opportunities/online-exhibition-2026 |
| expansion-batch-03-044 | Endangered Crafts Fund 2026 | https://heritagecrafts.org.uk/ecf/ |
| expansion-batch-03-045 | Best of Tennessee Craft 2026 | https://tennesseecraft.org/ |
| expansion-batch-03-046 | LOEWE FOUNDATION Craft Prize 2026 | https://craftprize.loewe.com/ |
| expansion-batch-03-047 | Itami International Craft Exhibition 2026 | https://itami-im.jp/craftexhibition/entry/ |
| expansion-batch-03-048 | 全国农业展览馆博物馆展厅服务采购意向 | https://cgyx.ccgp.gov.cn/cgyx/pub/proJ/details?projId=df834c3f-0cef-45f0-a436-efbaa09ee5bc |
| expansion-batch-03-049 | 中国科学技术馆科普资源荟服务采购 | https://www.ccgp.gov.cn/cggg/zygg/jzxcs/202607/t20260721_26973457.htm |
| expansion-batch-03-050 | 江西省政府购买文化服务公益性演出采购公示 | https://www.ccgp.gov.cn/cggg/dfgg/dylygg/202607/t20260722_26982596.htm |
| expansion-batch-03-051 | Royal Museums Greenwich Creative Practitioner Residency 2026 | https://www.rmg.co.uk/creative-practitioner-residence-2026 |
| expansion-batch-03-052 | The Workroom Artist Residency Programme 2026/27 | https://theworkroom.org.uk/files/69ef804f44fa1-applicationguidanceartistresidencyprogramme2627.pdf |
| expansion-batch-03-053 | Heritage Crafts Opportunities 2026 | https://heritagecrafts.org.uk/opportunities/ |
| expansion-batch-03-054 | 山东工艺美术学院学生公寓及配套设施提升项目补充采购 | https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202607/t20260724_27007154.htm |
| expansion-batch-03-055 | 安徽省非物质文化遗产展示馆专业设备采购（二次） | https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202607/t20260711_26917562.htm |
| expansion-batch-03-056 | Contemporary Craft 2026-2027 Exhibition Open Call | https://contemporarycraft.org/wp-content/uploads/2025/08/CC-2026-2027-Zeve-Regional-Gallery-Exhibition-Open-Call-.pdf |
| expansion-batch-03-057 | Contemporary Craft 2027 Exhibition Call | https://contemporarycraft.org/wp-content/uploads/2026/03/2027-RP-Prospectus-Final.pdf |
| expansion-batch-03-058 | Collect 2026 Exhibitor Application | https://www.craftscouncil.org.uk/collect-fair/how-to-participate/exhibit-2026 |
| expansion-batch-03-059 | National Museum of the Philippines FY2026 Exhibition Fit-out Procurement | https://www.nationalmuseum.gov.ph/bids-and-awards/small-value-procurement-fiscal-year-2026/ |
| expansion-batch-03-060 | National Museum of the American Latino Inaugural Exhibition Design RFP | https://sam.gov/workspace/contract/opp/993ebf3cc05a45858be25f0d199bc67a/view |
| expansion-batch-03-061 | D’Oyly Carte Charitable Trust Heritage Crafts Grants 2026 | https://doylycartecharitabletrust.org/ |
| expansion-batch-03-062 | Malta Arts Council Artistic Heritage Scheme 2026 | https://artscouncilmalta.gov.mt/wp-content/uploads/2026/05/List-of-Schemes-EN.pdf |
| expansion-batch-03-063 | National Lottery Heritage Grant 2026 August Round | https://www.heritagefund.org.uk/print/pdf/node/110866 |
| expansion-batch-03-064 | Present Makers 2026 Craft Exhibition Maker Call | https://www.thelmahulbert.com/news/maker-call-out |
| expansion-batch-03-065 | Auckland Regional Historic Heritage Grant 2026 | https://ourauckland.aucklandcouncil.govt.nz/news/2026/07/regional-historic-heritage-grant-open-for-applications/ |
| expansion-batch-03-066 | Craft Makers Christmas Exhibition Opportunity 2026 | https://www.craftscouncil.org.uk/sector-support/opportunities/open-call-craft-makers-christmas-exhibition-opportunity |
| expansion-batch-03-067 | Tribal Heritage Grants 2026 | https://www.nps.gov/subjects/historicpreservationfund/tribal-heritage-grants.htm |
| expansion-batch-03-068 | Kāpiti Coast Heritage Fund 2026 | https://www.kapiticoast.govt.nz/services/grants-and-funding/open-heritage-fund/ |
| expansion-batch-03-069 | Waitaki Heritage Fund 2026 | https://www.waitaki.govt.nz/About-Waitaki/Living-here/Supporting-our-community/Community-Grants-and-Awards/Waitaki-Heritage-Fund |
| expansion-batch-03-070 | Nordic Culture Point Residency B28 2026 | https://www.nkk.org/en/residency-b28/ |
| expansion-batch-03-071 | L-AIR 2026 Artist Residency Season 4 | https://l-air.or.jp/journal/2025/08/679/ |
| expansion-batch-03-072 | Wakefield Culture Grants Small Round 4 2026 | https://www.wakefield.gov.uk/culture-and-heritage/culture-grants/culture-grants-small |
| expansion-batch-03-073 | Kyoto Tradition for Tomorrow Craft & Design Competition 2026 | https://kmtc.jp/tft/ |
| expansion-batch-03-074 | Autumn Palette Miami 2026 International Visual Arts Competition | https://artefactus.org/en/call-for-artists/ |
| expansion-batch-03-075 | Heritage Crafts Precious Metalworker of the Year Award 2026 | https://heritagecrafts.org.uk/our-awards/precious-metalworker-of-the-year/ |
| expansion-batch-03-076 | Heritage Crafts Trainer of the Year Award 2026 | https://heritagecrafts.org.uk/our-awards/trainer-of-the-year/ |
| expansion-batch-03-077 | Materials Hard + Soft International Craft Competition 2027 | https://dentonarts.com/materials-hard-soft-call |
| expansion-batch-03-078 | Heritage Crafts England Maker of the Year Award 2026 | https://heritagecrafts.org.uk/our-awards/england-maker-of-the-year-award/ |
| expansion-batch-03-079 | Heritage Crafts Emerging Metalworker of the Year Award 2026 | https://heritagecrafts.org.uk/our-awards/emerging-metalworker-of-the-year/ |
| expansion-batch-03-080 | Heritage Crafts Emerging Embroiderer of the Year Award 2026 | https://heritagecrafts.org.uk/our-awards/emerging-embroiderer-of-the-year/ |
| expansion-batch-03-081 | Heritage Crafts Patron's Award for Endangered Crafts 2026 | https://heritagecrafts.org.uk/our-awards/patrons-award-for-endangered-crafts/ |

## 重新发布门槛

1. 找到与标题一致的具体官方通知详情页。
2. 逐项重新提取并核对截止日期、报名方式、申请对象、费用和权益。
3. 禁止沿用批次模板的邮箱、奖项、描述或 SEO。
4. 通过来源域名归属、标题—正文语义一致性和公开检索回归检查后才能重新标记为 `verified`。
