# Stage 4E 缺失来源报告

对用户指定来源和当前 ICH Source Registry 做仓库内静态比对；未进行网络可达性或当前届次确认。

| domain | in_ich_registry | seen_in_global_radar | recommendation |
| --- | --- | --- | --- |
| shejijingsai.com | no | yes | 仅作为发现源，必须回溯官方详情页 |
| cnyisai.com | no | no | 先做来源端点核验，再决定注册 |
| yishujs.com | no | no | 先做来源端点核验，再决定注册 |
| ncda.org.cn | no | no | 先做来源端点核验，再决定注册 |
| competition.design | no | no | 先做来源端点核验，再决定注册 |
| bhuntr.com | no | yes | 仅作为发现源，必须回溯官方详情页 |
| ichaward | no | no | 先做来源端点核验，再决定注册 |

## 优先级建议

1. 先注册并核验 shejijingsai.com、bhuntr.com 为 discovery_source，不允许直接发布。
2. 对 cnyisai.com、yishujs.com、ncda.org.cn、competition.design、ichaward 建立 endpoint healthcheck 后再决定是否注册。
3. 设计竞赛、博物馆、市集、采购等机会必须落到单项官方详情页，不能把聚合首页当作机会。
