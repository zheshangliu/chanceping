# Chat-First Radar MVP Baseline

Baseline commit: `88b404a29179c9ecd908d10de6a646ac56b48c08`

Branch: `rescue/mvp-codex`

Baseline recorded at: `2026-07-01`

## Current Working Path

- Home input or template
- Radar profile confirmation
- Search/run result
- Opportunity cards
- Markdown report
- Save as long-term radar
- My Radar can see bound opportunities and report

## Regression Rule

Every later milestone must keep this path working.

Later milestones must not regress:

- Create or AI-generate a custom radar.
- Save the radar.
- Activate the radar.
- Manually run the radar.
- Return non-empty `opportunityCards`.
- Persist opportunities with the current `radarId` or `radarIds`.
- Show opportunity cards from the radar detail page.
- Generate a Markdown report.
- Bind the report to `radar_id + run_id`.
- Write the `reportId` back to `RadarRun`.
- Keep radar, run, opportunities, and reports available after reload.

## Baseline Verification

The local desktop runtime does not expose global `npm`, so validation used the bundled Node runtime with a temporary `/tmp` shim that maps `npm run <script>` to `node --run <script>`. No project script or package file was changed for this.

Commands and results:

```bash
npm run typecheck
```

Result: exit 0.

```bash
npm run verify:v15:e2e
```

Initial result: `verify-task034` nested regression flake appeared inside `verify-task038`.

Per plan, reran:

```bash
tsx scripts/verify-task034.ts
npm run verify:v15:e2e
```

Result after rerun:

- `verify-task034.ts`: 100 PASS / 0 FAIL.
- `verify:v15:e2e`: exit 0.
- V1.5 E2E: 40 PASS / 0 FAIL.
- V1.3 E2E: 43 PASS / 0 FAIL.
- Task 038: 75 PASS / 0 FAIL.
- Task 022: 73 PASS / 0 FAIL.
- Task 028: 119 PASS / 0 FAIL.

```bash
npm run verify:mvp-ux
```

Result: 45 PASS / 0 FAIL.

```bash
node -e "const p=require('./package.json'); console.log(p.scripts['verify:mvp-browser'] || '')"
npm run verify:mvp-browser
```

Result: `verify:mvp-browser` exists as `tsx scripts/verify-mvp-browser-smoke.ts` and exits 0.

## Browser Acceptance Path

Before Jason review, the visible product path should still be manually checked:

```text
首页
→ 输入“我是乒乓球选手，想了解国内外乒乓球比赛”
→ 盯机会
→ 画像确认
→ 确认，开始盯机会
→ 看到机会卡片
→ 看到报告摘要
→ 展开完整 Markdown
→ 保存为长期雷达
→ 我的雷达看到本次机会和报告
```

## Local Secret Rule

`api.env` is ignored by git and must remain local-only.

Checked with:

```bash
git check-ignore -q api.env && echo ignored
```

Result: `ignored`.
