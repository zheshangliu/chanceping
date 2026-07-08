# Q7V Custom Radar V1 Report Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make custom radar V1.0 usable for non-AI-event industries by removing provider-name leakage, allowing long live runs, and validating 10 novice-user industry flows until at least 9/10 produce an effective report.

**Architecture:** Keep the current one-window-one-radar UI and existing search/report APIs. This milestone only changes customer-visible progress wording, deployment timeout guidance, and adds a repeatable validation harness that exercises the real custom radar path. Search quality fixes discovered by the harness must be generic, not per-industry hard templates.

**Tech Stack:** Vanilla JS frontend in `web/`, Hono API under `src/api/`, Node/tsx verification scripts, SWAS/Workbench nginx/systemd deployment.

---

## File Map

- Modify: `/Users/1sunflower/Documents/chanceping/web/hero-radar-chat.js`
  - Customer-visible chat progress, radar generation/revision copy, and custom radar progress ticker.
- Modify: `/Users/1sunflower/Documents/chanceping/web/watch-result.js`
  - Legacy result-page loading copy for custom radar runs.
- Modify: `/Users/1sunflower/Documents/chanceping/web/radar-profile.js`
  - Legacy radar-profile loading copy for generating/revising radar profiles.
- Modify: `/Users/1sunflower/Documents/chanceping/web/radar-detail.js`
  - Radar detail rerun/report-generation loading copy.
- Modify: `/Users/1sunflower/Documents/chanceping/web/radars.js`
  - My Radars rerun/report loading copy.
- Modify: `/Users/1sunflower/Documents/chanceping/web/search.js`
  - Legacy search-tab loading copy.
- Modify: `/Users/1sunflower/Documents/chanceping/web/index.html`
  - Homepage preview copy that currently mentions provider behavior.
- Modify: `/Users/1sunflower/Documents/chanceping/scripts/verify-q7-hero-chat.ts`
  - Update customer-visible wording gates from provider names to “盯机会”.
- Modify: `/Users/1sunflower/Documents/chanceping/scripts/verify-q7-cloud-readiness.ts`
  - Update cloud-readiness wording gate to disallow provider names in customer-visible backend files.
- Modify: `/Users/1sunflower/Documents/chanceping/docs/deployment/aliyun-mvp-runbook.md`
  - Add nginx 600-second timeout guidance and update wording section.
- Create: `/Users/1sunflower/Documents/chanceping/scripts/run-q7v-custom-radar-10-smoke.ts`
  - Runs 10 custom-radar novice-user scenarios with stop-on-3-consecutive-failures logic.
- Create: `/Users/1sunflower/Documents/chanceping/Q7V_Custom_Radar_10_Smoke_Report.md`
  - Human-readable result report from the latest run.

---

## Pass Criteria

For each of 10 industry scenarios:

- V1.0 radar title and artifact must reflect the user’s industry, not “AI 赛事雷达”.
- Radar spec must contain relevant target user, intents, exclusion rules, and source/query direction.
- Report path must complete or fail with a clear long-run/timeout explanation.
- If opportunities are found, report must include at least one actionable card/lead and a Markdown summary.
- If no strong opportunities are found, report must explicitly explain why and suggest next source/query directions.
- Customer-visible progress text must use “盯机会”, not DeepSeek/Qwen/Serper/API/provider names.

Overall pass:

- At least 9/10 scenarios produce an effective V1.0 report or clear reasonable no-card explanation.
- If 3 scenarios fail consecutively, stop the run, write the partial report, fix the shared issue, then restart from scenario 1.
- No API key leakage.
- No silent mock fallback during live-mode tests.
- `verify:all` remains mock-safe.

---

## Task 1: Customer-Visible Progress Copy

**Files:**
- Modify: `/Users/1sunflower/Documents/chanceping/web/hero-radar-chat.js`
- Modify: `/Users/1sunflower/Documents/chanceping/web/watch-result.js`
- Modify: `/Users/1sunflower/Documents/chanceping/web/radar-profile.js`
- Modify: `/Users/1sunflower/Documents/chanceping/web/radar-detail.js`
- Modify: `/Users/1sunflower/Documents/chanceping/web/radars.js`
- Modify: `/Users/1sunflower/Documents/chanceping/web/search.js`
- Modify: `/Users/1sunflower/Documents/chanceping/web/index.html`
- Test: `/Users/1sunflower/Documents/chanceping/scripts/verify-q7-hero-chat.ts`
- Test: `/Users/1sunflower/Documents/chanceping/scripts/verify-q7-cloud-readiness.ts`

- [ ] **Step 1: Update wording gates first**

Replace checks that require Qwen/Serper wording with checks that require “盯机会” and reject provider names in customer-visible files.

```ts
const providerNameLeakPattern = /DeepSeek|deepseek|DEEPSEEK|Serper|SERPER|Qwen\s*正在|Qwen：|LLM\s*正在|provider/i;
check(
  "customer-visible backend progress uses ChancePing wording",
  !providerNameLeakPattern.test(customerVisibleWeb)
    && customerVisibleWeb.includes("盯机会正在理解并生成雷达")
    && customerVisibleWeb.includes("盯机会正在画雷达")
    && customerVisibleWeb.includes("盯机会正在搜索机会并整理证据")
    && customerVisibleWeb.includes("盯机会正在生成报告"),
);
```

