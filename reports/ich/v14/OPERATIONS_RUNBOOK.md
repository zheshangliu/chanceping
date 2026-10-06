# V1.4 运行与安全操作手册

## 当前生产状态

- 本轮没有抓取、翻译、持久化文件写入、部署或 DNS 修改。
- 生产公开接口显示下一计划时间 `2026-10-07T06:20:16.531Z`；这不是 systemd timer 状态/触发日志证明。
- 生产运行入口目前未验证；不要直接 POST 不带授权的 `/api/opportunity-v2/run`，不要在 URL、shell历史、前端 JS 或报告中放 admin token。

## 获得运行授权后

1. 先确认受保护 runner 使用部署版本与 `/var/lib/chanceping/opportunity-v2/` runtime一致，另确认没有并发 writer。
2. Dry-run 输出目标记录、最大200 unique records/250 requests、DeepSeek唯一provider、并发≤2、每条最多2次、30秒超时；先备份/校验现有翻译 sidecar指纹。
3. 将缓存复用/原文 hash、provider、每次尝试、失败原因、实际请求数和实际文件写入分别记录；不要从公开汇总推断私有 cache 内容。
4. 来源解析失败单独降级：403记失败；HTTP成功但无支持格式记 `NEEDS_ADAPTER`；已识别格式但0个机会可为正常空结果；保留 last-known-good 数据且不刷新内容核验时间。
5. 仅在有真实登录身份 resolver 时允许私有跟进/API。任何请求参数、body 或 caller-defined header 都不能决定 owner。部署前验证匿名/伪造身份401、两个用户不可跨读、公开导出无备注。
6. 公开纠正截止、取消或资格更改之前，保存旧值/新值/出处；unsafe conflict只显示待核，不提醒精确日期。处理变更事件必须幂等。
7. ArtConnect在没有书面许可前维持 `COMPLIANCE_HOLD`，不抓取、不公开复制；恢复前需由负责人员核验许可范围。

## 回滚/观察

- 只经仓库受保护部署workflow及其备份/manifest执行；不得在 live release 目录原位改文件。
- 回滚时同时恢复对应业务代码与它实际修改过的 runtime sidecar，但不得覆盖备份后新产生的用户跟进。验证文件 schema/hash、健康检查、私有隔离和Memo parity。
- Release成功后保留7天和至少两次自然72h scheduler触发证据。单源失败可降级，不将页面访问时间当成功核验时间。
