# Q.7 Chat-First AI 赛事雷达 UI Design

## Product Decision

ChancePing MVP will first polish one hero radar instead of trying to prove broad industry coverage.

The formal hero demo name is:

```text
AI 赛事雷达
```

The target user for this demo is:

```text
AI 创业者 / OPC 创业者 / 个人开发者
→ 寻找 AI 比赛、AI Agent 大赛、Hackathon、云厂商扶持、开发者挑战、产品展示机会
```

This is not a pivot to an AI competition-only product. "AI 赛事雷达" is the contest demo packaging for the first polished radar. The backend source of truth remains the existing generic `RadarVersionSpec`, `RadarDiff`, search pipeline, Q.5/Q.6 gates, `RadarRun`, `OpportunityCards`, and Markdown report generator. The current milestone only changes the first customer path so the single hero radar feels like a GPT-style assistant flow.

The principle for this phase:

> First make one radar feel alive. Later, copy the live-radar pattern into multi-radar mode.

## Non-Goals

This phase does not implement:

- full multi-radar chat workspace
- real login or user account management
- paid plans
- WeChat / X / Facebook / YouTube signal sources
- Radar marketplace
- team collaboration
- Golden 20 or Random 20 as a blocking test
- a rewrite of the existing radar/search/report architecture
- a new database layer
- a migration to `assistant-ui`, `shadcn/ui`, or `react-markdown`
- a full UI-QA toolchain before the new chat UI exists
- weakening Q.6 gates to make the demo look better

The existing "free user has 3 radars" product rule remains, but it is not the main demo. The current demo optimizes the first radar path.

## User Story

The intended demo path:

```text
User opens ChancePing
→ sees a GPT-style AI 赛事雷达 chat workspace
→ types: 我是个人开发者，想找 AI 比赛机会
→ assistant says it is generating Radar V1.0
→ a radar artifact appears in the chat
→ user says: 我不是学生，我是 OPC 创业者，优先奖金、云资源、上架展示
→ assistant upgrades to Radar V1.1 and shows a RadarDiff
→ user says: 不要展会资讯，我要能报名的比赛
→ assistant upgrades to Radar V1.2 and shows a RadarDiff
→ user confirms Radar V1.2
→ search runs
→ chat shows progress messages
→ Markdown report summary appears in the chat
→ user opens the full Markdown report in a centered modal
→ user clicks "查看本次机会卡"
→ existing result/detail page shows opportunity cards and report details
```

If the user later says the result is wrong, the same chat input should call the existing radar revision path with `trigger = "result_feedback"` and produce a new draft radar version before any rerun.

## Architecture

### Preserve Existing Core

Keep these as the core pipeline:

- `RadarRequirementSpec`
- `RadarVersionSpec`
- `RadarVersionDiff`
- `reviseRadarVersion`
- `reviseRadarVersionWithLlm`
- `/api/radars/generate`
- `/api/radars/revise`
- `/api/search`
- `/api/reports/generate`
- Q.5 semantic admission
- Q.6 candidate gates
- existing opportunity card and report rendering

The chat UI is an interaction shell, not a replacement for the radar model.

### Single Hero Session

Do not add full `RadarChatWindow` persistence yet. Instead add a minimal, local, first-radar session model on top of the existing frontend state:

```ts
interface HeroRadarChatState {
  messages: HeroRadarChatMessage[];
  currentDraft?: {
    spec: RadarRequirementSpec;
    radarVersion: RadarVersionSpec;
    radarDiff?: RadarVersionDiff;
    suggestedName: string;
  };
  currentResult?: {
    runId?: string;
    radarId?: string;
    markdown?: string;
    opportunityCards?: OpportunityCard[];
  };
}

interface HeroRadarChatMessage {
  id: string;
  role: "user" | "assistant" | "system_event";
  content: string;
  artifact?: HeroRadarArtifact;
  createdAt: string;
}

type HeroRadarArtifact =
  | { type: "radar"; version: string; status: "draft" | "confirmed"; payload: RadarVersionSpec; diff?: RadarVersionDiff }
  | { type: "progress"; steps: string[] }
  | { type: "report"; markdown: string; runId?: string; radarId?: string }
  | { type: "opportunity_cards"; cards: OpportunityCard[]; runId?: string; radarId?: string };
```

This state can live in `web/hero-radar-chat.js` and may use `sessionStorage` for reload resilience. It should not replace the existing radar store.

### Future-Ready Naming

