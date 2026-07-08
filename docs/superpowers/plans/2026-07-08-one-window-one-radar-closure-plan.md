# Q.7-I/J One Window One Radar Closure Plan

## Objective

Close the formal one-window-one-radar data layer and multi-window experience using the existing Q7X shell. Avoid rewriting the existing pipeline.

## Batch 1: Contract Tests

- Strengthen `scripts/verify-q7-chat-window.ts`.
- Strengthen `scripts/verify-q7-chat-reload.ts`.
- Strengthen `scripts/verify-q7-chat-context.ts`.
- Strengthen `scripts/verify-q7-generate-context.ts`.
- Cover:
  - built-in `全球 AI 赛事导航` is quota-exempt
  - fourth custom window is blocked
  - delete is hard delete
  - delete releases quota
  - per-window messages do not leak
  - refresh restores snapshots and pending input
  - generate/revise receives memory summary and recent messages

## Batch 2: Backend Data Closure

- Patch `src/agents/radar-chat-store.ts` only if tests reveal missing behavior.
- Patch `src/api/routes/radar-chats.ts` only if tests reveal missing behavior.
- Keep the API mock-safe.
- Keep built-in sample room protected.

## Batch 3: Frontend Multi-Window Closure

- Patch `web/hero-radar-chat.js` and related entry points if needed.
- Ensure:
  - sidebar always shows `全球 AI 赛事导航`
  - custom windows appear immediately after creation
  - switching restores exact window state
  - deleting removes from sidebar and releases quota
  - `重新开始` returns to the full homepage state, not a blank page
  - mobile sidebar remains usable

## Batch 4: Browser QA

Run desktop and mobile checks:

1. Open home.
2. Click built-in `全球 AI 赛事导航`.
3. Create custom radar A.
4. Create custom radar B.
5. Switch between built-in/A/B.
6. Refresh page.
7. Confirm active window restores.
8. Delete a custom radar.
9. Confirm quota releases.
10. Confirm `我的雷达` edit entry returns to the right chat window.

## Verification Commands

```bash
node --run typecheck
node --run verify:q7:chat-window
node --run verify:q7:chat-reload
node --run verify:q7:chat-context
node --run verify:q7:generate-context
node --run verify:q7:hero-chat
node --run verify:mvp-browser
node --run verify:v15:e2e
node --run verify:v15
node --run verify:v16
node --run verify:all
git diff --check
```

Use the bundled Codex Node path if the shell does not expose `node`.

