# V1.3.1 Opportunity Generation Run

- Run ID: `headhunter-v13-1788497304633`
- Started: 2026-09-04T04:48:23.191Z
- Finished: 2026-09-04T04:48:24.633Z
- Production publish: false
- TikHub calls: 0

## Discovery and opportunity generation

- Discovery queries: 12
- Candidate URLs: 93
- Event status: {"stale":12,"insufficient_event_evidence":46,"aggregator_only":26,"generic_page":3,"evergreen_reference":6}
- Generated opportunity records: 93
- Candidate opportunities (not rejected): 0
- Eligible opportunities: 0
- Eligible Signals: 0
- Verified Companies: 0
- Deep-dive Companies: 0
- Jobs: 0
- People: 0
- Contacts: 0
- Machine A: 0
- B: 0

## Precision and safety

- Company identity review: 0/0 resolved
- Regression checked: 0
- Severe contamination: 0
- Freshness failures: 0
- RA1/Cantonese: enforced by existing literal-only classifiers
- TikHub: 0

## Cost

- Known cost: unknown
- Unknown providers: serper, doubao_search
- Cost / eligible signal: unknown
- Cost / contactable lead: unknown

## Gate

Production routing remains HOLD. Candidate opportunities are generated with a separate discovery score; BusinessScore, Eligibility, Gate and provider routing remain unchanged. Human review is required before any opportunity is promoted.
