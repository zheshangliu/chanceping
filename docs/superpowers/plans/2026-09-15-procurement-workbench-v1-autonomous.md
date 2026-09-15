# Procurement Workbench V1 autonomous delivery plan

## Goal

Complete the package's M0→M3 delivery on top of the fixed procurement business release: close out the five-source launch when repository/production gates permit, add a narrow procurement workbench with private follow-up and change summaries, connect three to five high-value source families through the existing OpportunityV2 pipeline, and leave an auditable final delivery report without fabricating live coverage.

## Safety and scope

- Work only in the clean business worktree based on `release-procurement-phase1-2b-20260913-f514ee6`; preserve the user's dirty shared checkout.
- Keep OpportunityV2's existing schema, scheduler, competition Radar/Memo behavior, authentication boundary, and five core source identities intact.
- Synthetic fixtures stay test-only. No paid registrations, vendor accounts, bids, external notifications, DNS changes, or production writes outside an explicitly gated M0/M1/M2 release.
- Stage only files belonging to this delivery. Record unknown or blocked external states instead of inferring success from static checks.

## Execution steps

1. M0 baseline and offline closeout: validate the handoff package; inspect the actual release, control-plane scripts, source/runtime helpers, PR state, and repository protections; run the target release and control-plane contract tests with valid, invalid, rollback-success, and rollback-failure fixtures; record baseline and stop/continue state.
2. M0 production decision: if the existing PR and production approvals are actually available, use the existing guarded workflow with the fixed five-source business tag, backup/runtime checks, two-run quality gates, public smoke, and rollback evidence. Otherwise preserve production and record the exact external blocker while continuing offline work.
3. M1 behavior first: add failing tests for assessment, exclusion/negative cases, date precision, unknown eligibility, private follow-up persistence and authorization, then implement the smallest compatible workbench assessment and follow-up sidecar using existing file-lock/atomic storage patterns.
4. M1 surface and export: add or extend the narrow procurement workbench route/page, authorized follow-up endpoints, filtered public reads, UTF-8 Markdown/CSV exports with escaping, and a real behavior verifier covering refresh, authorization, XSS/CSV safety, and separation of current/early/research lanes.
5. M1 change feed: add semantic snapshot comparison and station digest/Markdown output at the existing pipeline boundary, with deduplication for repeated changes and no false events for `last_seen_at` or temporary absence; keep external sending disabled.
6. M2 source adapters: verify candidates in the package order and with public official evidence; for each selected family add a narrow parser, positive/negative fixtures, source metadata, bounded live smoke if accessible, and disabled-by-default migration. Select at least two mainland and one cross-border family where evidence and access allow; record honest blockers and stop at five families.
7. M3 real-data delivery: run the allowed bounded refresh only for integrated sources, produce source contribution/quality/coverage and business digest artifacts, capture UI/route smoke evidence where tooling allows, run the complete relevant regression suite, and write the package's final delivery and run state with actual numbers and evidence levels.
8. Release: review the diff for unrelated files, create focused commits (M0 control-plane only if needed, then business delivery), push the intended branch/PR using the ChancePing push/deploy skill, and deploy only when the taskbook's production authorization, approvals, backups, and hard gates are satisfied. Otherwise report `SHIPPED_WITH_BACKLOG` or `EXTERNAL_BLOCKED` with the exact next human action.

## Verification checklist

- `python3 tools/validate_package.py` passes for the handoff package.
- `npm run typecheck`, `npm run verify:v15:e2e`, and available relevant procurement/workbench/change/source verifiers run with cwd and commit recorded.
- Positive and negative business fixtures exercise behavior, not field existence.
- Public output contains no private follow-up notes or synthetic fixture rows; source IDs, opportunity identity, canonical/evidence URLs, dates, stage and field unknowns remain traceable.
- Production claims use `PRODUCTION_EXECUTED` evidence only; otherwise use `CODE_READ`, `FIXTURE_EXECUTED`, or `LIVE_READ`/`NOT_RUN` explicitly.
