# Q.6 Candidate Relevance Implementation Plan

**Goal:** Reduce false-positive live opportunity cards without overfitting Golden 20 or removing useful cross-industry opportunities.

**Scope:** This milestone contains Q.6-0 (human-labelled relevance dataset) and Q.6-A (deterministic evidence-based relevance gate). It explicitly excludes LLM batch judging, ranking/card caps, N/O, deployment, and V1.7 work.

## Commit 1: Q.6-0 Candidate Relevance Dataset

- Add 30 balanced, human-labelled candidate cases outside a single-industry template.
- Cover positive retention plus subject, target, action, source, freshness, region, and opportunity mismatches.
- Validate dataset shape, balance, scenario coverage, unique IDs, and critical cases.
- Keep production behavior unchanged.

## Commit 2: Q.6-A Evidence-Based Relevance Gate

- Add structured fit dimensions with `match | mismatch | unknown` states.
- Derive terms and intent classes from `RadarVersionSpec`; do not add industry-name `if/switch` branches.
- Normalize source archetypes before comparing source fit.
- Treat explicit expired deadlines as reject, old-year-only pages as downgrade, and missing dates as unknown.
- Insert the gate after search/deduplication and before limited content fetch and scoring.
- Keep downgraded candidates as watch signals and rejected candidates in audit data only.
- Require at least 90% offline accuracy and 90% positive retention, with zero accepted critical mismatches.

## Verification

- `node --run verify:q6:dataset`
- `node --run verify:q6`
- `node --run typecheck`
- `node --run verify:q5`
- `node --run verify:v15:e2e`
- `node --run verify:all`
- `git diff --check`

After Q.6-A, run only the ten previously partial live cases as a diagnostic. Stop before Q.6-B even if live quality remains below the target.
