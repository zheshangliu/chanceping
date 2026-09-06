# Stage5-A.5 抓取可靠性报告

本轮只读；不绕过认证、CAPTCHA、Cloudflare 或登录。

| source | items_seen | baseline | incremental | strategy | reliability_status | error_taxonomy | status |
| --- | ---: | ---: | ---: | --- | --- | --- | --- |
| shejijingsai-list | 288 | — | — | DIRECT | DIRECT_PASS | SUCCESS | PASS |
| chuangsaiyun-competition-list | 107 | — | — | DIRECT | DIRECT_PASS | SUCCESS | PASS |
| contest-watchers-open | 41 | 37 | 10 | DIRECT | DIRECT_PASS | SUCCESS | PASS |
| crafts-council-opportunities | 6 | — | — | — | SEARCH_INDEX_ONLY | SUCCESS | PASS |
| artconnect-opportunities | 52 | — | — | DIRECT | DIRECT_PASS | SUCCESS | PASS |
| competitions-archi | 28 | — | — | DIRECT | DIRECT_PASS | SUCCESS | PASS |

## 关键判断

- Crafts Council：SEARCH_INDEX_ONLY；直连被阻断时只记录回退结果，不宣称抓取成功。
- Competitions.archi：使用轻量列表页、分页页和报名/提交视图；items_seen=28。
- Contest Watchers：baseline listing=37，RSS incremental=10；后续建议 7–14 天 reconciliation。
