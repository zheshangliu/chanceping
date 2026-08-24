# DS8 生命周期与受控批量发布审计报告 V1.0

- 门禁：**pass_with_followups**
- 正式库：119 条
- 运行状态：expired=56，pending_confirmation=46，active=9，closing_soon=8
- 待复核记录：114
- 已发布主来源重复组：0
- 批次上限：10 条
- 正式库写入：**false**

## 发布安全阀

候选必须是 `approved`、未发布、主来源可访问、无重复、未过期且通过语义校验；不满足任一条件即阻断。

机器记录：[DS8-生命周期审计记录_V1.0.json](./DS8-生命周期审计记录_V1.0.json)。
