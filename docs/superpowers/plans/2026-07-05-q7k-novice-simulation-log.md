# Q.7-K Novice Simulation Log

Date: 2026-07-05

Scope:
- Validate Q.7-K initial radar generation with RadarChatWindow context.
- Validate the current AI event radar UI shell on desktop and mobile.
- Simulate 10 novice operations and directly fix blocking issues found.

## Fixed During This Run

1. Local `node --run dev` only enabled live LLM, not live Serper search.
   - Symptom: confirming the radar produced `本地真实搜索未开启`.
   - Fix: `dev` now sets `CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=true`.
   - Guard: `verify:local-live-dev` now requires live search for local dev while keeping production `start` closed.

2. Initial `/api/radars/generate` accepted `chatWindowId` from the UI but did not hydrate chat-window context.
   - Symptom: first-version radar generation could ignore existing radar memory and recent messages.
   - Fix: `/api/radars/generate` now appends bounded RadarChatWindow context before calling `RadarGenerator`.
   - Guard: `verify:q7:generate-context`.

3. The sidebar collapse button label was too static for novice users and automation.
   - Symptom: the button was visible but its intent was less obvious.
   - Fix: the button now uses `折叠或展开雷达侧边栏` for both `title` and `aria-label`.
   - Guard: `verify:q7:hero-chat`.

## Browser Validation Summary

Full live flow tested once with local DeepSeek + Serper:

```text
Home
-> click AI 赛事雷达
-> default prompt appears in chat input
-> manual Send
-> DeepSeek generates Radar V1.1 using existing chat context
-> Confirm radar
-> Serper live search
-> limited page reading / evidence gate
-> Markdown summary returns to chat
-> full Markdown opens in centered modal
-> opportunity cards open and show customer-facing labels
```

Result:
- Live search no longer 403s.
- Progress line rotates while work is running.
- Report summary appears in chat.
- `qwencloud-hackathon.devpost.com` appeared as an A-level opportunity source.
- Opportunity cards use human labels such as `为什么值得看`, `本周先做`, `截止时间`, and `来源入口`.

## 10 Novice Scenarios

| # | Scenario | Result | Notes |
|---|---|---|---|
| 1 | Read report summary after a completed run | Partial | Summary is readable, but detailed source links require clicking `查看本次机会卡`. This is acceptable for the compact chat summary design. |
| 2 | Open and close full Markdown report | Pass | Centered modal works. |
| 3 | Navigate to `我的雷达` and find existing radar actions | Pass | User can find `编辑雷达`, `查看机会和报告`, and delete action. |
| 4 | Return to home and inspect primary input | Pass | One visible input, top banner visible, file upload hidden. |
| 5 | Click `AI 赛事雷达` from the sidebar | Pass | Default prompt is inserted into chat input; no automatic generation happens. |
| 6 | Locate send button | Pass | Red `发送` button is visible and enabled. |
| 7 | Click `开始画雷达` with empty input | Pass | No accidental LLM/search run. |
| 8 | Type a custom homepage prompt and start | Pass | Opens chat window with prompt, still waits for manual send. |
| 9 | Collapse sidebar | Pass | Static regression now requires an explicit `折叠或展开雷达侧边栏` label; manual visual entry remains usable. |
| 10 | Mobile viewport basic usability | Pass | Input/action button remain visible; file upload remains hidden. |

## Follow-Up Candidates For Q.7-G

- The first report summary is intentionally compact; consider one line saying `完整来源请看机会卡`.
- Long live LLM generation can exceed 2 minutes; keep improving visible progress while waiting.
