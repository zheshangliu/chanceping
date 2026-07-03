# Q.6-H Selected 10 Live Diagnostic

生成时间：2026-07-03T11:46:30.254Z

## 结论

- 本轮仅复测上次人工判为部分通过的 10 个案例：1、2、3、4、7、8、9、12、15、17。
- 有重点机会卡：7/10。
- 环境或请求失败：0/10。
- 每个案例每条 query 最多 2 个结果，仅精读最高优先级 URL；本报告用于判断 Q.6 闸门，不替代完整 Golden 20。
- Q.6-A `accept` 后会经过 Q.6-D page-type gate、Q.6-B LLM/fallback candidate judge 与 Q.6-C source ranking/card cap。
- Q.6-D 重点检查页面是否为可执行入口，首页、栏目、XLS、模板、趋势文章、泛政策规划默认不得进入重点卡。
- Q.6-C 默认重点候选最多 5 个；超过上限或近似重复的 key candidates 降到观察层，raw audit 保留原始 semantic bucket。
- Q.6-H 将弱聚合、社交转载、泛采购文件、过期行动页和平台说明页挡在重点卡外，并为具名弱候选预留最多 2 条主来源反查查询。
- 人工检查：数量为 7/10，但 #2、#8、#17 仍存在受益人或动作归属争议，本轮不判定产品质量达标。

## 候选漏斗

| # | 运行 | raw | Q6A accept | Judge accept | cap included | cards | page types | 前三张卡 | 主要原因 |
|---:|---|---:|---:|---:|---:|---:|---|---|---|
| 1 | insufficient_results | 24 | 2 | 1 | 0 | 0 | unknown(8)；news_article(6)；homepage(5)；registration_page(2)；directory_page(1) | 无 | stale_or_uncertain(10)；insufficient_action_evidence(7)；explicit_exclusion(4)；matched_radar_strategy(2) |
| 2 | succeeded | 20 | 1 | 3 | 2 | 2 | homepage(5)；calendar_page(4)；registration_page(3)；unknown(3)；tender_notice(2) | 全國桌協報名- Just Use it!；一道乒乓乓响｜多项赛事报名进行时，更有精彩抢先看！ - 解放日报 | insufficient_action_evidence(10)；stale_or_uncertain(8)；action_mismatch(4)；matched_radar_strategy(1) |
| 3 | succeeded | 20 | 3 | 2 | 1 | 1 | unknown(11)；registration_page(2)；news_article(2)；aggregator_page(2)；tender_notice(1) | 广州婚礼策划服务\| 四季酒店 | insufficient_action_evidence(8)；stale_or_uncertain(8)；matched_radar_strategy(3)；target_mismatch(1) |
| 4 | succeeded | 25 | 4 | 2 | 2 | 2 | tender_notice(12)；unknown(3)；homepage(3)；supplier_onboarding(2)；directory_page(2) | 燕达养护中心2026年春节礼品采购项目公开招标公告；工会2026年春节福利采购项目招标公告 | stale_or_uncertain(9)；insufficient_action_evidence(8)；matched_radar_strategy(4)；subject_mismatch(2) |
| 7 | succeeded | 26 | 4 | 1 | 1 | 1 | unknown(7)；registration_page(6)；homepage(6)；application_form(2)；faq_page(1) | 星云创业扶持计划 - 阿里云创新中心 | stale_or_uncertain(13)；insufficient_action_evidence(5)；matched_radar_strategy(4)；action_mismatch(2) |
| 8 | succeeded | 19 | 11 | 2 | 2 | 2 | aggregator_page(14)；company_careers_page(2)；about_us(1)；unknown(1)；category_page(1) | 借港出海：拓展全球业务从香港出发 - Robert Walters；中企出海招聘 - 米高蒲志 | matched_radar_strategy(11)；insufficient_action_evidence(7)；target_mismatch(1) |
| 9 | succeeded | 27 | 7 | 4 | 4 | 4 | unknown(9)；registration_page(5)；news_article(3)；aggregator_page(2)；partner_program(1) | 2026年大文赛&参赛流程；宣城特色伴手礼征集公告；2026年“禮遇四川”特色伴手禮征集正式開啟 | stale_or_uncertain(11)；matched_radar_strategy(7)；insufficient_action_evidence(5)；subject_mismatch(2) |
| 12 | insufficient_results | 25 | 1 | 0 | 0 | 0 | unknown(10)；homepage(2)；trend_article(2)；news_article(2)；xls_summary(2) | 无 | stale_or_uncertain(14)；generic_information(5)；insufficient_action_evidence(4)；matched_radar_strategy(1) |
| 15 | insufficient_results | 27 | 2 | 0 | 0 | 0 | unknown(10)；aggregator_page(5)；tender_notice(4)；partner_program(2)；institution_profile(2) | 无 | stale_or_uncertain(9)；explicit_exclusion(7)；insufficient_action_evidence(4)；target_mismatch(3) |
| 17 | succeeded | 23 | 5 | 1 | 1 | 1 | unknown(9)；aggregator_page(3)；supplier_onboarding(2)；policy_plan(2)；homepage(2) | 广州樱泰获评国家级“绿色工厂”，践行可持续发展再获认可 | stale_or_uncertain(9)；insufficient_action_evidence(6)；matched_radar_strategy(5)；subject_mismatch(2) |

