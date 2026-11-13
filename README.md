# 🪙 UniFlow Core

**Free, cross-university, no-AI study task & deadline dashboard for university students.**

**Technology Should Adapt to Students, Not the Other Way Around.**

Import your school's ICS calendar file and instantly see what's due — today, this week, and what's overdue. No account. No AI. No server. Your calendar never leaves your device.

> 🌏 [简体中文说明](README.zh-CN.md)

---

## What UniFlow is

Universities use many different LMS platforms (Canvas, Moodle, Blackboard, custom portals), and deadlines are scattered everywhere. But nearly all of them can export your schedule as an **ICS (iCalendar) file** — an open standard (RFC 5545). UniFlow turns that file into a clear, prioritized dashboard using **deterministic rules, not AI**.

## What it solves

- You don't know which assignments are due soon
- Deadlines live in different systems with different UIs
- You can't (or don't want to) grant an AI assistant access to your school account
- You don't code, don't have API keys, and shouldn't need them

## Supported / not supported (v0.1.0)

| ✅ Supported | ❌ Not supported (yet / by design) |
|---|---|
| Import local `.ics` files (parsed 100% in your browser) | Fetching ICS URLs directly from the browser (CORS) — see [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md) |
| Multiple calendars, recurring events, all-day events, timezones (incl. Adelaide DST) | Verifying submission status in your LMS — UniFlow never claims it knows what you submitted |
| Today / Upcoming / Overdue / All / Changes views | Automatic push notifications to your phone |
| Manual categories (Assignment / Quiz / Exam / Class / Other) and status (Not started / In progress / Completed) | AI features — by design. No-AI mode is the default, forever, for core features |
| In-app daily digest (copyable) | Hosted sync server |
| Data export (JSON) & one-click wipe | |

## No-AI mode

UniFlow's core is a **deterministic rule engine**. Same input + same settings → same output, every time. Priority rules (configurable in Settings):

- Overdue: past the deadline
- 🔴 Urgent: within 24 hours
- 🟠 High: within 72 hours
- 🔵 Due soon: within 7 days

These apply **only** to events you mark as Assignment / Quiz / Exam. Events you haven't classified show as "Other" — UniFlow never guesses what your calendar events mean, and never treats an event's start time as a deadline unless you classify it.

## How to use (3 steps, no coding)

1. **Get your ICS file.** In your LMS (Canvas/Moodle/Blackboard → Calendar), look for "Export calendar / Download iCal / Subscribe". Download the `.ics` file. (Your school's IT help pages usually show where.)
2. **Open UniFlow and drop the file in.** It is parsed on your device — nothing is uploaded.
3. **Pick your timezone.** Done — see your deadlines immediately.

No ICS file handy? Click **"Try the demo calendar"** — a fictional "Riverbend University" timetable so you can explore everything.

### Deploying it yourself

UniFlow is a static web app. Any static host works:

```bash
npm install
npm run dev      # local dev server
npm run build    # outputs dist/
npm test         # unit test suite (91 tests)
```

Requires Node.js `^22.12.0 || ^24.0.0 || >=26.0.0` (see `package.json`). An optional repeatable real-browser E2E suite is documented in [CONTRIBUTING.md](CONTRIBUTING.md).

Deploy `dist/` to GitHub Pages, Netlify, Cloudflare Pages, or any web server. (CI in `.github/workflows/` runs build + tests on every push.)

## Screenshots / demo

Run `npm run dev` and open the printed URL, then click **"Try the demo calendar"**. (Screenshots will be added to the repo after first public release.)

## Privacy

- **Zero network requests for core features.** Your ICS file is parsed in your browser and stored in your browser's `localStorage`.
- No accounts, no telemetry, no third-party scripts.
- **Export:** Settings → "Export my data (JSON)" gives you a full copy of everything UniFlow stores.
- **Delete:** Settings → "Clear all my data" wipes everything, immediately.
- This repository must never contain a real student's calendar. All demo data is fictional.
- Deadlines shown are from your calendar file — they are **not verified against your LMS**.

Full details: [SECURITY.md](SECURITY.md), [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md).

## Roadmap

- **v0.1.0 (this release)** — file import, dashboard, rule engine, digest, export/wipe. ✅
- **v0.2** — optional user-owned automation: a GitHub Actions workflow in *your own fork* that fetches your ICS URL on a schedule and emails/Telegram-messages your daily digest (opt-in, documented, tokens stay in your own repo's secrets).
- **v0.3** — PWA install, dark mode, more locales.
- **Later** — optional hosted sync backend, only if maintainers exist to run it.

## Contributing & Community

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to set up, code style, PR process
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards
- [SECURITY.md](SECURITY.md) — how to report vulnerabilities privately
- Found a bug or want a feature? [Open an Issue](../../issues) — no contribution is too small.

## Branches of the UniFlow project

- **`uniflow-core`** (this repo) — the runnable open-source app. No-AI by default.
- **`uniflow-skills`** (future, separate repo) — prompt/skill research across AI platforms. Kept separate on purpose: core UniFlow must never require an AI subscription.

## License

[MIT](LICENSE). Third-party dependency licenses are listed in `docs/THIRD_PARTY_NOTICES.md`.
