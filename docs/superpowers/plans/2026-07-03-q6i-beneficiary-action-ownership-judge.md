# Q.6-I Beneficiary & Action Ownership Judge

## Goal

Q.6-I adds a final safety gate before candidate ranking: decide whether a candidate is actually for the current user, and whether the user can perform the action implied by the page.

This milestone does not expand search recall. It prevents pages that look action-related from becoming key cards when the beneficiary or action owner is mismatched.

## Problem

After Q.6-H, weak sources and secondary pages are less likely to enter key cards, but several live cases still had a subtler problem:

- A page is official or action-like, but only useful as observation.
- A page is a job listing, but the radar user is a headhunter, not a job seeker.
- A procurement page has action words, but the scope is not the user's service category.
- A sports calendar is relevant to an athlete, but has no registration or entry path.

## Design

`CandidateOwnershipAssessment` is attached to each `SearchResult` after the relevance, page-type, and candidate-judge gates.

The assessment records:

- `pageAudience`: who the page mainly serves.
- `currentUserActionMode`: what the current user can do.
- `opportunityRoleForUser`: how the candidate should be treated for this radar.
- `ownershipDecision`: `accept`, `downgrade_to_watch_signal`, or `reject`.
- `ownershipReason` and `reasonCodes`: audit-only explanations.

This is not a verified fact layer. It is a conservative card-admission gate based on title, snippet, URL, semantic bucket, prior gate output, and `RadarVersionSpec`.

## Key Rules

### Table Tennis Athlete

- Registration, entry, and competition application pages may become key cards.
- Calendars, schedules, news, and highlights are downgraded unless they show a clear player action path.

### Headhunter

- Company career pages with finance, treasury, tax, controller, or internal-control signals may become hiring signals.
- Job aggregators, recruitment-agency service pages, and recruitment-consultant jobs are observation or rejection.
- The radar is looking for client/employer signals, not job opportunities for the headhunter.

### Industrial Environmental Vendor

- Environmental equipment, waste-gas treatment, wastewater treatment, dust collector, and governance-service tenders may become procurement opportunities.
- Generic procurement pages, policy pages, renovation, greening, sanitation, or unrelated education-resource tenders are downgraded or rejected.

## Pipeline

Live product path now applies:

```text
search results
→ Q.6-A relevance gate
→ Q.6-D page-type gate
→ Q.6-B candidate judge
→ Q.6-I ownership gate
→ Q.6-C ranking/card cap
```

Ranking excludes any candidate whose `ownershipDecision` is not `accept`.

## Verification

Added `node --run verify:q6i`.

The focused regression covers:

- Table tennis calendars versus entry pages.
- Headhunter self-job pages, agency pages, job aggregators, and real company career signals.
- Industrial environmental policy pages, unrelated tenders, and true equipment tenders.
- Ranking must not materialize rejected or downgraded ownership candidates into key cards.

## Expected Next Step

After Q.6-I, run Selected 10 live diagnostics. If safety improves and no obvious beneficiary/action-owner mismatch enters the top cards, move to Golden 8 / Random 10 / Golden 20 rerun. Do not continue endless Q.6 micro-fixes unless a new systematic blocker appears.
