# DS8 待复核优先级队列 V1.0

- 阶段：**DS8-R0**
- 正式库总量：119
- 待复核记录：114
- 正式库写入：**false**
- 复核时间：2026-08-24T08:00:00.000Z

## 队列分层

- urgent_deadline: 17
- current_recheck: 15
- field_confirmation: 31
- history_cleanup: 51

## 放行规则

1. urgent_deadline 优先复核截止日期、资格和行动方式。
2. current_recheck 复核来源可访问性、地区、分类和截止日期。
3. field_confirmation 只补证据，不把未知字段猜成已确认。
4. history_cleanup 需有结束/取消证据，才转历史或撤回。
5. 本队列只读生成，不自动修改正式机会库。

机器记录：[DS8-待复核优先级队列_V1.0.json](./DS8-待复核优先级队列_V1.0.json)。
