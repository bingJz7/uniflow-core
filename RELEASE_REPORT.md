# UniFlow Core v0.1.1 — Release Report

**Status:** ✅ **Released** · **Date:** 2026-11-13 · **Released by:** Midas (agent) on behalf of Product Owner Jonathan Zhu
**Approval chain:** 4 issues raised in final review → fixed in `868f6f6` → ChatGPT final code review passed → Product Owner approved release.

---

## 1. Release artifacts

| Item | Value |
|---|---|
| Tag | [`v0.1.1`](https://github.com/bingJz7/uniflow-core/releases/tag/v0.1.1) (annotated, `--verify-tag`) |
| GitHub Release | https://github.com/bingJz7/uniflow-core/releases/tag/v0.1.1 |
| Tagged commit | `ed6274b` — *Release v0.1.1: mark changelog entry with release date* |
| `main` HEAD at release | `ed6274b` |
| PR | [#1](https://github.com/bingJz7/uniflow-core/pull/1) — merged (merge commit, full history preserved) |
| Merge commit | `d753ce2` — *Merge pull request #1 from bingJz7/fix/v0.1.1-remediation* |
| Reviewed commit | `868f6f654a9926a9c3116318f7ba937218d3eb01` (PR head at merge time) |
| Live site | https://bingjz7.github.io/uniflow-core/ |
| License | MIT |

**Git history preserved:** the merge used `--merge` (no squash, no rebase). All five remediation commits are reachable from `main`:
`811cf79` → `6e579a0` → `200c2c3` → `868f6f6` → `d753ce2` (merge) → `3d8d1b5` (E2E evidence) → `ed6274b` (release date).

## 2. Pre-merge gate

| Check | Result |
|---|---|
| PR head SHA matched approval | ✅ `868f6f654a9926a9c3116318f7ba937218d3eb01` |
| CI on PR head | ✅ success |
| Unit tests | ✅ 92/92 |
| Build (`tsc --noEmit` + `vite build`) | ✅ pass |
| `npm audit` | ✅ 0 vulnerabilities |

## 3. Post-merge workflows (`main`)

| Commit | CI | Deploy to GitHub Pages |
|---|---|---|
| `d753ce2` (merge) | ✅ success | ✅ success |
| `3d8d1b5` (E2E evidence) | ✅ success | ✅ success |
| `ed6274b` (release date) | ✅ success | ✅ success |

## 4. Live-site verification (real browser, GitHub Pages)

Run against the deployed site — not a local build — in Chrome for Testing (headless, fresh profile, `--proxy-server=direct://`), fictional data only.

**11/11 checks passed, exit 0, 0 console/page/network errors.**

| # | Check | Result |
|---|---|---|
| 1 | Site reachable, HTTP 200 | ✅ |
| 2 | Title `UniFlow — Study Deadlines Dashboard` | ✅ |
| 3 | Onboarding shown on fresh visit | ✅ |
| 4 | Demo import → "Imported 24 events" | ✅ 24 events |
| 5 | Demo events render in All view | ✅ 24 |
| 6 | Category + status edit writes to marks store | ✅ 1 mark |
| 7 | Events persist across refresh | ✅ 24 → 24 |
| 8 | Marks persist across refresh | ✅ 1 → 1 |
| 9 | Edited category survives refresh | ✅ `assignment` |
| 10 | Language toggle renders | ✅ |
| 11 | Zero console / page / network errors | ✅ 0 |

Evidence: [`docs/e2e-evidence/live-site-verified.png`](docs/e2e-evidence/live-site-verified.png), [`docs/e2e-evidence/live-verify-log.json`](docs/e2e-evidence/live-verify-log.json).

Verified UI on the live site: zh-CN copy, Today view with daily digest, overdue badge, per-event category select and tri-state status buttons, footer stating "data stays on your device".

## 5. What shipped

Same product, corrected state handling. No new features, no AI, no accounts, no network calls.

- **Multi-calendar mark isolation** — state scoped `sourceId:eventId`; one course can no longer erase another's marks.
- **Vanished-event retention** — snapshot + mark kept, surfaced in Changes for explicit resolution (keep visible / mark cancelled / archive); never silently deleted.
- **Kept-event lifecycle** — kept tasks can be ended by the student, with confirm dialogs and a Changes log entry; archived snapshots capture the current mark.
- **Legacy migration hardened** — v0.1.0 marks migrate; UIDs containing `:` or `/` no longer lose their category/status.
- **`STATUS:CANCELLED` visible** — shown in All with a flag, excluded from Overdue/Today/Upcoming/digest deadlines, annotated in the digest's Today section.
- **Transaction-safe imports** — unparseable files refused; valid-but-empty calendars require confirmation; failures never overwrite the last good snapshot.
- **Stable recurring-instance matching** — LCS on start times; ambiguous diffs refuse to guess.
- **Honest UX** — un-wired `digestHour` hidden; Settings states no sync and no phone notifications.
- **Environment declarations** — `engines: ^22.12.0 || ^24.0.0 || >=26.0.0`; CI/Pages on Node 22.

## 6. Known limitations

1. **ICS subscription URLs are not fetched** — browsers block cross-origin feeds (CORS); import is file-only. Planned for v0.2 via user-owned automation.
2. **No phone notifications, no scheduled sync** — not claimed anywhere in the UI.
3. **Archived records have no dedicated list view** — retained in storage, in the JSON export, and counted in Changes.
4. **E2E is not part of CI** — it needs a real Chrome binary; CI gates on unit tests + build.
5. **Cancelled events are intentionally absent** from Today/Upcoming/Overdue — visible in All. This is a product decision, reversible if desired.
6. **Theoretical prefix collision** in legacy keys — a v0.1.0 UID literally beginning with an existing `src-xxxxxxxx:` would be read as source-scoped. Source ids are app-generated (`src-` + 8 base36 chars); the key is preserved either way, so no data is lost.

## 7. Principles held

- **No-AI First** — every priority, digest line and change is produced by deterministic, readable rules.
- **Privacy First** — all data in browser localStorage; no backend, no telemetry, no third-party requests.
- **Branch separation** — `uniflow-skills` untouched; this release concerns `uniflow-core` only.
- **No destructive operations** — no file deletions, no forced resets, no dependency reinstall during the release.
- **No scope creep** — no v0.2 work started.

## 8. Next stage

Development stopped after release. Awaiting Product Owner direction for the next planning cycle (candidate themes, not started: subscription-URL automation, archived-records UI, notification interface).
