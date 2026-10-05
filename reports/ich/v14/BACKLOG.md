# V1.4 待办与上线阻塞

1. **P0 安全：生产身份控制** — 已观察到匿名伪造 `x-business-user` 的生产 GET 返回200（响应 body 已取消、未读取）。需要保护该读写路径并接入真正的服务端 session identity；候选已改为 fail-closed，但无 resolver 时只能返回401。
2. **P0 生产作业：refresh/translation runner** — `POST /api/opportunity-v2/run` 返回403；没有已验证的服务器 CLI/受保护 workflow 能读写 V2 runtime 和 DeepSeek sidecar。禁止创建无鉴权端点或手工覆盖生产 JSON。
3. **P1 ArtConnect** — 官方条款要求自动采集及跨站复制前置书面许可；未找到许可，候选保持 `COMPLIANCE_HOLD`。线上旧代码仍活跃，未部署。
4. **P1 其余43个来源许可状态** — 当前仅 `NOT_REVIEWED`，不是已许可结论。
5. **P2 观察期** — 只有新版本受保护发布且获得至少两次自然调度日志后，才能关闭7日运行稳定观察。
6. **P2 历史翻译基线** — 原477 ID/399成功/78失败仅为旧报告计数；精确ID与私有 sidecar未恢复，不做伪造对比。
