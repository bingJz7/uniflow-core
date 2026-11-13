# UniFlow Core v0.1.1 — Code Review Remediation Report

Branch: `fix/v0.1.1-remediation` · Target: merge into `main` for **v0.1.1** · Status: **awaiting Product Owner review** (PR open, not merged)

---

## 0. Round-2 review fixes (this section)

### BLOCKER 1 — Legacy marks migration contract mismatch ✅ FIXED

**Root cause:** `migrateLegacyMarks()` was documented to match legacy keys against *unprefixed* rest-ids (`uid/instanceKey`), but `main.ts` fed it `liveScopedIdsBySource()` — *source-prefixed* ids. No legacy key could ever match, so v0.1.0 marks were silently left unmigrated.

**Fix:** `main.ts` now builds `liveRestIdsBySource()` returning the exact rest-id format the migration expects.

**Evidence:** new integration test seeds a REAL v0.1.0 localStorage shape (raw `icsText` sources + bare `uid/instanceKey` marks), simulates the boot migration, and asserts the category/status land under the scoped key — `tests/round2.test.ts` ("migrates a real v0.1.0 marks store…"). E2E `r2-01-migration.png`: v0.1.0-format data seeded via init script, page refreshed, mark present under `src-legacy1:…/single` with category + status intact.

### BLOCKER 2 — "Keep visible" didn't actually keep anything ✅ FIXED

**Root cause:** `resolveVanished(…, 'restored')` only deleted the vanished snapshot — the event disappeared everywhere.

**Fix:** a third store (`uniflow.kept.v1`). "Keep visible" moves the snapshot (with its mark) into the kept store; the event keeps rendering:
- **All / Overdue / daily digest** — yes, with an explicit "source unconfirmed" flag (orange banner; digest lines annotated `⚠ (source unconfirmed)`).
- **Today / Upcoming planning views** — no (they are for live feed data).
- **Re-appearance** — when the source re-adds the event, the kept record is cleared and the real feed event renders exactly once (no duplicate).
- The student can later archive/cancel it from the Changes list at any time.

**Evidence:** unit tests (kept-store round trip, All/Overdue/digest rendering, mark preservation, duplicate-free re-appearance); E2E steps in `e2e-round2-log.json` + screenshots `r2-02-kept-visible.png`, `r2-03-overdue-view.png`.

### BLOCKER 3 — Transaction-unsafe import of invalid/empty ICS ✅ FIXED

**Root cause:** a *valid but empty* calendar replaced the existing source's `icsText` before the zero-events check ran. Worse, `parseICS` never throws — an INVALID file also produced "zero events", so corrupt files hit the same destructive path.

**Fix — validate-then-commit, three distinct paths:**
1. **Unparseable file** (new structured `unparseable` flag on `ParsedCalendar`): refused outright with an error; the previous snapshot is never touched.
2. **Valid empty calendar on re-import:** explicit confirmation; if accepted, the previous events become vanished snapshots awaiting confirmation — nothing is deleted; if declined, nothing changes.
3. **Normal import:** unchanged.

**Evidence:** unit tests for both paths (invalid flagged, valid-empty not flagged); E2E `r2-04-empty-reimport.png` — decline keeps 48 events (twice), accept preserves all as vanished snapshots; invalid-import refusal in `e2e-round2-log.json`.

### BLOCKER 4 — Positional matching broke recurring-instance identity ✅ FIXED

**Root cause:** `diffSnapshots()` paired the i-th old occurrence with the i-th new one. Deleting the middle instance of a series made the 3rd occurrence "time-changed" into the 2nd's identity — migrating the wrong student marks.

**Fix — longest-common-subsequence pairing per UID over start times:**
- Exact-time matches are identity-preserving (no false moves).
- Equal-count leftovers pair chronologically (real moves).
- **Unequal-count leftovers refuse to guess**: surplus old → removed (kept & flagged), surplus new → added. Marks never migrate on ambiguous diffs.

**Evidence:** unit tests cover EXDATE-cancel of the 2nd of 4, feed deletion of the 2nd of 3, RECURRENCE-ID move of the 2nd, insertion of a middle instance, and the ambiguous delete+move case asserting zero fabricated time-moves.

### Extra acceptance (all executed for real)

1. **Export JSON clicked in a real browser**, download captured and parsed: contains `app`, `sources`, `marks`, `changes`, `vanished`, `kept` (log step 15).
2. **Clear all data executed** with both confirmations in the browser; refresh → onboarding visible, `uniflow.sources.v1` null (log step 16, `r2-06-cleared.png`).
3. Full re-run: unit 71/71, build green, `npm audit` 0 vulnerabilities, E2E round-1 17/17 + round-2 16/16, zero console errors.
4. New tests committed in `tests/round2.test.ts` (vitest, runs via `npm test` in CI); E2E script committed at `docs/e2e-evidence/e2e-round2-script.js`.
5. This report updated per-blocker with root cause + evidence.

No-AI First and the uniflow-core / uniflow-skills branch separation unchanged. No user data, source files, or Git history removed.

---

## 1. P0 fixes

### P0-01 — Multi-calendar task state loss ✅ FIXED

