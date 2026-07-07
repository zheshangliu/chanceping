# Q7X Multi Radar Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current AI 赛事雷达 Hero Demo shell into a real multi-radar, one-window-one-radar workspace without breaking the V1.0 public demo flow.

**Architecture:** Reuse the existing `JsonRadarChatStore`, `/api/radar-chats`, `RadarVersionSpec`, and Q.6 opportunity gates. The built-in AI 赛事雷达 remains a public V1.0 sample room; user-created radars get their own `RadarChatWindow`, message history, draft/confirmed radar version, and result snapshot. The frontend sidebar becomes a real chat-window switcher backed by `/api/radar-chats` instead of a single hardcoded window.

**Tech Stack:** TypeScript, Hono API routes, JSON file stores, vanilla frontend JavaScript in `web/hero-radar-chat.js`, existing verification scripts under `scripts/`.

---

## File Map

- Modify: `src/agents/radar-chat-store.ts`
  - Keep as source of truth for `RadarChatWindow`, messages, memory summary, snapshots.
  - Add only small helpers if tests prove missing behavior.
- Modify: `src/api/routes/radar-chats.ts`
  - Keep existing CRUD, add list/update fields only if frontend needs them.
- Modify: `web/hero-radar-chat.js`
  - Replace hardcoded single sidebar state with a loaded `chatWindows` list.
  - Keep AI sample room V1.0-only behavior.
  - Add switching, creating, restoring, and archiving windows.
- Modify: `web/home.js`
  - Route homepage input into a new user-owned radar window.
  - Keep left AI sample room entry opening the built-in sample window.
- Modify: `web/radars.js`
  - “编辑雷达” should open the linked chat window instead of rebuilding a one-off state.
- Test: `scripts/verify-q7-chat-window.ts`
  - Extend API/data-layer coverage for multiple windows and per-window messages.
- Test: `scripts/verify-q7-hero-chat.ts`
  - Extend frontend static checks for sidebar window loading/switching and sample-room isolation.
- Optional Test: `scripts/verify-q7-chat-reload.ts`
  - Extend reload coverage after switching between two windows.

---

### Task 1: Protect Existing V1.0 Hero Demo Contract

**Files:**
- Modify: `scripts/verify-q7-hero-chat.ts`
- Verify only: `web/hero-radar-chat.js`

- [ ] **Step 1: Add/keep V1.0 sample-room assertions**

Ensure these checks remain in `scripts/verify-q7-hero-chat.ts`:

```ts
check(
  "hero demo keeps the built-in sample room at V1.0 for first-time users",
  heroChatJs.includes("normalizeHeroDemoRadarVersion") && heroChatJs.includes('version: "V1.0"'),
);
check(
  "hero demo replay reads stored public AI events instead of live search",
  heroChatJs.includes("/api/public/ai-events?") && heroChatJs.includes("runHeroDemoReplay"),
);
```

- [ ] **Step 2: Run the focused verification**

Run:

```bash
PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:q7:hero-chat
```

Expected: `Q.7 hero chat: ... PASS / 0 FAIL`.

- [ ] **Step 3: Commit if this task changed tests**

```bash
git add scripts/verify-q7-hero-chat.ts
git commit -m "Q7X: protect V1.0 sample room contract"
```

---

### Task 2: Extend Data-Layer Tests for Multiple Chat Windows

**Files:**
- Modify: `scripts/verify-q7-chat-window.ts`
- Possibly Modify: `src/agents/radar-chat-store.ts`
- Possibly Modify: `src/api/routes/radar-chats.ts`

- [ ] **Step 1: Write the failing multi-window API test**

Add this block after the existing create-message-summary checks in `scripts/verify-q7-chat-window.ts`:

```ts
const secondResponse = await app.request("/api/radar-chats", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    radarId: "radar_policy_demo",
    title: "政策补贴雷达",
    userId: "demo_user",
  }),
});
const secondJson = await json<{ success: boolean; data?: any; error?: any }>(secondResponse);
check("second chat window can be created", secondResponse.status === 200 && secondJson.success === true, JSON.stringify(secondJson.error ?? {}));
check("second chat window has different id", secondJson.data?.id && secondJson.data.id !== chatWindow?.id, `${secondJson.data?.id} vs ${chatWindow?.id}`);

await app.request(`/api/radar-chats/${secondJson.data?.id}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    role: "user",
    content: "我想找广东科技政策申报机会。",
    linkedRadarVersion: "V1.0",
  }),
});

const firstMessages = ctx.radarChatStore.listMessages(chatWindow.id);
const secondMessages = ctx.radarChatStore.listMessages(secondJson.data.id);
check("first window keeps its own messages", firstMessages.some((item) => item.content.includes("OPC 创业者")));
check("second window keeps its own messages", secondMessages.some((item) => item.content.includes("广东科技政策")));
check("second window does not leak first messages", secondMessages.every((item) => !item.content.includes("OPC 创业者")));

const allWindowsResponse = await app.request("/api/radar-chats?user_id=demo_user");
const allWindowsJson = await json<{ success: boolean; data?: any[]; error?: any }>(allWindowsResponse);
check("list returns multiple active windows", Array.isArray(allWindowsJson.data) && allWindowsJson.data.length >= 2);
check("list contains both radar ids", JSON.stringify(allWindowsJson.data).includes("radar_ai_event_demo") && JSON.stringify(allWindowsJson.data).includes("radar_policy_demo"));
```

- [ ] **Step 2: Run test to verify it fails or passes for the right reason**

Run:

```bash
PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:q7:chat-window
```

Expected before implementation: any failure should identify missing multi-window behavior. If it already passes, do not change backend.

- [ ] **Step 3: Implement only missing data-layer behavior**

If list ordering or user filtering fails, update `src/agents/radar-chat-store.ts` only. The expected implementation shape is:

```ts
list(filter?: RadarChatWindowListFilter): RadarChatWindow[] {
  let result = Array.from(this.windows.values());
  if (!filter?.includeArchived) result = result.filter((item) => item.status !== "archived");
  if (filter?.radarId !== undefined) result = result.filter((item) => item.radarId === filter.radarId);
  if (filter?.userId !== undefined) result = result.filter((item) => item.userId === filter.userId);
  if (filter?.status !== undefined) result = result.filter((item) => item.status === filter.status);
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
```

- [ ] **Step 4: Re-run and commit**

Run the same command again. Expected: `Q.7-I chat window: ... PASS / 0 FAIL`.

```bash
git add scripts/verify-q7-chat-window.ts src/agents/radar-chat-store.ts src/api/routes/radar-chats.ts
git commit -m "Q7X: verify multiple radar chat windows"
```

---

### Task 3: Load Real Chat Windows Into The Left Sidebar

**Files:**
- Modify: `scripts/verify-q7-hero-chat.ts`
- Modify: `web/hero-radar-chat.js`

- [ ] **Step 1: Add frontend contract checks**

Add checks to `scripts/verify-q7-hero-chat.ts`:

```ts
check("hero chat loads radar chat windows for sidebar", heroChatJs.includes("loadRadarChatWindows") && heroChatJs.includes("/api/radar-chats"));
check("hero chat can switch active chat window", heroChatJs.includes("switchHeroRadarWindow") && heroChatJs.includes("/api/radar-chats/${chatWindowId}"));
check("sample room remains a protected built-in window", heroChatJs.includes("AI_EVENT_SAMPLE_ROOM") && heroChatJs.includes("isSampleRoom"));
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:q7:hero-chat
```

Expected: FAIL on the new sidebar checks.

- [ ] **Step 3: Add chat window state helpers**

In `web/hero-radar-chat.js`, extend `heroRadarChatState`:

```js
chatWindows: [],
activeChatWindowId: null,
```

Add:

```js
async function loadRadarChatWindows() {
  const response = await getJson("/api/radar-chats?user_id=demo_user");
  const windows = Array.isArray(response?.data) ? response.data : [];
  heroRadarChatState.chatWindows = [
    {
      id: AI_EVENT_SAMPLE_ROOM.id,
      radarId: AI_EVENT_SAMPLE_ROOM.id,
      title: "AI 赛事雷达",
      draftRadarVersion: "V1.0",
      isSampleRoom: true,
    },
    ...windows.filter((item) => item.id !== AI_EVENT_SAMPLE_ROOM.id),
  ];
  return heroRadarChatState.chatWindows;
}
```

- [ ] **Step 4: Render sidebar from loaded windows**

Replace the single hardcoded sidebar button with:

```js
function renderHeroSidebarWindows() {
  const windows = heroRadarChatState.chatWindows.length
    ? heroRadarChatState.chatWindows
    : [{ id: AI_EVENT_SAMPLE_ROOM.id, title: "AI 赛事雷达", draftRadarVersion: "V1.0", isSampleRoom: true }];
  return windows.map((item) => `
    <button class="hero-sidebar-radar ${item.id === heroRadarChatState.activeChatWindowId || item.radarId === heroRadarChatState.boundRadarId ? "active" : ""}"
      type="button"
      data-action="switch-hero-radar-window"
      data-chat-window-id="${escapeHtml(item.id)}">
      <strong>${escapeHtml(item.title || "未命名雷达")}</strong>
      <span>${escapeHtml(item.draftRadarVersion || item.currentConfirmedRadarVersion || "V1.0")}${item.isSampleRoom ? " · Hero Demo" : ""}</span>
    </button>
  `).join("");
}
```

- [ ] **Step 5: Add switch behavior**

Add:

```js
async function switchHeroRadarWindow(chatWindowId) {
  if (chatWindowId === AI_EVENT_SAMPLE_ROOM.id) {
    openHeroRadarWindow();
    return;
  }
  const detail = await getJson(`/api/radar-chats/${encodeURIComponent(chatWindowId)}`);
  const windowData = detail?.data?.window;
  if (!windowData) {
    window.showToast?.("这个雷达窗口不存在或已归档", "warning");
    return;
  }
  heroRadarChatState.chatWindowId = windowData.id;
  heroRadarChatState.activeChatWindowId = windowData.id;
  await restoreStateFromBackend(windowData.id);
}
```

Bind:

```js
root.querySelectorAll("[data-action='switch-hero-radar-window']").forEach((button) => {
  button.addEventListener("click", () => switchHeroRadarWindow(button.dataset.chatWindowId).catch((err) => window.showToast?.(err.message || "打开雷达窗口失败", "error")));
});
```

- [ ] **Step 6: Re-run and commit**

Run:

```bash
PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:q7:hero-chat
```

Expected: `PASS / 0 FAIL`.

```bash
git add scripts/verify-q7-hero-chat.ts web/hero-radar-chat.js
git commit -m "Q7X: render multiple radar chat windows"
```

---

### Task 4: Create User-Owned Radar Windows From Homepage Input

**Files:**
- Modify: `web/home.js`
- Modify: `web/hero-radar-chat.js`
- Modify: `scripts/verify-q7-hero-chat.ts`

- [ ] **Step 1: Add contract checks**

Add:

```ts
check("homepage typed prompt creates user-owned window", homeJs.includes("createNewHeroRadarWindow(text)") && heroChatJs.includes("reuseByRadarId: false"));
check("new custom window is not treated as sample replay", heroChatJs.includes("boundRadarId = null") && heroChatJs.includes("shouldUseHeroDemoReplay"));
```

- [ ] **Step 2: Create custom window through API**

In `createNewHeroRadarWindow(initialMessage = "")`, after clearing state:

```js
const windowData = await postJson("/api/radar-chats", {
  title: text ? inferRadarTitle(text) : "新雷达",
  userId: "demo_user",
  reuseByRadarId: false,
});
heroRadarChatState.chatWindowId = windowData.id;
heroRadarChatState.activeChatWindowId = windowData.id;
heroRadarChatState.boundRadarId = null;
rememberLastChatWindow(windowData.id);
await loadRadarChatWindows();
```

Use a small title helper:

```js
function inferRadarTitle(text) {
  if (/AI|赛事|Hackathon|比赛/i.test(text)) return "AI 赛事雷达";
  if (/补贴|政策|申报/.test(text)) return "政策申报雷达";
  return "新机会雷达";
}
```

- [ ] **Step 3: Make home input handoff clear**

Keep behavior:

```js
window.createNewHeroRadarWindow(text)
  .then(() => {
    input.value = "";
    selectedTemplate = null;
  })
```

Do not auto-send. The chat input should contain the typed prompt and wait for manual send.

- [ ] **Step 4: Browser-check**

Manual path:

```text
打开首页
输入：我想找广州政策补贴申报机会
点击“开始画雷达”
左侧出现“政策申报雷达”或“新机会雷达”
聊天输入框带入原始文字
不自动生成雷达
点击发送后才生成 V1.0
```

- [ ] **Step 5: Commit**

```bash
git add web/home.js web/hero-radar-chat.js scripts/verify-q7-hero-chat.ts
git commit -m "Q7X: create user-owned radar chat windows"
```

---

### Task 5: Restore A Window With Its Own Messages, Draft, And Report

**Files:**
- Modify: `scripts/verify-q7-chat-reload.ts`
- Modify: `web/hero-radar-chat.js`

- [ ] **Step 1: Extend reload test**

Add two-window reload assertions to `scripts/verify-q7-chat-reload.ts`:

```ts
const second = await post(app, "/api/radar-chats", {
  title: "政策申报雷达",
  radarId: "radar_policy_demo",
  draftRadarVersion: "V1.0",
});
const secondId = String(second.json.data?.id ?? "");
await post(app, `/api/radar-chats/${secondId}/messages`, {
  role: "user",
  content: "我想找广州政策补贴申报机会。",
  linkedRadarVersion: "V1.0",
});
const secondDetail = await get(app, `/api/radar-chats/${secondId}`);
check("second reload detail has its own message", /广州政策补贴/.test(json(secondDetail.json.data?.messages)));
check("second reload detail does not include first report", !/reload report/.test(json(secondDetail.json.data?.messages)));
```

- [ ] **Step 2: Ensure frontend restore clears stale state**

In `restoreStateFromBackend(chatWindowId)`, before applying backend state:

```js
heroRadarChatState.messages = [];
heroRadarChatState.currentDraft = null;
heroRadarChatState.currentResult = null;
heroRadarChatState.confirmedVersion = null;
heroRadarChatState.pendingFirstMessage = "";
heroRadarChatState.modal = null;
```

Then apply `windowData.draftSnapshot`, `windowData.currentResultSnapshot`, and mapped backend messages.

- [ ] **Step 3: Re-run tests**

Run:

```bash
PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:q7:chat-reload
```

Expected: `Q.7 chat reload: ... PASS / 0 FAIL`.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-q7-chat-reload.ts web/hero-radar-chat.js
git commit -m "Q7X: restore independent radar chat windows"
```

---

### Task 6: Connect “我的雷达 / 编辑雷达” To The Correct Window

**Files:**
- Modify: `web/radars.js`
- Modify: `web/hero-radar-chat.js`
- Modify: `scripts/verify-q7-hero-chat.ts`

- [ ] **Step 1: Add static checks**

Add:

```ts
check("my radars edit opens linked radar chat window", radarsJs.includes("openHeroRadarForRadar") || radarsJs.includes("openRadarChatForRadar"));
check("hero chat can open or create window by radar id", heroChatJs.includes("openHeroRadarForRadar") && heroChatJs.includes("radarId"));
```

- [ ] **Step 2: Add frontend helper**

In `web/hero-radar-chat.js`:

```js
async function openHeroRadarForRadar(radar) {
  const radarId = radar?.id || radar?.radarId;
  if (!radarId) {
    window.showToast?.("找不到这个雷达的 ID", "warning");
    return;
  }
  const list = await getJson(`/api/radar-chats?radar_id=${encodeURIComponent(radarId)}&user_id=demo_user`);
  const existing = Array.isArray(list?.data) ? list.data[0] : null;
  const windowData = existing || await postJson("/api/radar-chats", {
    radarId,
    title: radar.name || radar.title || "机会雷达",
    userId: "demo_user",
  });
  await loadRadarChatWindows();
  await switchHeroRadarWindow(windowData.id);
}
window.openHeroRadarForRadar = openHeroRadarForRadar;
```

- [ ] **Step 3: Update My Radars edit action**

In `web/radars.js`, replace edit behavior with:

```js
if (window.openHeroRadarForRadar) {
  await window.openHeroRadarForRadar(radar);
  return;
}
window.switchTab?.("home");
document.getElementById("home-input")?.focus();
```

- [ ] **Step 4: Browser-check**

Manual path:

```text
打开“我的雷达”
点击某个雷达的“编辑雷达”
进入对应聊天窗口
左侧选中该雷达
聊天历史属于这个雷达，不混入 AI 赛事样板间
```

- [ ] **Step 5: Commit**

```bash
git add web/radars.js web/hero-radar-chat.js scripts/verify-q7-hero-chat.ts
git commit -m "Q7X: open saved radar chat windows from my radars"
```

---

### Task 7: Final Verification And Novice Simulation

**Files:**
- Verify only unless bugs appear.

- [ ] **Step 1: Run commands**

Run:

```bash
PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run typecheck

PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:q7:chat-window

PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:q7:chat-context

PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:q7:generate-context

PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:q7:hero-chat

PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:mvp-browser

PATH="/Users/1sunflower/Documents/chanceping/node_modules/.bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" \
/Users/1sunflower/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --run verify:all

git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 2: Browser novice simulation**

Run these 10 paths:

```text
1. Fresh homepage -> empty start -> focus returns to input.
2. Fresh homepage -> click built-in AI 赛事雷达 -> prompt appears in chat input, no auto-send.
3. Built-in AI 赛事雷达 -> send -> V1.0 radar card only, no V1.1/V1.2.
4. Built-in AI 赛事雷达 -> open radar modal -> centered modal -> close.
5. Built-in AI 赛事雷达 -> confirm V1.0 -> progress line -> report artifact.
6. Report artifact -> open Markdown modal -> centered modal -> close.
7. Report artifact -> view opportunity cards -> result page shows AI 赛事雷达 and pipeline.
8. Homepage -> type custom policy need -> start -> new radar window with typed prompt, no auto-send.
9. Switch between AI sample window and custom window -> messages remain isolated.
10. Mobile 390x844 -> empty start focus, open AI radar, send, confirm button visible, no horizontal overflow.
```

- [ ] **Step 3: Commit final integration**

```bash
git status --short
git add web/hero-radar-chat.js web/home.js web/radars.js scripts/verify-q7-hero-chat.ts scripts/verify-q7-chat-window.ts scripts/verify-q7-chat-reload.ts
git commit -m "Q7X: support one radar per chat window"
```

---

## Self-Review

- Spec coverage:
  - One chat window = one radar: Tasks 2, 3, 4, 5.
  - Built-in AI 赛事雷达 remains V1.0 demo: Task 1.
  - User-owned windows can later evolve to V1.1/V1.2: Tasks 4 and 5 keep custom windows separate from sample room.
  - My Radar edit returns to the right window: Task 6.
  - Novice UX and browser QA: Task 7.
- Placeholder scan: no `TBD`, no vague “add tests” without code.
- Type consistency:
  - Uses existing `RadarChatWindow`, `RadarChatMessage`, `RadarMemorySummary`.
  - Uses existing route prefix `/api/radar-chats`.
  - Uses existing frontend function family `openHeroRadarWindow`, `createNewHeroRadarWindow`, `restoreStateFromBackend`.

## Execution Recommendation

Run this as the next milestone after Hero Demo V1.0 stabilization:

```text
Q7X-A: multiple-window data contract checks
Q7X-B: sidebar loads and switches real windows
Q7X-C: custom homepage prompt creates user-owned window
Q7X-D: My Radar edit opens linked chat window
Q7X-E: full novice simulation and regression
```

Do not start broad industry optimization, Random 20, or new data-source work inside Q7X. This milestone is purely about product shape: one radar equals one persistent chat window.
