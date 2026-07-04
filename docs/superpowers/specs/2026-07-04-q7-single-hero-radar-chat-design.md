# Q.7 Single Hero Radar Chat Design

## Product Decision

ChancePing MVP will first polish one hero radar instead of trying to prove broad industry coverage.

The hero scenario is:

```text
AI 创业者 / OPC 创业者 / 个人开发者
→ 寻找 AI 比赛、AI Agent 大赛、Hackathon、云厂商扶持、开发者挑战、产品展示机会
```

This is not a pivot to an AI competition-only product. The backend source of truth remains the existing generic `RadarVersionSpec`, `RadarDiff`, search pipeline, Q.5/Q.6 gates, `RadarRun`, `OpportunityCards`, and Markdown report generator. The current milestone only changes the first customer path so the single hero radar feels like a GPT-style assistant flow.

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
- weakening Q.6 gates to make the demo look better

The existing "free user has 3 radars" product rule remains, but it is not the main demo. The current demo optimizes the first radar path.

## User Story

The intended demo path:

```text
User opens ChancePing
→ sees a chat-first AI entrepreneur radar workspace
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
→ Markdown report appears in the chat
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
Tell ChancePing what AI opportunity radar you want to build.
```

Remove or hide the multi-template examples from the main hero path:

- AI 赛事
- 创业比赛申报
- 奥数竞赛
- 乒乓球赛事

They can remain in files for legacy tests or future examples, but they should not compete with the hero demo on the main path.

### Chat Workspace

Minimum structure:

```text
top: AI 创业者机会雷达
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

Expanded view should show:

- target user
- opportunity intents
- high-value criteria
- exclusion rules
- source archetypes
- query families
- default assumptions
- missing config
- RadarDiff from the last revision

### Search Progress

After confirmation, append user-visible progress messages:

```text
正在按 Radar V1.2 搜索机会……
正在搜索官方来源……
正在筛选可报名机会……
正在排除展会资讯和弱页面……
正在生成机会卡和 Markdown 报告……
```

These are progress summaries, not internal chain-of-thought.

### Report Artifact

After search and report generation, append a report artifact:

- Markdown summary, collapsed or previewed
- button: `查看本次机会卡`
- optional copy Markdown action

The button should reuse the existing result/detail path rather than building a new opportunity detail system.

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

1. homepage no longer shows the old multi-template example buttons in the primary hero path
2. chat UI has message stream and persistent input
3. first AI entrepreneur message creates Radar V1.0 artifact
4. correction message creates a newer radar artifact with `RadarDiff`
5. result feedback calls revision rather than blind rerun
6. confirmation is required before search
7. after confirmation, report artifact contains Markdown
8. report artifact includes `查看本次机会卡`
9. clicking `查看本次机会卡` reaches existing result/detail surface
10. Q.6 regressions still pass
11. `verify:all` stays mock-safe

## Acceptance Criteria

Q.7-D/E/F/G are acceptable when:

- one AI entrepreneur hero demo path works from chat input to Markdown report
- user can revise the radar at least twice before confirmation
- Radar V1.0 → V1.1 → V1.2 is visible in the chat
- RadarDiff is visible and understandable
- search never runs before confirmation
- Markdown report appears in the chat after search
- the user can open the existing opportunity card detail path
- old example templates do not distract from the main hero path
- Q.5/Q.6 gates still pass
- `node --run verify:all` passes

## Future Work

After the first hero radar is stable:

1. promote hero chat state into real `RadarChatWindow`
2. bind one chat window to one saved radar
3. add persistent chat messages
4. add memory summary
5. reintroduce multiple radar windows
6. add paid signal sources such as WeChat public account search

Do not start those before the first AI entrepreneur radar is demo-ready.