Names may reference chat concepts, but they must stay scoped to the hero flow:

- `HeroRadarChatState`
- `HeroRadarChatMessage`
- `hero-radar-chat.js`

Do not introduce global production names such as `RadarChatWindowStore` or `RadarMemorySummaryStore` in this phase. Those belong to future multi-radar work.

## LLM Revision Flow

The existing Q.7-C LLM reviser remains the main smart step:

```text
user message
→ current draft spec/radar version
→ /api/radars/revise with revisionMode = "llm" when explicitly enabled
→ LLM proposes radar revision
→ system validates and merges
→ fallback to deterministic reviser if invalid
→ frontend renders RadarDiff and waits for confirmation
```

For demo safety, the frontend can start with deterministic mode by default and expose live LLM only when local environment enables it. The design requirement is that the chat input calls the radar revision path for every correction or result feedback; it must not manually patch individual fields.

LLM must not:

- search
- create opportunity cards
- persist a confirmed radar
- invent deadlines, contacts, eligibility, registration status, fees, or purchase intent

## Frontend Design

### Homepage

For the hero demo, the first screen should serve one task:

```text
今天你想找什么机会？
```

Homepage requirements:

- one clean input only
- no second composer or duplicate input
- no old multi-template cards in the primary hero path
- display the product as `AI 赛事雷达`
- keep the visual tone close to GPT: quiet, centered, low-friction

Remove or hide the multi-template examples from the main hero path:

- AI 赛事
- 创业比赛申报
- 奥数竞赛
- 乒乓球赛事

They can remain in files for legacy tests or future examples, but they should not compete with the hero demo on the main path.

### Sidebar

Use a GPT-like left sidebar as the shell for the future "one chat window = one radar" model.

For this phase:

- sidebar shows the ChancePing brand
- primary action is `新雷达`
- list contains only the current `AI 赛事雷达`
- sidebar can be collapsible, but desktop may show it by default
- do not implement full multi-radar persistence yet

The sidebar is an interaction shell. It must not require a backend architecture rewrite in this phase.

### Chat Workspace

Minimum structure:

```text
left: radar sidebar
right top: AI 赛事雷达
middle: message stream
bottom: input box + send button
```

Message stream supports:

- user message bubble
- assistant message bubble
- radar artifact card
- progress message
- Markdown report artifact
- "查看本次机会卡" button

The page should feel like the user is talking to an assistant. It should not look like a form wizard.

Message styling:

- user messages align to the right with a distinct soft background
- ChancePing messages align to the left or center column with a neutral card background
- artifacts sit inside the assistant timeline but stay compact
- the input stays at the bottom and remains the main action

### Radar Artifact

The radar artifact card should show:

- radar name
- version
- one-line positioning
- watching / excluding / high-value summary
- draft or confirmed state
- buttons:
  - `查看雷达画像`
  - `确认，按 Vx.x 盯一次`

The chat stream should not show the full radar inline. Clicking `查看雷达画像` opens a centered modal.

Centered modal content:

- target user
- opportunity intents
- high-value criteria
- exclusion rules
- source archetypes
- query families
- default assumptions
- missing config
- RadarDiff from the last revision

The modal approach is chosen over a right drawer for this phase because it keeps the chat window clean, is easier to understand in a demo recording, and avoids introducing a complex split-panel layout.

### Search Progress

After confirmation, append user-visible progress messages:

```text
正在搜索官方赛事页、云厂商开发者活动和 Hackathon 平台……
正在筛选可报名、可提交作品、可申请资源的机会……
正在排除展会资讯、培训广告和学生专属结果……
正在生成机会卡和 Markdown 报告……
```

These are progress summaries, not internal chain-of-thought.

### Report Artifact

After search and report generation, append a report artifact:

- concise summary only in chat
- counts for valid opportunities and S/A/B/C levels when available
- centered modal for the full Markdown report
- button: `查看本次机会卡`
- optional copy Markdown action

The button should reuse the existing result/detail path rather than building a new opportunity detail system.

### My Radars Page

Keep the existing `我的雷达` page, but align it with the chat-first model:

- show saved custom radars only
- show each radar's short name
- show latest radar version, such as `V1.2`
- allow future user rename, but do not make rename a blocking item for the first UI pass
- add `编辑雷达`
- `编辑雷达` opens the corresponding chat window so the user can continue requirements, trigger LLM revision, confirm a new radar version, then run again

