# 2026-07-12 Product Focus: AI Events and Generic Radar Reliability

## Decision

ChancePing will not treat a random-industry `9/10` card-count result as a release blocker. Industries and their public opportunity supply are unbounded; forcing every scenario to return cards encourages unsafe, per-industry patches.

## Custom Radar Success Criteria

The custom-radar product must reliably support:

1. Natural-language requirement -> structured V1.0 radar draft.
2. User confirmation -> asynchronous search and Markdown report.
3. A relevant opportunity card **or** an honest no-card explanation with next search direction.
4. Refresh recovery, retained radar/run/report links, and no silent mock fallback.
5. Result feedback returns to the same radar chat window for a later revision.

Random-industry scenarios remain a diagnostic suite. Fix only shared failures such as composite-term parsing, generic page admission, task recovery, or broken report persistence.

## AI Events Priority

AI Events is the first public, continuously updated product surface. Prioritize:

1. Source health and staged source onboarding.
2. Current vs historical event lifecycle.
3. Field enrichment: cover, deadline, prize, region, contest type and official URL.
4. Scheduled update reliability and source-health reports.
5. Public data presentation improvements after data correctness is stable.

## Guardrails

- Do not add `if industry === ...` templates to make diagnostic scenarios pass.
- Do not invent opportunity cards where evidence is weak.
- Keep Qwen revision as a schema-validated draft-first step; deterministic revision is failure-only fallback.
- Keep API and provider names out of customer-facing UI.
