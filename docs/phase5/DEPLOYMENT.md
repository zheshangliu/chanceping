# finance.chanceping.com Production Deployment Runbook

## Current audit

- Existing ChancePing deployment materials describe an Aliyun ECS/SWAS style host, systemd service, Nginx reverse proxy and release symlink layout under `/opt/chanceping/releases` and `/opt/chanceping/current`.
- The checked-in ECS and Workbench installers now include a dedicated `finance.chanceping.com` Nginx server block and the HTTPS helper includes the Finance hostname.
- Persistent application data is kept outside the release under `/opt/chanceping/shared/data` (with reports/exports alongside it). Do not create a second cloud architecture for Finance.
- The 2026-09-02 audit found `chanceping.com` at `8.218.11.71`, but `finance.chanceping.com` returns DNS `NXDOMAIN`. Forcing the Finance Host header to that IP returns the existing app/404 over HTTP, and TLS has no certificate SAN for `finance.chanceping.com`; DNS, certificate, and remote smoke therefore remain blocked.
- On 2026-09-03 an external TCP probe to `8.218.11.71:22` returned `Connection refused` while ports 80/443 were reachable. This is consistent with SSH not listening or an instance/security-group rule actively rejecting the connection; it must be repaired through ECS console/VNC before Workbench deployment.

## Required production path

```text
finance.chanceping.com DNS
  → TLS certificate
  → existing Nginx reverse proxy
  → ChancePing app /api/finance and finance host UI
  → Finance admin/session secrets
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
2. `/login` is reachable; unauthenticated `/` redirects to `/login`.
3. Authenticated `/weekly`, `/leads/a`, `/leads/b`, `/companies`, `/runs` are usable.
4. Manual B survives service restart and is then removed as test data.
5. Scheduler is registered for Monday 07:00 Asia/Shanghai; use a safe trigger, not a wait for Monday.
6. A safe FAILED run does not replace the current formal WeeklySnapshot.
7. `npm run verify:headhunter`, existing regressions, real E2E and production smoke all pass.

Until all gates have evidence, production status remains `LOCKED` and no `finance.chanceping.com` launch claim is allowed.