Run:

```bash
node --run verify:q7:hero-chat
```

Expected: FAIL until frontend copy is updated.

- [ ] **Step 2: Replace visible provider copy**

Use this mapping in customer-visible strings only:

```text
Qwen 正在理解并生成雷达 -> 盯机会正在理解并生成雷达
Qwen 正在画雷达 -> 盯机会正在画雷达
Serper 正在搜索机会，Qwen 随后整理证据 -> 盯机会正在搜索机会并整理证据
Qwen 正在生成机会报告 -> 盯机会正在生成机会报告
Qwen 正在生成报告 -> 盯机会正在生成报告
Serper：正在... -> 盯机会正在...
Qwen：正在... -> 盯机会正在...
```

Do not replace source names such as “Qwen Cloud Hackathon” or public contest names.

- [ ] **Step 3: Verify no customer-visible provider leakage**

Run:

```bash
node --run verify:q7:hero-chat
node --run verify:q7:cloud-readiness
```

Expected:

```text
Q.7 hero chat: ... PASS / 0 FAIL
Q7 cloud readiness: ... PASS / 0 FAIL
```

---

## Task 2: 10-Minute Online Wait Guidance

**Files:**
- Modify: `/Users/1sunflower/Documents/chanceping/docs/deployment/aliyun-mvp-runbook.md`

- [ ] **Step 1: Add SWAS nginx timeout command**

Add this Workbench section:

```bash
sudo grep -R "proxy_pass.*3000\|127.0.0.1:3000\|localhost:3000" -n /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx/nginx.conf
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.$(date +%Y%m%d%H%M%S)
sudo nginx -T | grep -n "proxy_read_timeout\|proxy_send_timeout\|proxy_connect_timeout" || true
```

Then add inside the relevant `location` proxy block:

```nginx
proxy_connect_timeout 600s;
proxy_send_timeout 600s;
proxy_read_timeout 600s;
send_timeout 600s;
```

Validate:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] **Step 2: Document long-term async recommendation**

Add:

```text
10-minute synchronous waiting is acceptable for demo and early testing, but the durable production shape should be background run jobs plus progress polling.
```

---

## Task 3: Custom Radar 10-Scenario Smoke Harness

**Files:**
- Create: `/Users/1sunflower/Documents/chanceping/scripts/run-q7v-custom-radar-10-smoke.ts`
- Modify: `/Users/1sunflower/Documents/chanceping/package.json`
- Output: `/Users/1sunflower/Documents/chanceping/Q7V_Custom_Radar_10_Smoke_Report.md`

- [ ] **Step 1: Add package script**

Add:

```json
"q7v:custom-radar-10": "tsx scripts/run-q7v-custom-radar-10-smoke.ts"
```

- [ ] **Step 2: Implement scenario list**

Use these 10 scenarios:

```js
const SCENARIOS = [
  { id: "heritage-embroidery", input: "我是在广州从事广绣的非遗传承人，我想找订购广绣订单需求的客户，看看有没有项目采购、文旅合作、企业礼品定制或者展陈委托机会。" },
  { id: "employee-benefits", input: "我们做员工福利和节日礼品供应，想找广东和香港未来 60 天企业福利采购、工会福利项目、节日礼品招标，排除加盟广告。" },
  { id: "pet-products", input: "我们是宠物用品品牌，想找宠物展、渠道商、平台招商、品牌联名和线下市集机会。" },
  { id: "industrial-green", input: "我们做工业环保设备，想找环保项目招标、政府采购、园区改造、制造业绿色转型项目机会，重点看广东和长三角。" },
  { id: "kids-coding", input: "我们是少儿编程培训机构，想找招生合作、学校课后服务、赛事承办、课程采购和机构合作机会。" },
  { id: "wedding", input: "我们是一家广州婚庆公司，想找高端客户、酒店合作、商场活动、品牌联名和婚礼展会机会。" },
  { id: "b2b-saas-retail", input: "我们是 B2B 商品交易 SaaS，准备出海东南亚，想找零售展会、FMCG 渠道、便利店商超、POS/ERP 伙伴和代理商线索。" },
  { id: "handmade-accessory", input: "我们是手工饰品工作室，想找能卖货或者曝光的机会，比如市集、平台入驻、买手店合作和品牌联名。" },
  { id: "eap", input: "我们做企业心理咨询和 EAP 服务，想找企业员工关怀采购、工会福利、HR 服务商合作和园区企业合作机会。" },
  { id: "ai-events", input: "我是大湾区 OPC / AI 产品创业者，想找未来 30-60 天还可报名的 AI 比赛、Hackathon、云资源扶持和产品展示机会。" },
];
```

- [ ] **Step 3: Implement stop-on-3-consecutive-failures**

Pseudo-code:

