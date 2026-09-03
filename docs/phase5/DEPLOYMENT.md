# finance.chanceping.com Production Deployment Runbook

## Current audit

- Existing ChancePing deployment materials describe an Aliyun ECS/SWAS style host, systemd service, Nginx reverse proxy and release symlink layout under `/opt/chanceping/releases` and `/opt/chanceping/current`.
- The checked-in ECS and Workbench installers now include a dedicated `finance.chanceping.com` Nginx server block and the HTTPS helper includes the Finance hostname.
- Persistent application data is kept outside the release under `/opt/chanceping/shared/data` (with reports/exports alongside it). Do not create a second cloud architecture for Finance.
- On 2026-09-03 DNS resolved `finance.chanceping.com` to `8.218.11.71`; the Finance branch was deployed through SWAS, a Let's Encrypt certificate including the Finance SAN was installed, and the read-only production smoke passed (`/login` 200, `/` 302). The Finance host is currently in explicit public read-only mode (`FINANCE_PUBLIC_MODE=true`); GET pages/data are public while POST/PATCH actions remain protected.

## Required production path

```text
finance.chanceping.com DNS
  → TLS certificate
  → existing Nginx reverse proxy
  → ChancePing app /api/finance and finance host UI
  → public read-only mode or Finance admin/session secrets
  → persistent /opt/chanceping/shared data
  → Monday 07:00 Asia/Shanghai scheduler
```

## Secrets (outside Git)

```text
FINANCE_ADMIN_USERNAME
FINANCE_ADMIN_PASSWORD_HASH
FINANCE_SESSION_SECRET
DOUBAO_SEARCH_API_KEY
SERPER_API_KEY
EXA_API_KEY (selective fallback)
TIKHUB_API_KEY (only if Company Profile enrichment is enabled)
```

Production must set `CHANCEPING_LOAD_API_ENV=false`; do not upload local `api.env` or print secrets in logs.

## Go-live gates

1. DNS resolves to the existing host and TLS is valid.
2. `/login` is reachable; public mode redirects `/` to `/weekly`.
3. Public GET `/weekly`, `/leads/a`, `/leads/b`, `/companies`, `/runs` are usable; write routes remain protected.
4. Manual B survives service restart and is then removed as test data.
5. Scheduler is registered for Monday 07:00 Asia/Shanghai; use a safe trigger, not a wait for Monday.
6. A safe FAILED run does not replace the current formal WeeklySnapshot.
7. `npm run verify:headhunter`, existing regressions, real E2E and production smoke all pass.

Production status: **DEPLOYED — PUBLIC READ-ONLY**. Full authenticated-admin mode remains available by setting `FINANCE_PUBLIC_MODE=false` and configuring the three Finance auth secrets.
