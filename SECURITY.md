# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for anything that could expose student data.

Use GitHub's "Report a vulnerability" (Security → Advisories), or contact the maintainers directly. You will get a response within 7 days. Once a fix is released, we will credit reporters (unless they prefer anonymity).

## Security model (what UniFlow promises)

1. **Local-only core.** The v0.1.0 app makes zero network requests for its core features. ICS files are parsed in the browser and stored in `localStorage` on the student's device.
2. **No secrets, ever.** The repository must never contain real ICS URLs, school credentials, tokens, or personal calendar data. CI logs and artifacts must not either.
3. **Least privilege.** The GitHub Actions workflow has `contents: read` only. It does not use secrets.
4. **No open proxies.** We will not host or ship an unauthenticated fetch proxy for arbitrary URLs. Future URL-sync designs must be user-owned (e.g. the user's own fork with their own secrets) and must redact URLs from all logs.
5. **Honest status claims.** Notification channels that have not been tested end-to-end are documented as such; UniFlow does not ship "automatic push" claims it cannot verify.

## Known limitations (v0.1.0)

- `localStorage` is not encrypted and is scoped to the browser profile. Someone with access to the unlocked device/browser can read it. Use the export + clear functions to move or remove data.
- ICS feeds exported without a `VTIMEZONE` block for a non-UTC `TZID` are interpreted as floating times in the user's selected timezone (documented in `docs/ARCHITECTURE_DECISIONS.md`).
- The app is a static site: there is no server-side rate limiting or abuse protection because there is no server.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ |
| < 0.1.0 | ❌ (pre-release) |
