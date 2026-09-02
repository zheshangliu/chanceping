# HeadHunter Finance API Contract

Base path: `/api/finance`. Authentication uses the `finance_session` Secure/HttpOnly cookie issued by `/auth/login`; all reads and mutations except auth require an active admin session.

| Route | Methods | Purpose |
|---|---|---|
| `/auth/login`, `/auth/logout` | POST | Single admin authentication |
| `/weekly/current`, `/weekly/:weekKey`, `/weekly/:weekKey/markdown` | GET | Current/history formal weekly snapshot and Markdown |
| `/weekly/:weekKey/publish-run/:runId` | POST | Publish an existing matching run |
| `/leads/a`, `/leads/b` | GET | A/B lead pools |
| `/leads/manual`, `/leads/:leadId`, `/leads/:leadId/promote-a`, `/leads/:leadId/archive` | POST/PATCH | Manual lead and controlled mutations |
| `/companies`, `/companies/:companyId` | GET/PATCH | Company list/detail |
| `/companies/evidence/:evidenceId/override` | PATCH | Human override only; raw Evidence is immutable |
| `/trends`, `/trends/:trendId` | GET/PATCH | Trend intelligence |
| `/runs`, `/runs/:runId` | GET/POST | Radar run records |

Production mounting is `/api/finance`; secrets are supplied through environment/secret storage and are never part of this contract or repository.
