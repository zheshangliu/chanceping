# Welfare Summary and Stage Filter Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the redundant status button group with a stage select and keep all five welfare metrics in one compact row.

**Architecture:** Preserve the existing public APIs and `state.status` model. Move status selection into the existing filter form, update the DOM event binding to use the new select, and change only the welfare page CSS needed for desktop and mobile layout.

**Tech Stack:** Static HTML, browser JavaScript, CSS, Node/TypeScript contract verification.

## Global Constraints

- Do not modify opportunity collection, classification, evidence, or sales follow-up logic.
- Do not modify opportunity cards, AI Events, or other radar pages.
- Desktop metrics must remain a single row; mobile metrics must remain a horizontally scrollable single row.
- The four stages remain current, signal, historical, and candidates.

---

### Task 1: Add the failing page contract

**Files:**
- Modify: `scripts/verify-welfare-page.ts`

**Interfaces:**
- Consumes: static contents of `web/welfare.html`, `web/welfare.css`, and `web/welfare.js`.
- Produces: contract assertions for `#welfare-stage`, removal of `.welfare-status-tabs`, and single-row metric CSS.

- [ ] **Step 1: Write failing assertions**

```ts
assert.ok(html.includes('id="welfare-stage"'));
assert.ok(!html.includes("welfare-status-tabs"));
assert.ok(js.includes('querySelector("#welfare-stage")'));
assert.ok(css.includes("grid-auto-flow:column"));
```

- [ ] **Step 2: Verify the contract fails**

Run: `npx tsx scripts/verify-welfare-page.ts`
Expected: FAIL because `#welfare-stage` is not present.

### Task 2: Replace tabs with the stage filter

**Files:**
- Modify: `web/welfare.html`
- Modify: `web/welfare.js`

**Interfaces:**
- Consumes: the existing `state.status` values and `load()` function.
- Produces: `select#welfare-stage` whose change event sets `state.status`, resets `state.page`, and calls `load()`.

- [ ] **Step 1: Move the four stages into a select**

```html
<label>机会阶段<select id="welfare-stage">
  <option value="current">当前机会</option>
  <option value="signal">前置信号</option>
  <option value="historical">历史续采</option>
  <option value="candidates">待核验线索</option>
</select></label>
```

- [ ] **Step 2: Replace button listeners with one select listener**

```js
document.querySelector("#welfare-stage").addEventListener("change", (event) => {
  state.status = event.currentTarget.value;
  state.page = 1;
  load();
});
```

- [ ] **Step 3: Run the page contract**

Run: `npx tsx scripts/verify-welfare-page.ts`
Expected: still FAIL only on the missing single-row CSS assertion.

### Task 3: Implement compact responsive metric styling

**Files:**
- Modify: `web/welfare.css`

**Interfaces:**
- Consumes: `.welfare-metrics` and `.welfare-metric` markup emitted by `renderMetrics()`.
- Produces: one-row desktop layout and one-row horizontally scrollable mobile layout.

- [ ] **Step 1: Add the desktop single-row layout**

```css
.welfare-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));}
```

- [ ] **Step 2: Add the mobile horizontal layout**

```css
@media(max-width:860px){
  .welfare-metrics{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(132px,1fr);grid-template-columns:none;overflow-x:auto;}
}
```

- [ ] **Step 3: Make the six filters responsive**

Keep six columns on wide desktop, three at `max-width:1020px`, two at `max-width:860px`, and one at `max-width:480px`.

- [ ] **Step 4: Run the focused contract**

Run: `npx tsx scripts/verify-welfare-page.ts`
Expected: PASS.

### Task 4: Regression, visual verification, and deployment

**Files:**
- Test: `scripts/verify-welfare-page.ts`
- Test: production `/fuli`

**Interfaces:**
- Consumes: completed welfare page implementation.
- Produces: verified production deployment on `fuli.chanceping.com`.

- [ ] **Step 1: Run required local verification**

Run: `npm run typecheck && npm run verify:welfare && npm run verify:v15:e2e && git diff --check`
Expected: all commands exit 0.

- [ ] **Step 2: Inspect desktop and mobile renders**

Confirm five metrics stay in one row, the status tabs are absent, the stage select is first, and switching all four values updates title and content.

- [ ] **Step 3: Commit only welfare files**

```bash
git add web/welfare.html web/welfare.js web/welfare.css scripts/verify-welfare-page.ts docs/superpowers/plans/2026-07-27-welfare-summary-stage-filter-redesign.md
git commit -m "style(welfare): simplify summary and stage filtering"
```

- [ ] **Step 4: Push and deploy through the ChancePing workflow**

Run: `/Users/1sunflower/.codex/skills/chanceping-push-deploy/scripts/push_chanceping.sh`
Expected: branch push, SWAS deployment, and remote smoke all pass.

- [ ] **Step 5: Run production welfare smoke**

Run: `CHANCEPING_WELFARE_BASE_URL=https://fuli.chanceping.com node --run verify:welfare:remote-smoke`
Expected: PASS, with at least 80 public welfare opportunities still available.