**Root cause:** `importIcsText()` pruned global marks using only the current import's event IDs, so importing course B wiped course A's categories/status.

**Fix:** marks are keyed by source-scoped IDs (`sourceId:eventId`). `pruneMarks` now only cleans marks belonging to a specific source when that source is removed, and never deletes user state because of an import. Regression tests: `tests/p0-regression.test.ts` ("importing course B preserves course A marks", "re-import does not clear other source's status", "removing one source keeps the other's marks").

### P0-02 — Vanished events kept, never silently dropped ✅ FIXED

**Fix:** on re-import, events missing from the newer feed are snapshotted (summary, time, category, status) into a `vanished` store and shown in **Changes** as "vanished from source — awaiting your confirmation". Three explicit user actions with distinct semantics:

- **Keep visible** — restore into the live list (user believes it's still real)
- **Mark cancelled** — archived with reason "officially cancelled"
- **Archive** — archived without asserting cancellation

Nothing is auto-deleted. The user's prior category and status are displayed alongside. Regression tests cover detection, mark preservation, and resolution.

### P0-03 — Cross-source ID collisions ✅ FIXED

**Fix:** stable source-level event IDs (`sourceId:eventId`). Same-UID events in different calendars no longer overwrite each other's state. Legacy `uid|startMs` marks are auto-migrated on load (`migrateLegacyMarks`), preserving v0.1.0 user data. Regression tests cover duplicate UIDs across sources, moved events, recurring instances, and migration.

## 2. Phase 1 — Deployment

- `vite.config.ts` sets `base: './'`; `dist/index.html` now references `./assets/…` (verified by grep) → correct under `/uniflow-core/` subpath.
- `npm ci`-equivalent fresh install + `npm test` + `npm run build` all pass; CI workflow unchanged (runs test + build).
- Local E2E served `dist/` under `/uniflow-core/` subpath; GitHub Pages production URL was verified 200 earlier in this session (deploy workflow will redeploy on merge).
- **Real-browser E2E (Chrome for Testing 157, via playwright-core): 17/17 passed.** Evidence in `docs/e2e-evidence/` (9 screenshots + `e2e-log.json`). Covered: demo import, category/status persistence across reload, multi-calendar isolation, vanished detection + user confirmation, digest generation, export/clear controls, zh-CN switch, desktop layout, zero network requests during navigation, clean console.

## 3. Phase 2 — Calendar & security hardening

- **RECURRENCE-ID tz fix:** overrides were matched against UTC-interpreted keys; feeds without VTIMEZONE (floating recurrence instances) could silently miss their override. Occurrence keys and RECURRENCE-ID now use the same conversion. Test: "RECURRENCE-ID override matches for floating-time feeds".
- **STATUS:CANCELLED** events render with a visible "cancelled" treatment instead of being filtered out.
- Storage-quota handling: `localStorage` writes are guarded; failures surface a non-destructive warning (data stays in memory for the session).
- XSS: all dynamic UI strings are inserted via `textContent` / `escapeHtml`; audit found no `innerHTML` sink receiving untrusted input.
- `npm audit`: **0 vulnerabilities** (vite ^7, vitest ^5.1.0, typescript ^5.5.4 upgraded).
- Privacy claims re-checked against implementation: parsing is 100% in-browser; E2E step confirms **zero network requests** during navigation; README/SECURITY wording matches behavior.

## 4. Phase 3 — UX

- `digestHour` setting hidden (no scheduler wired yet — honest UI).
- Settings note added: "This version has no automatic sync and cannot send phone notifications."
- Verified by E2E steps 11–12 (English + zh-CN).

## 5. Test summary

| Suite | Result |
|---|---|
| Unit (Vitest) | **54/54 pass** (11 new regression tests) |
| Build (`tsc` + `vite build`) | pass |
| `npm audit` | 0 vulnerabilities |
| Real-browser E2E | **17/17 pass**, 0 console errors |

E2E commands: `python3 -m http.server 8765` on `dist/` copy; `node run.js` (playwright-core + Chrome for Testing, mobile 390×844 and desktop 1280×800 viewports).

## 6. Known issues / remaining risks

1. ICS subscription URLs still can't be fetched from the browser (CORS) — file import only. Planned v0.2 via user-owned automation.
2. Push notifications not implemented (interface ready). Not claimed as done.
3. GitHub Actions scheduled sync unimplemented (design documented).
4. E2E ran against a local build served at the same subpath structure as Pages; the Pages deploy itself re-runs on merge and was verified separately earlier today.

## 7. Files changed

- `src/main.ts` — source-scoped IDs, import/sync rewrite, vanished UI, honest settings
- `src/storage.ts` — vanished store, archive, scoped marks, legacy migration, quota guard
- `src/sync.ts` — uid-first diff pairing
- `src/ics-parser.ts` — RECURRENCE-ID tz fix, cancelled visibility
- `src/types.ts`, `src/i18n.ts`, `src/style.css`, `index.html` — supporting changes
- `vite.config.ts` (new), `package.json` (0.1.1), `CHANGELOG.md`, `tests/p0-regression.test.ts` (new), `docs/e2e-evidence/` (new)
