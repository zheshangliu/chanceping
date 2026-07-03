# Q.6-A Selected 10 Live Diagnostic

生成时间：2026-07-03T06:52:08.590Z

## 结论

- 本轮仅复测上次人工判为部分通过的 10 个案例：1、2、3、4、7、8、9、12、15、17。
- 有重点机会卡：9/10。
- 环境或请求失败：0/10。
- 每个案例每条 query 最多 2 个结果，仅精读最高优先级 URL；本报告用于判断 Q.6 闸门，不替代完整 Golden 20。
- `accept` 才进入重点机会卡；`downgrade_to_watch_signal` 留在观察层；`reject` 只保留审计。

## 候选漏斗

| # | 运行 | raw | accept | downgrade | reject | cards | 前三张卡 | 主要原因 |
|---:|---|---:|---:|---:|---:|---:|---|---|
| 1 | insufficient_results | 20 | 0 | 13 | 7 | 0 | 无 | insufficient_action_evidence(7)；stale_or_uncertain(6)；explicit_exclusion(4)；subject_mismatch(2) |
| 2 | succeeded | 22 | 3 | 18 | 1 | 3 | 一道乒乓乓响｜多项赛事报名进行时，更有精彩抢先看！ - 解放日报；Tournaments for All Regions - T-Tourney；MIT Table Tennis Open 2026 | insufficient_action_evidence(9)；stale_or_uncertain(7)；action_mismatch(3)；matched_radar_strategy(3) |
| 3 | succeeded | 23 | 2 | 18 | 3 | 2 | 【有马空间】 广州高端洗浴中心寻求各类品牌异业合作；广州海珠举办婚庆创新赋能大赛，向社会征集三大“婚恋幸福地标”打造 ... | insufficient_action_evidence(12)；stale_or_uncertain(6)；subject_mismatch(3)；matched_radar_strategy(2) |
| 4 | succeeded | 27 | 3 | 19 | 5 | 3 | 2026年医院工会“职工劳动节慰问品”招标公告；员工福利采购 - 销邦招标平台；工会2026年春节福利采购项目招标公告 | stale_or_uncertain(12)；insufficient_action_evidence(6)；target_mismatch(4)；matched_radar_strategy(3) |
| 7 | succeeded | 22 | 4 | 14 | 4 | 4 | 星云创业扶持计划 - 阿里云创新中心；首届光谷AI创新应用大赛；Presidential Hackathon International Track - 2025 總統盃黑客松 | stale_or_uncertain(8)；insufficient_action_evidence(6)；matched_radar_strategy(4)；expired_deadline(2) |
| 8 | succeeded | 29 | 21 | 3 | 5 | 21 | 「什么是国际税经理（优先看四大税务人才）」某500强 ... - BOSS直聘；跨境工作Jobs in Hong Kong - Jun 2026 \| Jobsdb；财务管理人员-财青计划(J31023) - 招商局集团招聘官网 | matched_radar_strategy(21)；target_mismatch(3)；insufficient_action_evidence(2)；subject_mismatch(2) |
| 9 | succeeded | 29 | 3 | 22 | 4 | 3 | 公告- 成都博物馆；关于“万福”商旅伴手礼公共品牌商品和外 ... - 全国招标采购公共服务平台；招标采购- 信息公开- 山东文旅集团有限公司官方网站 | stale_or_uncertain(15)；insufficient_action_evidence(7)；matched_radar_strategy(3)；explicit_exclusion(2) |
| 12 | succeeded | 30 | 4 | 23 | 3 | 4 | 2027第七届中国跨境电商交易会（春季） - 第一展会网；易包裹物流合作伙伴招募\| 承运商·海外仓·代理商申请；中国（深圳）跨境电商展览会 | stale_or_uncertain(13)；generic_information(6)；matched_radar_strategy(4)；insufficient_action_evidence(4) |
| 15 | succeeded | 26 | 7 | 11 | 8 | 7 | 深圳市科技创新局网站；关于举办2026年第二十三届“腾讯CodeBuddy杯”广东省大学生程序 ...；政府采购信息公告（中国深圳创新创业大赛第十届国际赛荷兰 ... | explicit_exclusion(8)；matched_radar_strategy(7)；stale_or_uncertain(7)；insufficient_action_evidence(3) |
| 17 | succeeded | 25 | 4 | 19 | 2 | 4 | 广东环保局 - 采购与招标网；苏州工业园区管理委员会；广东304家国家级绿色工厂背后：AI为“脑”、绿电驱动 - 蘑菇物联 | insufficient_action_evidence(9)；stale_or_uncertain(8)；matched_radar_strategy(4)；generic_information(2) |

## 使用边界

- 本轮不使用 LLM 对候选做第二次批量裁判，避免把 Q.6-A 扩成 Q.6-B。
- 本轮不做排序和卡片数量上限；这些属于后续 Q.6-C。
- 无卡片不自动等于产品失败：可能是当前小样本没有足够证据，但不得静默回退演示数据。

## 人工复核

- Q.6-A 机制结论：通过。与 Q.5 后“几乎全部语义候选放行”相比，现在大量弱结果被降为观察或拒绝，同时 9/10 案例仍保留至少一张重点卡。
- 产品质量结论：未通过进入 N/O 的门槛。卡片数量上升或下降都不能替代人工行动价值判断。
- #1 围棋：20 条候选全部被降级或拒绝，本轮没有足够证据形成重点卡；这比混入电竞结果诚实，但仍需要更好的官方赛事查询与跨语言主题识别。
- #2 乒乓球：MIT Table Tennis Open 具备进一步核验价值，但新闻聚合和赛事聚合页仍进入前三。
- #3 婚庆：洗浴中心异业合作与婚庆公司的高端婚礼客户目标不够匹配，说明“合作”动作相同不等于目标对象相同。
- #4 员工福利：医院工会慰问品、春节福利采购属于有效直接机会；聚合招标页仍需来源排序降权。
- #7 AI 创业者：创业扶持和 AI 应用大赛方向正确，但 2025 Hackathon 仍可能因页面中混有未来年份而被保留。
- #8 猎头：21 张卡过多，BOSS/JobsDB 等聚合招聘页压过公司官网；需要实体与来源权威性判断。
- #9 非遗文创：博物馆与伴手礼采购方向相关，但部分入口仍是聚合采购页或泛采购栏目。
- #12 跨境电商：2027 展会与物流合作伙伴招募可行动，属于本轮表现较好的案例。
- #15 少儿编程：大学生程序赛和政府栏目不等于培训机构的招生/学校采购/承办合作，主体受益人判断仍弱。
- #17 工业环保：采购与园区来源方向相关，但泛采购栏目和绿色工厂新闻不等于环保设备订单。

## 下一步建议

1. Q.6-B 增加有限 LLM Candidate Judge，只判断 Q.6-A 的 `accept/unknown` 候选，重点识别“动作是否真的属于当前用户”和“谁是机会受益人”。
2. Q.6-C 再做来源权威性与卡片排序，限制重点卡数量；公司官网、政府采购原文、协会原文优先于聚合平台和资讯页。
3. 新增混合年份与明确活动年份判断，避免旧活动因页面页脚或相关文章出现 2026/2027 而被误判为新机会。
4. 在 Q.6-B/C 完成前，不建议重新跑完整 Golden 20，也不建议进入 N/O 或阿里云测试站。
