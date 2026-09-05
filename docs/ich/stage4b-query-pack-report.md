# Stage 4B Query Pack V4 报告

- Query Pack 总数：18
- 新增：ich-heritage-program-v4、ich-museum-collaboration-v4、ich-commercial-channel-v4、ich-craft-market-v4、ich-residency-v4
- 新增 Opportunity Intent：heritage_program（Profile 层意图，不改变正式存储分类枚举）

## ich-heritage-program-v4
- 正向：非遗 项目申报、非遗 保护项目、传统工艺振兴、非遗人才培养、传承人计划、文化产业项目
- 负向：结果公示、获奖名单、已结束、招聘、论文、纯新闻
- 分类映射：policy_funding、channel_collaboration、international
## ich-museum-collaboration-v4
- 正向：博物馆 文创合作、文创产品征集、供应商招募 博物馆、IP授权合作、museum shop supplier、museum collaboration
- 负向：活动回顾、展览回顾、招聘、已结束、结果公告
- 分类映射：procurement_project、channel_collaboration、exhibition_market
## ich-commercial-channel-v4
- 正向：非遗 联名、文化IP合作、传统工艺 品牌合作、非遗 供应商招募、craft collaboration、heritage brand partnership
- 负向：招商广告、招聘、案例展示、已结束、结果公告
- 分类映射：channel_collaboration、procurement_project、exhibition_market
## ich-craft-market-v4
- 正向：非遗市集、手工艺市集、传统工艺展、非遗展销、craft fair open call、artisan market application
- 负向：活动回顾、展览回顾、已结束、获奖名单、招聘
- 分类映射：exhibition_market、channel_collaboration、international
## ich-residency-v4
- 正向：craft residency、heritage residency、international craft exhibition、artist open call、artisan fellowship、traditional craft exchange
- 负向：winners、past exhibition、job vacancy、closed call、annual report
- 分类映射：international、exhibition_market、channel_collaboration
