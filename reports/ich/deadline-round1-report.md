# 盯非遗｜赛事截止日期覆盖提升 Round 1

执行范围：只改日期解析、Top 5 来源详情回填、轻量冲突记录、日期覆盖审计与 Filter Matrix；不新增 Source、不改 UI、不改翻译 Provider、不部署生产。

## BEFORE

基于当前生产只读快照 `audits/ich/production/latest/memo.json`：

| 指标 | 数值 |
|---|---:|
| memo | 526 |
| known deadline | 275 |
| unknown deadline | 251 |
| coverage | 52.28% |

未知日期排名 Top 5：Whaleideas 134、1zj 52、ArtConnect 11、KCDF 10、CuratorSpace 10。

## AFTER

完整隔离运行：`opportunity-v2-20260909064513`

| 指标 | 完整运行 | 最终副本/只读接口 |
|---|---:|---:|
| fetched sources | 29 | 31 registered |
| successful sources | 23 | 23 |
| raw items | 2010 | — |
| pool | 2139（完整运行后） | 2130（KCDF 回填与稳定 ID 去重后） |
| pool known deadline | — | 549 |
| pool unknown deadline | — | 1581 |
| pool conflicts | — | 76 |
| memo / displayed competitions | — | 431 / 148 |
| memo known deadline | — | 295 |
| memo unknown deadline | — | 136 |
| memo coverage | — | 68.45% |

过期日期在当前副本中被排除出默认展示：`expired_after_resolution = 103`。

## 每来源日期提升

下表的 BEFORE 是生产 memo 基线；AFTER 是隔离副本 pool，因完整抓取会发现新记录，分母可能变化。共同基线 URL 的提升另行注明。

| 来源 | BEFORE total / known / unknown | AFTER pool total / known / unknown | known 增量 | 结果 |
|---|---:|---:|---:|---|
| Whaleideas | 150 / 16 / 134 | 160 / 68 / 92 | +52（共同基线 URL +47） | 详情回填有效；仍有未尝试记录 |
| 1zj | 52 / 0 / 52 | 1163 / 0 / 1163 | +0 | 详情请求超时，保留 `fetch_failed`；相对时间不造绝对日期 |
| ArtConnect | 11 / 0 / 11 | 34 / 26 / 8 | +26（共同基线 11 条均解析） | 详情日期已解析；部分已过期 |
| KCDF | 10 / 0 / 10 | 10 / 10 / 0 | +10 | 详情 `공모기간/접수기간` 日期已回填 |
| CuratorSpace | 10 / 0 / 10 | 30 / 9 / 21 | +9 | 列表 `Deadline: DD/MM/YYYY` 已解析 |

1zj 的剩余未知原因：`fetch_failed=48`、`relative_only=12`、`not_attempted=1103`。其余 Top 来源的旧记录中，未被本轮 Top 5 详情预算覆盖的部分保留未知，不伪造日期。

## 冲突数

- 最终 pool 截止日期冲突证据：76 条。
- Whaleideas：14 条冲突证据。
- ArtConnect：3 条冲突证据。
- 同一机会跨 Source 日期一致时标记 `found_cross_source`；日期不一致时标记 `date_conflict`，不静默覆盖。

## Filter Matrix

本地只读服务全部 HTTP 200；HTML、JSON、Markdown ID 一致；无可疑“筛选后结果不变”。

| case | total | parity | suspicious unchanged |
|---|---:|---|---|
| `/ich/memo` | 431 | PASS | NO |
| `direction=cultural_creative` | 127 | PASS | NO |
| `work_format=product_design` | 24 | PASS | NO |
| `status=current` | 295 | PASS | NO |
| `status=deadline_tbd` | 136 | PASS | NO |
| `sort=nearest` | 431 | PASS | NO |
| `source_id=whaleideas-competition` | 120 | PASS | NO |
| direction + work_format + status | 13 | PASS | NO |

## 回归

- `LOEWE`：仍只显示一次，`discovered_by_sources` 保留 2 个来源。
- `mailto/tel`：通用 Listing 不进入池。
- 详情日期、范围结束日期、优先级语义、相对日期、不明日期、跨 Source 同日期/冲突均有测试。
- 现有 UI 文件未修改；Source 数量未新增；生产未部署。

机器审计文件：

- `deadline-coverage-20260909065852.json`：生产 BEFORE。
- `deadline-coverage-20260909065853.json`：隔离副本 AFTER。
- `audits/ich/deadline-round1/manifest.json`：本地只读快照与 Filter Matrix。
