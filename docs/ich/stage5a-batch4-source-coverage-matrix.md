# Stage5-A Batch4 来源覆盖总对账

审计时间：2026-09-06T04:00:00.000Z（Asia/Shanghai）

| Source | In Registry | Tier | Source Role | Adapter | Listing Support | Detail Support | Official Backtrace | Last Verified | Candidate Yield | Publishable Yield | Status |
|---|---:|---|---|---|---:|---:|---:|---|---:|---:|---|
| https://www.shejijingsai.com/ | no | L2 | discovery_source | — | no | no | no | 2026-09-06T04:00:00.000Z | 0 | 0 | DISCOVERY_ONLY |
| https://www.cnyisai.com/ | no | L2 | discovery_source | — | no | no | no | 2026-09-06T04:00:00.000Z | 0 | 0 | DISCOVERY_ONLY |
| http://www.yishujs.com/h-col-104.html | no | L2 | discovery_source | — | no | no | no | 2026-09-06T04:00:00.000Z | 0 | 0 | DISCOVERY_ONLY |
| http://www.yishujs.com/sys-nd/5398.html | no | L2 | discovery_source | — | no | no | no | 2026-09-06T04:00:00.000Z | 0 | 0 | DISCOVERY_ONLY |
| https://ich.unesco.org/en/home | yes | L1 | information_source | unesco-ich-news-listing-v1 | yes | yes | yes | 2026-09-06T04:00:00.000Z | 12 | 0 | FULLY_INTEGRATED |
| http://www.unescogov.com/ | no | L1 | information_source | — | no | no | no | 2026-09-06T04:00:00.000Z | 0 | 0 | NOT_SUITABLE |
| https://www.ihchina.cn/ | yes | L1 | information_source | ichina-notices-listing-v1 | yes | yes | yes | 2026-09-06T04:00:00.000Z | 10 | 1 | FULLY_INTEGRATED |
| https://competition.design/ | no | L2 | discovery_source | — | no | no | no | 2026-09-06T04:00:00.000Z | 0 | 0 | DISCOVERY_ONLY |
| https://bhuntr.com/tw | no | L2 | discovery_source | — | no | no | no | 2026-09-06T04:00:00.000Z | 0 | 0 | DISCOVERY_ONLY |
| https://www.ncda.org.cn/ | no | L1 | opportunity_source | — | no | no | no | 2026-09-06T04:00:00.000Z | 0 | 0 | NEEDS_INTEGRATION |
| https://www.ichaward.com/competition-front/home | no | L1 | opportunity_source | — | no | no | no | 2026-09-06T04:00:00.000Z | 0 | 0 | NEEDS_INTEGRATION |

## 结论

- Seed sources total：11。FULLY_INTEGRATED 2；DISCOVERY_ONLY 6；NEEDS_INTEGRATION 2；BROKEN 0；LOW_VALUE 0；NOT_SUITABLE 1。
- `FULLY_INTEGRATED` 仅表示已注册、可达、适配器和DS7流程存在；并不等于每条候选都能直接发布。
- 聚合/发现来源全部保留为发现层，正式机会必须回溯主办方或采购方L1页面。
- `unescogov.com` 未作为 UNESCO 官方主站使用，标记 NOT_SUITABLE，不计入机会产出。
