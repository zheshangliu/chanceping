# ICH Radar V2｜Simple Aggregator

## Source Manager

V2 的六个来源是默认 Seed Sources，不再是新增来源的 ID 白名单。后台页面 `/opportunity-v2/admin/sources` 和对应的 `/api/opportunity-v2/sources` 管理接口允许保存合法的小写 slug 来源 ID。

新来源保存后会立即执行一次测试；解析顺序为已有专用 Adapter、RSS、Generic HTML Listing。通用解析成功后会自动进行首次抓取并进入现有 72 小时 Scheduler。URL 可访问但没有识别出机会条目时，来源仍会保留并标记为 `NEEDS_ADAPTER`；网络或 HTTP 失败标记为 `FAILED`，单个来源不会阻断其他来源。

V2 将非遗机会雷达拆成三个独立层：

```text
Source Pool → Opportunity Pool → Radar View
```

六个首批来源配置在 `data/opportunity-v2/sources.json`。抓取运行只复用已有的列表/RSS Adapter，执行 `fetch → parse → normalize`，不依赖官方核验分数、DS14 或候选数量门禁。

- Source Pool：保存来源名称、URL、地区、P0/P1、类型、关联雷达、启用状态和最近抓取时间。
- Opportunity Pool：统一保存所有来源的最小机会字段；同标题、截止时间和组织者的机会跨来源合并，并保留 `discovered_by_sources`。
- Radar View：只显示启用来源中的 `RELEVANT` 且 `CURRENT` / `UNKNOWN_DEADLINE` 机会；`UNCERTAIN` 可通过 `include_uncertain=true` 观察，不默认展示。

本地运行：

```bash
npm run opportunity:v2:run
npm run verify:opportunity:v2
```

页面：`/opportunity-v2/`。API：`/api/opportunity-v2/radar`、`/api/opportunity-v2/opportunities`、`/api/opportunity-v2/sources`，以及手动运行端点 `POST /api/opportunity-v2/run`。

调度器使用 Asia/Shanghai 时区和 72 小时间隔，systemd 单元见 `ops/chanceping-opportunity-v2.timer` 与 `ops/chanceping-opportunity-v2.service`。来源抓取失败时保留已有机会池，不将一次网络故障误判为机会消失。