For this phase, only `AI 赛事雷达` must be polished. Multi-radar growth comes later.

## UI-QA Tooling Strategy

The UI tool selection from `Task_UI界面检查工具链接入_任务书.md` is accepted as the quality direction, but it should be introduced in phases.

### Do Now: Record Standards

Record the style principles in this design:

- white page background plus light gray surface
- white cards with subtle borders
- minimal shadows
- restrained accent color
- large whitespace
- one primary action per screen
- small level/status badges
- source/evidence status as quiet badges
- Markdown/report actions should not dominate opportunity cards

Reference sources are allowed as design inspiration only:

- Semi Design as the main reference for cards, tags, empty states, and AI chat input
- Ant Design, TDesign, and Arco as secondary references

Do not import an entire design system in this phase.

### Introduce During Q.7-J Implementation

When the first Chat-First UI implementation begins, add lightweight checks first:

- extend `scripts/verify-q7-hero-chat.ts`
- extend `scripts/verify-mvp-browser-smoke.ts`
- capture basic screenshots for the new AI 赛事雷达 path

This protects the exact UI being built instead of auditing obsolete screens.

### Introduce After First Chat UI Pass

After the first Chat-First UI is visible, add the first UI-QA toolchain slice:

- Lighthouse report
- axe-core accessibility scan
- Playwright Screenshot baseline
- `reports/ui-audit/` output folder
- first UI audit report with prioritized findings

Do not add this to `verify:all` until it is stable and mock-safe.

### Defer

Defer these until RC / polish:

- stylelint
- Pa11y
- screenshot diff workflow
- heavier visual regression tooling
- full ui-audit / TRAE skill process

The reason is timing: tools should protect the new design after it exists, not slow down the transition from the old page.

## API Design

No large backend rewrite is required.

Use existing endpoints:

- `POST /api/radars/generate` for V1.0
- `POST /api/radars/revise` for V1.1/V1.2
- `POST /api/search` for unsaved confirmed radar search
- `POST /api/reports/generate` for Markdown report
- existing save/radar detail APIs if the user saves the radar

Add a small hero-chat API only if frontend-only state proves too brittle:

```http
POST /api/hero-radar-chat/messages
```

But this is not required for the first implementation. Prefer reusing current APIs first.

## Testing

New tests should prove behavior, not just field existence.

Add or update:

- `scripts/verify-q7-hero-chat.ts`
- `scripts/verify-mvp-ux.ts`
- `scripts/verify-mvp-browser-smoke.ts`

Checks:

1. Homepage no longer shows the old multi-template example buttons in the primary hero path.
2. Homepage has exactly one primary composer with `今天你想找什么机会？`.
3. Chat UI has a sidebar, message stream, and persistent input.
4. First AI 赛事雷达 message creates Radar V1.0 artifact.
5. Correction message creates a newer radar artifact with `RadarDiff`.
6. Result feedback calls revision rather than blind rerun.
7. Confirmation is required before search.
8. Radar artifact opens full details in a centered modal.
9. After confirmation, chat shows progress messages.
10. After report generation, chat shows a concise report summary.
11. Full Markdown opens in a centered modal.
12. Report artifact includes `查看本次机会卡`.
13. Clicking `查看本次机会卡` reaches existing result/detail surface.
14. `我的雷达` shows version and an `编辑雷达` entry point.
15. Q.6 regressions still pass.
16. `verify:all` stays mock-safe.

## Acceptance Criteria

Q.7-D/E/F/G are acceptable when:

- one AI 赛事雷达 hero demo path works from chat input to Markdown report
- user can revise the radar at least twice before confirmation
- Radar V1.0 → V1.1 → V1.2 is visible in the chat
- RadarDiff is visible and understandable
- radar details open through a centered modal, not a huge inline block
- search never runs before confirmation
- report summary appears in the chat after search
- full Markdown opens through a centered modal
- the user can open the existing opportunity card detail path
- old example templates do not distract from the main hero path
- UI-QA tooling timing is documented and does not block the first UI implementation
- Q.5/Q.6 gates still pass
- `node --run verify:all` passes

## Future Work

After the first AI 赛事雷达 is stable:

1. promote hero chat state into real `RadarChatWindow`
2. bind one chat window to one saved radar
3. add persistent chat messages
4. add memory summary
5. reintroduce multiple radar windows
6. add paid signal sources such as WeChat public account search

Do not start those before the first AI 赛事雷达 is demo-ready.
