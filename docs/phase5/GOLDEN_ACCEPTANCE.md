# HeadHunter Golden Acceptance

`scripts/verify-headhunter-golden-gates.ts` 自动覆盖 8 个 Golden Gate：

1. Auth：未登录与正确管理员登录。
2. Scheduler：固定 Monday 07:00 Asia/Shanghai 由独立 Scheduler 验证。
3. E2E：Target/Discovery → Search → Evidence → Company → Signal → Job → Contact → Need → Score → Gate → Ranking → A/B → Trend 阶段顺序。
4. Contact Hard Gate：Contact FAIL 即使 BusinessScore 88 也不能进入 A。
5. 高可信业务事件推断：推断可进入候选，但不得伪称“正在招聘”。
6. RA1/Cantonese literal-only：未明确出现时保持 `not_mentioned`。
7. Weekly History：W1 B、W2 B、W3 A 全部保留。
8. Manual A：管理员覆盖保留 `manual_pool_override`。

附加断言：Top 8、少于 8 家不补足、8 周归档/新信号重激活、Markdown 同源、FAILED run 不覆盖正式快照。

运行：

```bash
npx tsx scripts/verify-headhunter-golden-gates.ts
```
