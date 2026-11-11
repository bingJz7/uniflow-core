# UniFlow Core — Architecture Decisions

Status: Accepted (v0.1.0)
Date: 2026-11-11
Decision owner: UniFlow maintainers (initial decision by Lead Execution Agent, reviewed by Product Owner)

---

## 1. The problem

Universities use many different LMS platforms (Canvas, Moodle, Blackboard, custom portals).
Nearly all of them can export or expose the student's schedule as an **iCalendar (ICS) feed** —
a 20-year-old open standard (RFC 5545). ICS is the one format that is cross-university by construction.

But most students never use it: no one wants to parse calendars by hand, and third-party
"AI study assistants" require paid subscriptions, API keys, or permissions the university
has not granted.

**UniFlow's bet:** a student's school calendar already contains ~90% of what they need to know
about deadlines. Deterministic, transparent rules over that data — no AI — are enough for an MVP.

## 2. Options considered

Three architectures were evaluated before writing any code.

### Option A — Pure static web app / PWA, ICS parsed locally in the browser

| Dimension | Assessment |
|---|---|
| Ease of use for students | Excellent. Open a URL, drop in a file. No account, no install. |
| Development complexity | Low–medium. Standard web frontend + one parsing library. |
| Server needed | No (GitHub Pages / any static host). |
| Running cost | Zero. |
| iPhone / Android | Works in browser; can be added to home screen as a PWA. |
| Automatic updates | Partial — only when the user re-imports (or, later, when the app fetches a URL it is allowed to fetch). |
| Privacy | Excellent — file never leaves the device. |
| Cross-university compatibility | Excellent — ICS is ICS everywhere. |
| Community maintenance | Easy — small dependency surface, no ops. |
| Key limitation | Browser CORS: a web page cannot always fetch an arbitrary university ICS URL directly. |

### Option B — GitHub Actions + user-private config, scheduled ICS fetch + reminders

| Dimension | Assessment |
|---|---|
| Ease of use | Poor for the target user. Requires a GitHub account, fork, secrets, YAML. |
| Development complexity | Medium. |
| Server needed | No, but the user must operate their own repo as the "server". |
| Running cost | Zero (free tier), but runs are **delayed by up to tens of minutes** — GitHub Actions scheduling is best-effort, not exact. |
| iPhone / Android | Only via third-party push channels (email/Telegram), which need tokens. |
| Automatic updates | Yes, on a schedule. |
| Privacy | Risky by default — calendar data can leak into logs/artifacts unless carefully designed. Must be opt-in only. |
| Cross-university | Good — server-side fetch has no CORS problem. |
| Maintenance | Medium; Actions break occasionally, users can't debug. |

### Option C — Lightweight web app + small backend (subscription proxy, push service)

| Dimension | Assessment |
|---|---|
| Ease of use | Good for the user, but requires someone to **pay for and operate** a server forever. |
| Development complexity | High (auth, abuse protection, hosting, secrets). |
| Running cost | Non-zero; grows with users. |
| Privacy | Worst — calendar data leaves the student's device to a server we control. |
| Maintenance | Highest. An open-source project without dedicated operators will let the backend rot. |

### Decision

**Progressive architecture, starting with Option A.**

- **Stage 1 (this release, v0.1.0):** Static web app. Local ICS file import, parsed entirely in the
  browser. LocalStorage persistence. No account, no server, no network calls for core features.
- **Stage 2 (planned):** Optional automation — a user-owned GitHub Actions workflow (in the user's
  private fork) that fetches their ICS URL on a schedule and sends email/Telegram reminders.
  Strictly opt-in, documented as "requires setup", never bundled with private URLs in this repo.
- **Stage 3 (future):** Optional hosted sync backend, only if maintainers exist to operate it.
  Browser CORS prevents direct URL subscription in Stage 1; the sync engine already models
  connection state, staleness, and change detection so a Stage-2/3 fetcher can slot in behind
  the same interface.

Rationale: for students with zero coding/AI background, Option A is the only one with a
zero-cost, zero-risk first run. Option B is kept as the automation path because it is free and
user-owned (privacy stays with the user's own repo). Option C is deferred indefinitely — it
violates the "no server" cost constraint of an unpaid open-source project.

## 3. Key technical choices

| Choice | Decision | Why |
|---|---|---|
| Language | TypeScript | Type safety on date/recurrence logic is worth it; compiles to plain JS. |
| Build tool | Vite | Standard, fast, produces a static `dist/` deployable anywhere. |
| Framework | **None** (vanilla TS DOM) | The app is ~6 views and a handful of interactions. A framework adds install weight, upgrade churn, and learning barriers for first-time contributors. Revisit if the UI grows. |
| ICS parsing | [`ical.js`](https://github.com/mozilla-comm/ical.js) (Mozilla-maintained, MPL-2.0) | Battle-tested RFC 5545 parser: DTSTART/DTEND, RRULE, EXDATE, RECURRENCE-ID, VTIMEZONE, floating times. We deliberately did **not** write our own parser. |
| Storage | `localStorage` | Zero infra; user-owned data; easy export/clear. Limits (~5MB) are fine for calendars; documented. |
| i18n | Hand-rolled dictionary (en / zh-CN) | Two languages don't justify i18next. |
| Dates/timezones | Native `Intl` + ical.js `VTIMEZONE` registration | Handles Adelaide DST (`Australia/Adelaide`), UTC feeds, and floating times in the user-selected timezone. |
| Tests | Vitest (node env) for all logic; build check in CI | Logic (parsing, rules, diffing) is fully unit-testable without a browser. |
| Notifications | In-app daily digest (copyable) in v0.1.0; channel interface (`NotificationChannel`) for future email/Telegram | No un-tested push claims: anything not verified end-to-end is marked as such in the README. |

## 4. Rules, not AI

The rule engine is deterministic and configurable:

- `<24h` → **Urgent**; `<72h` → **High**; `<7d` → **Upcoming**; past → **Overdue**.
- These apply **only** to events the user has classified as deadline-bearing
  (Assignment / Quiz / Exam). Unclassified events are shown as `Other` and never guessed into
  a category. An event's start time is never silently reinterpreted as a deadline — deadlines
  are what the user marks them to be.

## 5. Privacy posture

- Core features make **zero network requests**. ICS text is parsed in-browser.
- No telemetry, no accounts, no third-party scripts.
- User data lives in `localStorage` on the device; Settings offers one-click export/clear.
- ICS URLs are never logged in full by the app; the future sync module must redact them.
- The GitHub Actions automation (Stage 2) runs in the user's own fork with secrets they own;
  this repository must never contain a real student's calendar data.
