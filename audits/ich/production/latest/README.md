# 盯非遗生产只读巡检快照

- 抓取时间：2026-09-09T09:24:14.855Z
- 生产地址：https://ich.chanceping.com
- 生产 commit：8e163490012c3c83f8c60818d1141ae28f76134c
- 只读：是；运行时写入：否
- 完整性：**通过**

机器结果见 [manifest.json](./manifest.json)、[checks.json](./checks.json) 和 [encoding-quality.json](./encoding-quality.json)。页面副本见 [home.html](./home.html)、[memo.html](./memo.html)，接口副本见 [memo.json](./memo.json)、[memo.md](./memo.md)、[radar.json](./radar.json)。

生产 runtime 额外核验：pool 有 3 条 1zj 历史乱码记录，但 memo/radar 均为 0；Deadline Conflict 的 unsafe_selected_deadline_count=0。
