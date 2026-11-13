# Changelog

All notable changes to UniFlow Core are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [0.1.1] — Code review remediation (unreleased)

### Fixed
- **P0-01 Multi-calendar state loss:** task categories/completion status are now scoped per calendar source (`sourceId:eventId`); importing or re-syncing one course can no longer erase another course's marks. `pruneMarks` now considers all imported sources and never removes user state without confirmation.
- **P0-02 Vanished events:** when an event disappears from its calendar feed on re-import, a full snapshot plus the user's category/status is kept and surfaced in Changes as "vanished — awaiting your confirmation" (source disappearance / official cancellation / user deletion are distinct actions). Items are only resolved by explicit user action (keep visible / mark cancelled / archive).
- **P0-03 Source-scoped IDs:** stable `sourceId:eventId` identifiers prevent same-UID collisions across different calendars; legacy `uid|time` marks are migrated automatically so existing user state survives the upgrade.
- **RECURRENCE-ID timezone matching:** overrides for recurring events now match the correct occurrence regardless of TZID/floating-time feed quirks (previously overrides could silently fail on feeds without VTIMEZONE).
- **Deployment:** Vite `base` set to `./` so all assets load correctly under the GitHub Pages `/uniflow-core/` subpath.
- Cancelled (STATUS:CANCELLED) events are shown with a visible "cancelled" style instead of being silently filtered.
- Dependency audit clean: vite/vitest/typescript upgraded; `npm audit` reports 0 vulnerabilities.
- Honest UX: the un-wired `digestHour` setting is hidden; Settings states plainly that this version has no automatic sync or phone notifications.

### Round-2 review fixes (same 0.1.1 release)
- BLOCKER 1: legacy v0.1.0 mark migration now actually matches (rest-id contract fixed); integration test + E2E prove old categories/status survive the upgrade.
- BLOCKER 2: "Keep visible" really keeps the task — new kept store; event stays in All/Overdue/digest with a "source unconfirmed" flag, disappears cleanly (no duplicate) if the source re-adds it.
- BLOCKER 3: imports are transaction-safe — unparseable files are refused outright (structured `unparseable` flag, distinct from valid-but-empty calendars, which now require explicit confirmation); failed imports never overwrite the last good snapshot.
- BLOCKER 4: recurring instances are matched by longest-common-subsequence on start times; ambiguous diffs refuse to guess and never migrate marks wrongly (EXDATE/insert/delete/move cases unit-tested).
- 17 new unit tests (71 total) + 16 new real-browser E2E checks (33 total), incl. real Export-JSON verification and Clear-all-data in the browser.

### Final release-gate fixes (same 0.1.1 release)
- **Keep visible can now be ended by the student:** kept cards expose "Mark cancelled" / "Archive" with an explicit confirm dialog; the snapshot (with the *current* category/status) moves to the archived store, the action is logged in Changes, and nothing is silently deleted.
- **STATUS:CANCELLED is visible again:** cancelled events render in All with a clear flag and de-emphasised style (no countdown, no priority pill), and are excluded from Overdue, Today/Upcoming planning views and the digest's deadline sections (digest Today lines are annotated `[CANCELLED]`).
- **Legacy UID migration hardened:** a key only counts as source-scoped when its prefix is a real source id, and legacy ids are never split at `:` or `/` — UIDs such as `team:x@u` or `cal/dept@u` now migrate to the correct scoped key instead of losing the student's category/status.
- **Test credibility:** the public E2E script takes its Chrome path / URL / output dir from environment variables (no personal absolute paths), derives all fixtures at runtime from the fictional demo calendar, asserts exact values, is repeatable (fresh profile per run) and **exits non-zero on failure**. Node `engines` set to `^22.12.0 || ^24.0.0 || >=26.0.0` (Vitest 5's supported range) with CI and Pages workflows on Node 22.
- 21 new unit tests (92 total) + 32 real-browser E2E checks, all passing; `npm audit` 0 vulnerabilities.

### Tests
- 11 new regression tests (54 total) in the first pass, 71 after round 2, **92 total** after the final gate (all passing): multi-calendar mark isolation, vanished-event retention and resolution, kept-event management, source-scoped IDs, legacy migration (incl. colon/slash UIDs), RECURRENCE-ID tz matching, cross-source duplicate UIDs, cancelled-event visibility rules.
- 17/17 real-browser E2E checks (Chrome for Testing, mobile + desktop viewports) covering demo import, persistence across reload, multi-calendar isolation, vanished detection/confirmation, digest, export/clear controls, zh-CN/en switching, subpath deployment, zero-network privacy, and a clean console. Round 2 added 16; the final-gate suite is **32/32**.

## [0.1.0] — UniFlow Core — First Public MVP

### Added
- ICS file import (drag & drop or file picker), parsed entirely in-browser with `ical.js` (RFC 5545: RRULE, EXDATE, RECURRENCE-ID, VTIMEZONE, all-day, floating times).
- Study dashboard: Today / Upcoming (7 days, configurable) / All Events / Overdue / Changes / Settings views.
- Deterministic No-AI rule engine with configurable priority thresholds (overdue / urgent / high / due soon / later), applied only to user-classified deadline events.
- Manual event categories (Assignment / Quiz / Exam / Class / Other) and task status (Not started / In progress / Completed), persisted locally.
- Change detection on re-import: new events, time changes, title changes; events that disappear from a feed are kept and flagged, never silently deleted.
- In-app daily digest (copyable), generated by rules in English and Simplified Chinese.
- Built-in fictional demo calendar ("Riverbend University") for users without an ICS file.
- Data ownership: full JSON export and one-click double-confirmed wipe.
- Bilingual UI (English / 简体中文), mobile-first responsive layout, light mode.
- 43 automated tests (Vitest) covering parsing, timezones (incl. Adelaide DST), rule engine, diffing, and storage; CI workflow running tests + build.

### Known limitations
- Browser CORS prevents direct ICS URL subscription (documented; planned as opt-in user-owned automation in v0.2).
- No push notifications in v0.1.0 — the notification channel interface exists, but only the in-app digest is implemented and tested.
