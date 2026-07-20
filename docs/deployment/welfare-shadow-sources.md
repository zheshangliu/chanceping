# 企业福利候选来源：3 天影子运行

这组来源只写入 Git 忽略的 `data/welfare-shadow-*` 运行证据，绝不会在影子期出现在 `/fuli`、公开 API 或 Markdown 日报。

首轮 12 个候选中，`OFF-N-001`（中国政府采购网采购公告）、`OFF-N-004`（全国公共资源交易平台）、`OFF-GD-004`（广东省总工会渠道合作）、`WEL-001`（关爱通供应商招募）、`OFF-SZ-002`（深圳公共资源交易中心政府采购公告）、`ORG-001`（中山大学采购公告）、`ORG-002`（华南理工大学采购公告）与 `OFF-GZ-001`（广州市政府采购中心意向及供应商征集）已通过影子期并进入正式解析器批次。影子队列保留 3 个：`OFF-N-002`、`OFF-GD-002`、`OFF-ZJ-001`。

`OFF-N-002` 使用访问验证，`OFF-ZJ-001` 使用 `SessionVerify` JavaScript 跳转；两者都明确保留为受限 POC，禁止绕过。`OFF-GD-002` 仍需要动态签名。`OFF-SZ-001` 已退役：其监管网“采购公告”入口跳转至已公开的 `OFF-SZ-002` 深圳公共资源交易中心，二者没有独立的数据面。

`OFF-N-002`（中国政府采购网采购意向）为受限 POC：若出现验证码或安全验证，只记录 `ACCESS_RESTRICTED_NO_BYPASS`，不得绕过验证、模拟人工操作或因此发布卡片。

## 安装与启动（生产由 Workbench 手动执行）

```bash
install -m 0644 /opt/chanceping/current/docs/deployment/chanceping-welfare-shadow-update.service /etc/systemd/system/chanceping-welfare-shadow-update.service
install -m 0644 /opt/chanceping/current/docs/deployment/chanceping-welfare-shadow-update.timer /etc/systemd/system/chanceping-welfare-shadow-update.timer
systemctl daemon-reload
systemctl enable --now chanceping-welfare-shadow-update.timer
systemctl start chanceping-welfare-shadow-update.service
systemctl list-timers chanceping-welfare-shadow-update.timer --all
journalctl -u chanceping-welfare-shadow-update.service -n 160 --no-pager
```

该任务每天 Asia/Shanghai 的 `08:40`、`16:40` 运行，避免与公开三来源刷新（`08:30`、`16:30`）争抢网络。

## 第 3 天的验收命令

```bash
cd /opt/chanceping/current
node --run verify:welfare:shadow-sources
node --run welfare:shadow:update
node --run assess:welfare:shadow
```

判定：连续 3 个自然日、至少 5 次成功读取的直接来源显示 `ELIGIBLE_FOR_ADAPTER_REVIEW`；该阈值允许第 1 天在上午定时任务之后才启动。受限来源显示 `RETAIN_RESTRICTED_POC`；其余显示 `CONTINUE_SHADOW`。即使候选合格，也必须先补对应解析器、字段证据测试和 3 天结果复核，才可以加入公开卡片。

## 停用与回滚

```bash
systemctl disable --now chanceping-welfare-shadow-update.timer
rm -f /etc/systemd/system/chanceping-welfare-shadow-update.timer /etc/systemd/system/chanceping-welfare-shadow-update.service
systemctl daemon-reload
```
