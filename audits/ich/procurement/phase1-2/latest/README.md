# 盯非遗 Procurement Radar Phase 1.2 上线审计

本目录记录 2026-09-11 对 `f25cacd7372e7a7496a8c6f9bcc317fc66076aef` 的生产部署尝试、Gate 复核和安全回滚。

部署前的生产 runtime 已完整备份。部署后发现现有统一 OpportunityV2 主 pipeline 不能直接执行 Phase 1.2 中 TED 所需的 POST 查询，也不能解压 OCP 的 gzip JSONL；Phase 1.1 的 runner 是隔离审计脚本，不能替代生产 Source Pool/Scheduler。因此未执行 Source migration 或真实生产抓取，避免把未接入来源伪装为成功。

生产已回滚到部署前健康 release，runtime 五个文件的校验结果均为 SAME，公网 smoke 全部 200。

- `ROLLOUT_STATUS`: `ROLLED_BACK`
- `READY_FOR_STABLE_PRODUCTION`: `NO`
- `DNS_CHANGED`: `NO`
- 生产当前 source pool: 33
- 生产当前 competition public: 206
- 生产当前 memo: 535
- 生产当前 procurement public: 0

`source-results.json` 中的五源数量来自已验证的隔离 dry-run，不计入生产数据。
