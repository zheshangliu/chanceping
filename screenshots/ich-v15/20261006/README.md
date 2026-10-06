# V1.5 candidate preview

These are local candidate previews, not production screenshots. The preview used an isolated runtime copy on `http://127.0.0.1:3307/ich/weekly`.

- Desktop: [`weekly-desktop-1280x720.jpg`](weekly-desktop-1280x720.jpg), 1280×720.
- Mobile: [`weekly-mobile-390x844.png`](weekly-mobile-390x844.png), Chrome DevTools mobile emulation at 390×844, device scale factor 1.

The mobile DOM check recorded `innerWidth=390`, `documentElement.scrollWidth=390`, one shared header, and 10 weekly cards. The first card link opened its detail route successfully. Anonymous private-follow-up read returned HTTP 401; the public weekly API returned HTTP 200.

The isolated fixture/runtime copy is based on the repository's pre-refresh data. It is intentionally stale and must not be interpreted as production freshness or post-cycle Chinese coverage.
