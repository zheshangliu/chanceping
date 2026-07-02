# Milestone Q.2 Opportunity Strategy Engine Design

## Goal

Make each confirmed `RadarVersionSpec` produce an auditable execution strategy that improves search relevance, preserves industry-specific lead semantics, and turns discovered evidence into honest next actions.

## Scope

Q.2 extends the existing Q.1 planner. It does not add a parallel search system or redesign the UI. It does not add login, sharing, a radar marketplace, payments, deployment, file parsing, Qwen compatibility, or V1.7 source transparency.

## Data Boundaries

`RadarVersionSpec` remains the saved long-term radar definition. A new `OpportunityStrategy` is derived for each run and contains:

- up to five prioritized search themes;
- controlled source archetypes;
- two or three explicit query variants per theme;
- semantic result bucket policy;
- URL reading priority.

The strategy is stored in the run search plan and execution log. It does not become a second editable user profile.

## Search Themes

Each theme contains `themeName`, `intentType`, `sourceArchetype`, `queryFamily`, `whyThisTheme`, and `priority`. Supported intents are:

- `direct_opportunity`
- `business_lead`
- `channel_partner_lead`
- `customer_lead`
- `association_directory`
- `watch_signal`
- `reference_case`

The existing hard caps remain: five themes, three queries per theme, five results per provider/query, and three content reads per run.

## Source Archetypes

Execution uses controlled source archetype ids rather than only free-form labels:

- `official_event_site`
- `exhibitor_sponsor_page`
- `business_matching_platform`
- `association_member_directory`
- `government_grant_page`
- `procurement_or_supplier_portal`
- `reseller_partner_page`
- `distributor_directory`
- `company_careers_or_contact`
- `marketplace_partner_page`
- `open_call_submission_page`
- `reference_case_source`

Unknown legacy labels are normalized to the closest generic id while retaining the original label for display and audit.

## Query Expansion

Each radar query family produces two or three query variants. The variants collectively cover broad discovery, official/source-focused discovery, action keywords, and region/language wording. One query can cover more than one dimension. Query family metadata is explicit and is never inferred from array position.

## Semantic Buckets

Results preserve these buckets end to end:

- direct opportunities enter the main opportunity area;
- business, channel partner, and customer leads enter the actionable lead area with `需联系确认` and `待复核`;
- association directories remain a lead resource unless the page contains a concrete application or contact route;
- watch signals and reference cases stay outside key opportunity cards and feed the report action layer;
- rejected results remain audit records only.

Search snippets never prove purchase intent, hiring intent, eligibility, fees, deadlines, contacts, or registration status.

## Report Action Layer

The existing action layer is enhanced rather than rebuilt. It creates subtype-specific recommended angles, material gaps, next actions, risks, and monitoring keywords. Every unsupported recommendation remains labelled as model judgment or pending review.

## Failure Handling

Search providers retry one retryable network failure. DeepSeek retries one network error, HTTP 429, or HTTP 5xx response. Other HTTP 4xx failures do not retry. Failure is recorded and never silently converted into mock success.

## Acceptance

The B2B SaaS to retail commodity SaaS V1.1 scenario must generate retail/FMCG/POS/ERP source strategies, preserve channel/customer/directory result semantics, obey search caps, and generate subtype-specific report actions. After all Q.2 tests pass, Golden 20 is rerun as a clean baseline without changing product logic during the run.