```js
let consecutiveFailures = 0;
for (const scenario of SCENARIOS) {
  const result = await runScenario(scenario);
  if (result.status === "pass" || result.status === "near_pass") {
    consecutiveFailures = 0;
  } else {
    consecutiveFailures += 1;
  }
  if (consecutiveFailures >= 3) {
    resultReport.stoppedEarly = true;
    resultReport.stopReason = "3 consecutive scenario failures";
    break;
  }
}
```

- [ ] **Step 4: Classify effective report**

Minimum effective report rules:

```js
function classifyResult({ generated, search, report }) {
  const radarTitle = generated?.suggestedName || generated?.radarVersion?.oneSentencePositioning || "";
  const cards = search?.data?.opportunityCards || search?.opportunityCards || [];
  const markdown = report?.data?.markdown || report?.markdown || "";
  const isAiMisroute = /AI\s*赛事雷达|全球 AI 赛事导航/.test(radarTitle) && !/AI|赛事|比赛|Hackathon|黑客松/.test(input);
  const hasActionableCards = cards.length > 0;
  const hasMarkdown = markdown.length > 200;
  const hasNoCardExplanation = /未找到|不足|观察线索|下一轮|建议/.test(markdown);
  if (isAiMisroute) return { status: "fail", reason: "misrouted_to_ai_events" };
  if (hasActionableCards && hasMarkdown) return { status: "pass", reason: "cards_and_report" };
  if (hasMarkdown && hasNoCardExplanation) return { status: "near_pass", reason: "clear_no_card_explanation" };
  return { status: "fail", reason: "no_effective_report" };
}
```

---

## Task 4: Run, Diagnose, Fix Loop

**Files:**
- Output: `/Users/1sunflower/Documents/chanceping/Q7V_Custom_Radar_10_Smoke_Report.md`
- Modify only generic mechanism files when needed.

- [ ] **Step 1: Run structural mock-safe tests**

```bash
node --run typecheck
node --run verify:q7:hero-chat
node --run verify:v15:e2e
node --run verify:mvp-browser
node --run verify:all
git diff --check
```

- [ ] **Step 2: Run 10-scenario custom radar smoke**

Local mock-safe:

```bash
node --run q7v:custom-radar-10
```

Live, only when explicitly intended:

```bash
CHANCEPING_LOAD_API_ENV=true \
CHANCEPING_ENABLE_LOCAL_LIVE_SEARCH=true \
CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true \
CHANCEPING_LLM_PROFILE=contest \
LLM_MODE=live \
DATA_MODE=live \
node --run q7v:custom-radar-10
```

- [ ] **Step 3: If 3 consecutive failures occur, stop and fix shared cause**

Allowed generic fixes:

```text
- Custom radar misrouting out of built-in AI events sample room.
- Report API receiving HTML timeout page instead of JSON.
- Customer-visible progress copy too static or provider-leaking.
- Generic search planner/query-family issue.
- Generic no-card explanation issue.
```

Disallowed fixes:

```text
- Hard-code one-off industry templates.
- Lower gates just to force weak cards.
- Mark unverified search discoveries as confirmed facts.
```

- [ ] **Step 4: Repeat until 9/10 pass or near-pass**

Final report must include:

```text
- Scenario id
- Input
- Radar title
- Card count
- Markdown generated yes/no
- Classification: pass / near_pass / fail
- Failure reason
- Consecutive failure checkpoint
- Generic fix applied, if any
```

---

## Task 5: Commit and Deployment Handoff

**Files:**
- All modified files from Tasks 1-4.

- [ ] **Step 1: Commit**

```bash
git add web/hero-radar-chat.js web/watch-result.js web/radar-profile.js web/radar-detail.js web/radars.js web/search.js web/index.html scripts/verify-q7-hero-chat.ts scripts/verify-q7-cloud-readiness.ts scripts/run-q7v-custom-radar-10-smoke.ts package.json docs/deployment/aliyun-mvp-runbook.md Q7V_Custom_Radar_10_Smoke_Report.md
git commit -m "Q7V: validate custom radar V1 report flow"
```

- [ ] **Step 2: Push**

```bash
git push origin rescue/mvp-codex
```

- [ ] **Step 3: Workbench deploy**

```bash
cd /opt/chanceping && \
git fetch origin rescue/mvp-codex && \
git pull --ff-only origin rescue/mvp-codex && \
git archive --format=tar HEAD | tar -x -C /opt/chanceping/current && \
systemctl restart chanceping && \
systemctl status chanceping --no-pager -l
```

- [ ] **Step 4: Workbench nginx 10-minute timeout**

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Only run after adding the timeout settings to the active nginx proxy block.

---

## Self-Review

- Spec coverage: The plan covers provider-name removal, long online wait, 10-industry novice simulation, stop-on-3-failures, and 9/10 completion.
- Placeholder scan: No TODO/TBD placeholders remain.
- Scope check: This is one milestone focused on custom radar V1.0 effectiveness and does not add multi-radar memory, payment, source marketplace, or new public UI.
- Risk: Live 10-scenario testing may be slow and costly; the script must default to mock-safe mode and require explicit live env flags for live runs.
