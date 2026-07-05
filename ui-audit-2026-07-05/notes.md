# ChancePing UI Audit - 2026-07-05

Source context:
- Codex thread: `019f1784-c6dd-79f3-8c54-e571b16f38e4` ("总控台")
- Product focus from thread: Q.7-G Demo Polish, especially the AI competition radar hero demo.
- Local app: `http://localhost:3000`

## Captured Steps

1. Home / hero entry
   - Screenshot: `01-home-hero.png`
   - Health: Weak. The left radar sidebar is visible, but the main canvas is mostly empty and the user gets little explanation of what will happen after "开始画雷达".

2. Demo prompt prefill
   - Screenshot: `03-demo-started-recapture.png`
   - Health: Mixed. The chat-window metaphor is promising, but the demo prompt is hidden inside a short textarea and requires an extra "发送" click after "开始画雷达".

3. Radar V1.0 confirmation card
   - Screenshot: `05-radar-v1-confirm.png`
   - Health: Good direction, rough execution. The artifact card makes the radar tangible, but copy is too long and has visible repetition such as "机会机会雷达".

4. Search / report progress
   - Screenshot: `08-run-wait-continued.png`
   - Health: Risky. Progress text rotates, but there is no percentage, timeout, cancel, background-run affordance, or clear handoff while waiting.

5. Opportunity cards
   - Screenshot: `10-opportunity-cards-viewport.png`
   - Health: Useful but hard to scan. The cards contain strong fields, but four narrow columns make titles and evidence repetitive and dense.

6. Report summary
   - Screenshot: `11-report-summary.png`
   - Health: Useful. The Markdown summary is present and copyable, but the summary list needs stronger spacing, hierarchy, and action framing.

7. My Radars
   - Screenshot: `12-my-radars.png`
   - Health: Functional but under-composed. The card has status, quota, and actions, but the layout wastes the right side and turns the radar profile into a long paragraph.

8. Saved radar results
   - Screenshot: `13-radar-detail.png`
   - Health: Data is present, but navigation is confusing. "查看机会和报告" sends the user to the results tab, not an obviously separate radar detail page.

## Strengths

- The product direction is coherent: "one chat window, one growing radar" is a strong mental model.
- The radar confirmation card is the right bridge between chat and product state.
- Opportunity cards include valuable product fields: nature, review status, next step, evidence, and source review.
- The Markdown report returning to chat is a strong demo moment.
- The MVP loop is visible: create prompt -> radar profile -> run -> opportunity cards -> report -> saved radar.

## UX Risks

1. The first screen undersells the product.
   - The main area is too empty and does not explain the demo promise.
   - Hidden template buttons have `0x0` rects, so "AI 赛事雷达 Demo 首句" and related shortcuts are not discoverable.

2. Primary action is ambiguous.
   - "开始画雷达" first opens a chat state, then the user still has to click "发送".
   - For a hero demo, this should either auto-send the demo prompt or clearly show a two-step state: "已填入 demo 需求，确认发送".

3. The radar artifact needs tighter product writing.
   - The card repeats generated text and creates awkward phrases like "机会机会雷达".
   - The title is too long; the action buttons sit below a dense block.

4. Waiting state is too vague.
   - During the run, the UI cycles through status text but does not show elapsed time, checked sources, remaining steps, timeout, cancel, or "run in background".
   - The send input is disabled without a clear escape hatch.

5. Opportunity results are too card-heavy.
   - Four-column cards make long titles wrap heavily and hide ranking logic.
   - The user needs a top "today's top 3 actions" area before the full evidence grid.

6. Saved radar state is inconsistent.
   - My Radars shows "运行中" even after a report is visible.
   - "查看机会和报告" lands in the results tab, so the location no longer matches the user's mental model.

7. Page state and screenshot behavior show layout fragility.
   - Full-page screenshots duplicated long content in results screens.
   - Hidden inactive panels keep large DOM content at `0x0`, which increases risk for accessibility and automation.

## Accessibility Risks

- Icon-only controls such as the paperclip and collapsed sidebar menu need accessible labels and visible tooltips.
- Hidden `0x0` buttons remain in DOM and may confuse keyboard or assistive technology navigation if not correctly `aria-hidden` / inert.
- Long link titles inside narrow cards reduce readability and may make focus outlines hard to track.
- Status changes during search should be announced with a live region and include a stable current-step label.
- Pink-on-light accents should be contrast-checked for small text and borders.

## Recommended Q.7-G Priority

1. Fix hero entry and hidden template buttons.
   - Show three visible prompt chips: "AI 赛事雷达 Demo", "OPC 创业者", "只要报名入口".
   - Add a one-line promise above the input: "输入目标，生成雷达画像，跑一次并给出机会卡和 Markdown 报告."

2. Make "开始画雷达" one decisive flow.
   - Option A: click starts the demo prompt and auto-sends.
   - Option B: click opens chat with a visible prompt preview and CTA "发送这条 demo 需求".

3. Redesign the radar confirmation artifact.
   - Top: short title, status, version, confidence.
   - Middle: three compact columns: who / watch / exclude.
   - Bottom: primary CTA plus secondary "继续修改".
   - Clean generated copy before rendering.

4. Replace rotating progress text with a real run tracker.
   - Steps: plan -> search -> read sources -> filter -> generate cards -> report.
   - Include elapsed time, checked source count, and a safe timeout state.

5. Reframe opportunity cards around action.
   - Add top strip: "先看这 3 个" with A/B/D ranking and reason.
   - Use list + detail layout on desktop; one-card stack on mobile.
   - Keep evidence fields, but collapse secondary text by default.

6. Clarify saved-radar navigation.
   - My Radars card should show "上次完成: 13 条机会 / 报告已生成" instead of stale "运行中".
   - "查看机会和报告" should open a titled detail context with breadcrumb: "我的雷达 / AI赛事雷达 / 2026-07-05运行".

7. Add a focused mobile QA pass.
   - Mobile screenshot capture timed out twice during this audit, so responsive behavior still needs separate verification.

