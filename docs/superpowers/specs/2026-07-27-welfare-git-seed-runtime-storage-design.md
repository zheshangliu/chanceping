# 企业福利雷达 Git 基线与运行数据持久化设计

## 目标

让 `fuli.chanceping.com` 像其他 ChancePing 页面一样在代码部署后立即有可用数据，同时保留每天两次的在线采集能力。任何部署、采集失败、空结果或运行数据损坏，都不得把公开机会清成 0 条。

## 已确认问题

- 当前公开 API 只要发现 `data/welfare-opportunities.json` 非空，就完全忽略 Git 内的 `src/demo/welfare-opportunities.recorded.json`。
- 生产运行数据位于 `/opt/chanceping/current/data/`。`current` 指向 release，数据因此与代码发布目录耦合。
- `data/` 被 Git 忽略，本地已验证机会不会随 push 到生产。
- 生产当前保留的是 2026-07-11 的单条旧快照，API 因而返回 `totalCount=1`、`currentCount=0`。

## 方案选择

采用“Git 安全基线 + `/var/lib` 运行数据 + API 自动降级”的混合方案。

不采用以下方案：

- 只把动态数据加入 Git：定时任务会制造脏工作区，并让运行数据更新依赖提交。
- 只迁移到 `/var/lib`：解决部署覆盖，但首次部署或数据损坏时仍可能是空页。

## 数据布局

### Git 基线

使用现有跟踪文件：

```text
src/demo/welfare-opportunities.recorded.json
```

该文件保存通过公开证据校验的机会卡，不包含原始 HTML、内部运行 ID、服务器路径、密钥或异常栈。基线发布门槛为：

- 总计不少于 80 条；
- 当前可行动不少于 40 条；
- 前置信号不少于 20 条；
- 历史续采不少于 20 条；
- 每条都有官方详情 URL、来源代码、抓取时间和 SHA-256。

### 生产运行数据

```text
/var/lib/chanceping/welfare/opportunities.json
/var/lib/chanceping/welfare/candidates.json
/var/lib/chanceping/welfare/run-summary.json
/var/lib/chanceping/welfare/evidence/
```

该目录独立于 `/opt/chanceping/current`，release 切换和 `git archive` 部署均不覆盖它。

## 读取规则

新增一个集中式读取函数，返回记录和数据来源状态：

```ts
type WelfareDataOrigin = "runtime" | "seed";

interface WelfareDataSnapshot {
  records: WelfareOpportunityRecord[];
  origin: WelfareDataOrigin;
  runtimeError?: "missing" | "invalid" | "empty";
}
```

规则固定为：

1. 运行文件存在、JSON 可解析且记录数组非空时，读取运行数据；
2. 运行文件不存在、JSON 损坏或记录数组为空时，读取 Git 基线；
3. 运行刷新返回空结果时保留上一次非空运行数据，不写入空数组；
4. API 的 `stats.dataOrigin` 暴露 `runtime` 或 `seed`，但不暴露文件路径；
5. Markdown 日报使用相同读取规则。

基线不是与运行数据合并发布。运行数据有效时以运行数据为准，避免旧基线覆盖公告状态更新。

## 写入规则

- 采集器只写运行数据路径，继续使用临时文件后原子重命名。
- 全部来源完成后，如果合并结果非空才替换运行快照。
- 单个来源失败时保留该来源上次成功数据。
- 运行数据损坏时不自动删除文件；API降级到基线，日志记录结构化错误。

## 环境与部署

生产统一配置：

```text
CHANCEPING_WELFARE_STORE_PATH=/var/lib/chanceping/welfare/opportunities.json
CHANCEPING_WELFARE_CANDIDATE_PATH=/var/lib/chanceping/welfare/candidates.json
CHANCEPING_WELFARE_RUN_SUMMARY_PATH=/var/lib/chanceping/welfare/run-summary.json
CHANCEPING_WELFARE_EVIDENCE_DIR=/var/lib/chanceping/welfare/evidence
```

systemd 服务在启动采集前创建 `/var/lib/chanceping/welfare`，权限为 `root:root 0755`。主应用和福利更新服务读取同一 `/etc/chanceping/chanceping.env`。

首次迁移按以下顺序执行：

1. 创建持久目录；
2. 如果持久目录没有有效运行快照，将 Git 基线复制为初始运行快照；
3. 安装更新后的 service/timer；
4. 重启主应用；
5. 手动运行一次分批刷新；
6. 验证正式 API 和页面。

迁移脚本不得覆盖一个更新时间晚于 Git 基线的有效运行快照。

## 采集超时处理

生产刷新不再依赖 Cloud Assistant 等待整个采集过程。Cloud Assistant 只负责启动 oneshot 服务并立即返回；随后通过只读状态命令检查结果。

采集仍受 systemd `TimeoutStartSec=30min` 约束。来源请求有各自的短超时，失败来源保留旧数据。定时器继续每天 08:30、16:30（Asia/Shanghai）运行。

## 测试与验收

新增或扩展测试覆盖：

- 无运行文件时返回 Git 基线；
- 运行文件为空时返回 Git 基线；
- 运行文件损坏时返回 Git 基线；
- 有效运行文件优先于 Git 基线；
- 保存空结果不会覆盖现有非空快照；
- API 返回 `dataOrigin`，且不泄露服务器路径；
- Git 基线满足 40/20/20/80 门槛；
- systemd 模板使用 `/var/lib/chanceping/welfare`；
- 连续部署两次后机会数量不降为 0；
- `npm run typecheck`、`npm run verify:welfare`、`npm run verify:v15:e2e`、`npm run verify:v15`、`npm run verify:v16`、`npm run verify:all` 和 `git diff --check` 全部通过。

生产验收：

- `https://fuli.chanceping.com/api/public/welfare/opportunities?status=all` 总计不少于 80；
- 当前可行动不少于 40；
- 前置信号不少于 20；
- 历史续采不少于 20；
- 页面刷新和服务重启后数量保持；
- timer 已启用且下一次运行时间正确；
- 现有主站和 AI Events smoke 全部通过。

## 回滚

- 代码回滚时保留 `/var/lib/chanceping/welfare`，不得删除运行数据；
- 若新读取逻辑异常，旧版本仍可通过环境变量读取持久目录中的同格式 JSON；
- 若运行数据异常，临时移除对应环境变量即可让 API 使用 Git 基线；
- 回滚不改变主站、AI Events 或其他雷达的数据路径。
