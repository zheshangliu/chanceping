# Q7Z Async Custom Radar Run Plan

## Goal

Move custom radar live runs from one long synchronous browser request into a pollable backend task:

1. User confirms a radar version.
2. Frontend starts a radar job.
3. Backend searches and generates the Markdown report.
4. Frontend polls progress with customer-facing `盯机会` copy.
5. Final cards and report return to the chat without exposing provider names.

This is a UX reliability layer. It does not change Q.6 gates, search strategy, or AI Events public page logic.

## Scope

- Add `/api/radar-jobs/run` and `/api/radar-jobs/:jobId`.
- Keep progress messages alive during long search/report work.
- Hide provider/model names from customer-visible progress and errors.
- Wire hero chat custom radar runs to the job API.
- Preserve demo replay for the built-in public AI Events radar.

## Out Of Scope

- No new provider.
- No Q.6 ranking/gate changes.
- No multi-tenant auth.
- No paid plans.
- No direct production environment edits.

## Verification

- `node --run verify:q7z:async-radar-jobs`
- `node --run verify:q7:hero-chat`
- `node --run verify:q7y:custom-radar-ux`
- `node --run typecheck`
- `node --run verify:v15:e2e`
- `node --run verify:all`
- `git diff --check`