## 前五 raw audit

| # | 前五候选审计 |
|---:|---|
| 1 | 致远杯南加围棋赛1/17开战总奖金6000美元 [direct_opportunity/directory_page:downgrade/accept/not_key_candidate/credible_secondary/67]；Home - U.S. Go Congress 2026 [direct_opportunity/homepage:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/51]；上海市围棋协会 [rejected/homepage:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/40]；International GO Federation: IGF [direct_opportunity/homepage:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/38]；2025 California State Go Championship - Events [direct_opportunity/unknown:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/38] |
| 2 | 全國桌協報名- Just Use it! [direct_opportunity/tender_notice:eligible/accept/included/credible_secondary/86]；一道乒乓乓响｜多项赛事报名进行时，更有精彩抢先看！ - 解放日报 [direct_opportunity/registration_page:eligible/accept/included/credible_secondary/74]；全國桌協報名- 首頁 - MkEz.tw [direct_opportunity/tender_notice:eligible/accept/excluded_by_cap/credible_secondary/71]；News - International Table Tennis Federation [direct_opportunity/calendar_page:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/67]；2026 Events Calendar - International Table Tennis Federation [direct_opportunity/calendar_page:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/67] |
| 3 | 广州婚礼策划服务\| 四季酒店 [customer_lead/unknown:eligible/accept/included/credible_secondary/68]；关于广州市青少年发展基金会“甜蜜派糖修成正果”广州市青年集体婚礼 ... [watch_signal/tender_notice:eligible/downgrade_to_watch_signal/not_key_candidate/credible_secondary/61]；【有马空间】 广州高端洗浴中心寻求各类品牌异业合作 [business_lead/partner_program:eligible/accept/excluded_by_cap/credible_secondary/57]；婚姻登记管理信息-广州市集体婚礼招募公告 [rejected/registration_page:eligible/downgrade_to_watch_signal/not_key_candidate/official_or_primary/57]；幸福家庭·缘定岭南2023花都区集体婚礼招募通告 [rejected/registration_page:eligible/downgrade_to_watch_signal/not_key_candidate/official_or_primary/57] |
| 4 | 燕达养护中心2026年春节礼品采购项目公开招标公告 [direct_opportunity/tender_notice:eligible/accept/included/credible_secondary/79]；工会2026年春节福利采购项目招标公告 [direct_opportunity/tender_notice:eligible/accept/included/credible_secondary/79]；广州员工福利招标采购 [watch_signal/tender_notice:eligible/downgrade_to_watch_signal/not_key_candidate/credible_secondary/65]；广东省总工会“暖新礼包”服务项目招标公告-广东省总工会 [direct_opportunity/supplier_onboarding:eligible/downgrade_to_watch_signal/not_key_candidate/official_or_primary/64]；[PDF] 广东省总工会文件 [watch_signal/pdf_summary_without_action:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/58] |
| 7 | 星云创业扶持计划 - 阿里云创新中心 [direct_opportunity/application_form:eligible/accept/included/credible_secondary/77]；AI开发者创新应用赛 - 算法大赛-天池大赛-阿里云的赛制 [reference_case/registration_page:eligible/downgrade_to_watch_signal/not_key_candidate/credible_secondary/58]；Kiro「创业扶持计划」：AI Agent助你从灵感到规模化无忧 - InfoQ [direct_opportunity/application_form:eligible/downgrade_to_watch_signal/not_key_candidate/credible_secondary/51]；关于举办2025首届全国人工智能应用创新大赛校赛的通知 [direct_opportunity/registration_page:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/51]；AdventureX 2026 \| 中国最大黑客松 [direct_opportunity/homepage:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/51] |
| 8 | 借港出海：拓展全球业务从香港出发 - Robert Walters [business_lead/company_careers_page:eligible/accept/included/credible_secondary/71]；中企出海招聘 - 米高蒲志 [business_lead/company_careers_page:eligible/accept/included/credible_secondary/71]；職位空缺- 香港金融管理局 [watch_signal/about_us:downgrade/downgrade_to_watch_signal/not_key_candidate/credible_secondary/39]；2026年ipo财务总监招聘信息 - 猎聘 [business_lead/aggregator_page:downgrade/downgrade_to_watch_signal/not_key_candidate/aggregator/32]；基金经理Jobs in 香港- Jul 2026 [watch_signal/aggregator_page:downgrade/downgrade_to_watch_signal/not_key_candidate/aggregator/32] |
| 9 | 2026年大文赛&参赛流程 [direct_opportunity/registration_page:eligible/accept/included/credible_secondary/82]；宣城特色伴手礼征集公告 [direct_opportunity/unknown:eligible/accept/included/official_or_primary/82]；2026年“禮遇四川”特色伴手禮征集正式開啟 [business_lead/partner_program:eligible/accept/included/credible_secondary/72]；非遗- 设计竞赛网 [direct_opportunity/unknown:eligible/accept/included/credible_secondary/70]；北京市文化和旅游局_政府采购 [business_lead/unknown:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/64] |
| 12 | 北京市商务局关于印发《北京市推动跨境电商高质量发展行动方案 ... [watch_signal/policy_plan:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/67]；深圳市推动跨境电子商务高质量发展行动方案（2022-2025）-政策法规 [business_lead/directory_page:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/57]；报名倒计时！Shopee 2025本地化履约业务招商大会邀您抢占增长先机 [business_lead/registration_page:eligible/downgrade_to_watch_signal/not_key_candidate/credible_secondary/51]；扶持跨境电商，助力“买”“卖”全球 - 湖南省人民政府 [watch_signal/unknown:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/51]；深圳市商务局携手全球电商平台助推跨境电商进军新市场 [business_lead/unknown:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/51] |
| 15 | “科创之光点亮未来之城”在线访谈 - 深圳市教育局 [watch_signal/unknown:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/51]；小学编程启蒙教育解决方案（教育版） \| 玛塔创想Matatalab官方网站 [channel_partner_lead/partner_program:eligible/downgrade_to_watch_signal/not_key_candidate/credible_secondary/49]；2024年深圳大学2+2国际本科招生简章 [customer_lead/institution_profile:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/45]；广东省青少年科技创新大赛 - 广东省科协事业发展中心服务平台 [watch_signal/unknown:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/45]；采购信息公告 [direct_opportunity/tender_notice:eligible/reject/not_key_candidate/credible_secondary/44] |
| 17 | 广东环境保护工程职业学院教学资源建设项目公开招标公告 [direct_opportunity/supplier_onboarding:eligible/downgrade_to_watch_signal/not_key_candidate/official_or_primary/67]；长三角生态绿色一体化发展示范区生态环境专项规划（2021-2035年） [business_lead/policy_plan:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/67]；广州樱泰获评国家级“绿色工厂”，践行可持续发展再获认可 [business_lead/partner_program:eligible/accept/included/credible_secondary/66]；广东省招标投标监管网 [reference_case/homepage:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/64]；[PDF] 长三角生态绿色一体化发展示范区总体方案 [business_lead/pdf_summary_without_action:downgrade/downgrade_to_watch_signal/not_key_candidate/official_or_primary/58] |

## 使用边界

- 本轮使用 Q.6-D page-type gate；页面类型判断仅基于搜索摘要和 URL，不是字段级核验事实。
- 本轮使用 Q.6-B 有限候选裁判；LLM 只能基于搜索摘要和雷达版本判断，不得补造字段事实。
- 本轮使用 Q.6-C 来源权威性排序和卡片上限；排序结果不是字段级核验事实。
- 无卡片不自动等于产品失败：可能是当前小样本没有足够证据，但不得静默回退演示数据。
