# Procurement Radar Phase 1.2A.2

This audit uses the shared OpportunityV2 main pipeline against five enabled copies in an isolated runtime. Production source files, pool, health, scheduler, and release were not touched. Public procurement additionally requires at least one approved business-domain tag; the generic procurement marker alone is not sufficient. Semantic evidence is recorded separately so manual-operation and manufacturing-process words cannot publish false positives.

- Run 1 successful sources: 5/5
- Run 2 successful sources: 5/5
- Run 1 raw/pool: 240/240
- Run 2 raw/pool: 240/240
- Public candidate: 5
- Approved domain-tag coverage: 5/5
- Semantic PASS/FAIL: 5/0
- Generic-only public procurement: 0
- Idempotency: PASS
