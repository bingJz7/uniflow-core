# UniFlow Core v0.1.1 — Code Review Remediation Report

Branch: `fix/v0.1.1-remediation` · Target: merge into `main` for **v0.1.1** · Status: **awaiting Product Owner review** (PR open, not merged)

---

## 0. Final release gate — 4 blocking issues (this round)

Scope discipline: only the four blocking issues were touched. No refactor, no dependency reinstall, no deletions, no release.

### Issue 1 — "Keep visible" had no management exit ✅ FIXED

**Root cause:** kept events rendered fine, but there was no way to end the kept state. The Changes list only lists *pending* vanished items, so a kept event could only be resolved by re-importing the source — i.e. the student was stuck with it forever.

**Fix:**
- Kept cards (All / Overdue / digest) now carry two explicit actions: **Mark cancelled** and **Archive**.
- Both show a confirm dialog that states exactly where the record goes ("stops appearing in your lists, stays saved on this device, included in your data export") — no silent disappearance.
- New `resolveKept()` moves the snapshot **with its mark** into the archived store (`uniflow.archived.v1`, `resolution` + `resolvedAt`); the kept store is emptied; the action is recorded in Changes.
- Mark accuracy: while kept-visible the live mark stays authoritative, so archiving captures the **current** category/status (not the stale vanish-time mark). The re-add path was fixed the same way: a live mark is never overwritten by an older snapshot mark.

**Evidence:**
- Unit: `tests/final.test.ts` — archive/cancel resolution, persisted stores, unknown-id no-op, current-mark-wins, "stops rendering" pipeline check.
- E2E (`e2e-final-log.json`, steps *FIX 1*): Keep visible → **refresh** (flag + both action buttons survive) → click **Archive** → 0 unconfirmed flags, kept store `{}`, archived store has exactly 1 entry with `resolution:"archived"` and `mark.category:"assignment"` (the category set while kept). Screenshot: `f1-kept-row.png`, `f1-kept-manageable.png`.

### Issue 2 — `STATUS:CANCELLED` was invisible ✅ FIXED

**Root cause:** `enrich()` ended with `.filter((e) => !e.cancelled)`, so cancelled events never reached the renderer — the existing ⚠️ CANCELLED flag was dead code.

**Fix — visible, but never actionable DDL:**
- `enrich()` keeps cancelled events; the card renders with a grey flag and a struck-through, de-emphasised title.
- `priorityFor()` returns `undefined` for cancelled events → no priority pill.
- `eventsOverdue()` and `pendingOnly()` exclude cancelled events → no overdue badge, no "Overdue" row.
- Today / Upcoming planning views exclude them (planning = live, actionable items); All is the place to inspect them.
- No countdown ("· overdue") is rendered for a cancelled card — a red overdue countdown would contradict the "not a task" rule.
- Digest: overdue/upcoming deadline sections exclude cancelled events; a cancelled item that falls on *today* is still listed but annotated `🚫 [CANCELLED]` / `🚫［已取消］`.

**Evidence:**
- Unit: `tests/final.test.ts` (8 tests) — visible in `enrich`, no priority when overdue *or* urgent, excluded from overdue/pendingOnly, digest annotation in en + zh-CN, planning-view exclusion, control case proving a non-cancelled past-due item still reports `overdue`.
- E2E (`FIX 2` steps): cancelled row visible in All, `.event-flag.cancelled` present, `.cancelled` class present, **0 countdowns**, not listed under Overdue after being categorised as a deadline, overdue badge unchanged, control row still overdue. Screenshot: `f2-cancelled-row.png`.

### Issue 3 — Unsafe UID assumptions in legacy migration ✅ FIXED

**Root cause:** two wrong assumptions, both legal to violate (RFC 5545 UIDs are free text):
1. `parseScopedEventId()` treated everything before the first `:` as a source id — so a legacy key for UID `team:x@u` was misread as source-scoped and never migrated.
2. `migrateLegacyMarks()` rebuilt the target key with `rest.split('/')` — a UID containing `/` produced a key that could never match a live event (`src-x:cal/dept@u` instead of `src-x:cal/dept@u/single`), so the student's category/status was silently lost on upgrade.

**Fix:**
- A key is only treated as source-scoped when its prefix is a **known source id** (`liveBySource` keys, i.e. sources actually loaded); otherwise the whole string is a legacy rest-id.
- Legacy matching is **full-string equality** on the rest-id, and the target key is rebuilt as `` `${srcId}:${rest}` `` **without ever decomposing** the uid/instance pair — so `:`, `/`, and any other legal character round-trip.
- Unresolvable legacy keys are still preserved, never deleted.

**Evidence:** `tests/final.test.ts` (`Fix 3` block, 8 tests): colon UID, slash UID, colon+slash recurring occurrence key, false-match guard (`a:b/single` never matches `a/single` or `b/single`), real-source passthrough, `parseScopedEventId` with/without the known-id set, a full v0.1.0→v0.1.1 end-to-end migration using UID `team:dept/spring-2026@university.example` (category **and** status verified in the enriched view), and multi-source mapping. E2E `FIX 3/B1` steps assert the migrated key exactly, the UI category **strictly** `assignment`, the UI status **strictly** `In progress`, and that no unprefixed legacy keys remain.

### Issue 4 — Test credibility & environment declarations ✅ FIXED

| Item | Before | Now |
|---|---|---|
| Personal absolute paths in the public E2E script | hard-coded `/Users/…` Chrome path, `/Users/…/examples/…`, `/tmp/…` fixtures | `UNIFLOW_CHROME` / `UNIFLOW_E2E_BASE` / `UNIFLOW_E2E_OUT` / `UNIFLOW_E2E_PROFILE` env vars; fixtures derived at runtime from `examples/sample-calendar.ics` via `__dirname`; failure to set Chrome exits **2** with install instructions |
| Exit code | `process.exit(0)` always ("CI gate is unit tests") | `process.exit(failed.length ? 1 : 0)`; crash handler exits 1 (verified: earlier failing runs returned 1) |
| Assertions | `>=1`, `['assignment','other'].includes(cat)` | exact equality: `=== 1` rows, strict `assignment` / `In progress`, unchanged 26 → 26 counts, `snapshots === before − after` |
| Node declaration | `engines: >=18` (Vite 7 needs ≥20.19/≥22.12), CI on Node 20 | `engines: ^20.19.0 \|\| >=22.12.0`; **CI + Pages workflows on Node 22**; README (en/zh) + CONTRIBUTING updated |
| Repeatability | ad-hoc `/tmp` state | fresh Chrome profile per run (temp dir) + in-page `localStorage.clear()` + runtime fixtures; two consecutive runs both **32/32**, exit 0 |
| Data used | fictional | still fictional only — demo calendar + generated fixtures; no real student data, URLs, or credentials |

Also fixed while making the suite honest: the script is now `e2e-round2-script.cjs` (the repo is `"type": "module"`), driven by `--proxy-server=direct://` (macOS scproxy hang) with a bounded `goto` retry, and documented step-by-step in `CONTRIBUTING.md` + `docs/e2e-evidence/README.md`.

### Verification (final gate)

| Check | Result |
|---|---|
| `npm test` (Vitest) | **92/92 pass**, 8 files (71 → 92: +21 final-gate tests) |
| `npm run build` (`tsc --noEmit` + `vite build`) | pass |
| `npm audit` | **0 vulnerabilities** |
| Real-browser E2E | **32/32 pass**, 0 console/page errors, exit 0 |
| Repeatability | second consecutive run: 32/32, exit 0 |
| Scope | no deletion, no merge, no release; `uniflow-core` / `uniflow-skills` separation and No-AI First unchanged |

---

## 0.1 Round-2 review fixes

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
| Unit (Vitest) | **92/92 pass** (71 after round 2, +21 final-gate tests in `tests/final.test.ts`) |
| Build (`tsc` + `vite build`) | pass |
| `npm audit` | 0 vulnerabilities |
| Real-browser E2E (final gate) | **32/32 pass**, 0 console errors, exit 0 |
| Real-browser E2E (earlier rounds) | round-1 17/17, round-2 16/16 (superseded by the final-gate suite) |

E2E commands (exact, repeatable — see `CONTRIBUTING.md`):

```bash
npm run build
npx http-server dist -p 8765 -a 127.0.0.1        # serve dist/ as web root
UNIFLOW_CHROME="/path/to/Chrome for Testing" \
NODE_PATH=/path/to/scratch/node_modules \
node docs/e2e-evidence/e2e-round2-script.cjs      # exit 0 = all passed
```

Mobile viewport 390×844 (desktop layout verified in round 1). Output dir holds
`e2e-round2-log.json` + screenshots; the committed copy is
`docs/e2e-evidence/e2e-final-log.json`.

## 6. Known issues / remaining risks

1. ICS subscription URLs still can't be fetched from the browser (CORS) — file import only. Planned v0.2 via user-owned automation.
2. Push notifications not implemented (interface ready). Not claimed as done.
3. GitHub Actions scheduled sync unimplemented (design documented).
4. **E2E is not part of CI** — it needs a real Chrome binary, so it stays a documented local/PR-review step (unit tests + build are the CI gate).
5. **Cancelled events are intentionally excluded from Today/Upcoming/Overdue/digest-deadline sections** — they are viewable in All (flagged) and annotated in the digest's Today section. If a student wants them in the planning views, that is a product decision, not a bug.
6. **Archived records have no UI list yet** — they are preserved in storage and included in the JSON export, and the Changes view reports the archived count. "View archived" would be a v0.2 feature.
7. **Theoretical prefix collision:** a legacy UID that literally begins with an existing source id (`src-xxxxxxxx:`) would be read as source-scoped. Source ids are app-generated random `src-<8 base36>`, so this is astronomically unlikely; the key is preserved (never deleted) either way.
8. Markdown/XSS surface re-audited for the new kept-event actions: all text goes through `textContent` / `escapeHtml`; no new `innerHTML` sink.

## 7. Files changed

Final gate:
- `src/storage.ts` — `resolveKept()` (archive/cancel kept events, current-mark capture), hardened `migrateLegacyMarks()` + `parseScopedEventId(…, knownSourceIds)`
- `src/rules.ts` — cancelled events visible, never prioritised; overdue/digest exclusions + `[CANCELLED]` annotations
- `src/main.ts` — kept-event Archive / Mark-cancelled actions, planning-view filters, `.cancelled` card, no countdown for cancelled, live-mark preservation on re-add
- `src/i18n.ts`, `src/style.css`, `src/types.ts` — new strings, cancelled styling, `resolvedAt`
- `tests/final.test.ts` (new, 21 tests)
- `docs/e2e-evidence/e2e-round2-script.cjs` (rewritten: env-configurable, strict, non-zero exit), `docs/e2e-evidence/README.md` (new), refreshed screenshots + `e2e-final-log.json`
- `package.json` (engines), `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml` (Node 22), `CONTRIBUTING.md`, `README.md`, `README.zh-CN.md`

Earlier rounds:
- `src/main.ts` — source-scoped IDs, import/sync rewrite, vanished UI, honest settings
- `src/storage.ts` — vanished store, archive, scoped marks, legacy migration, quota guard
- `src/sync.ts` — uid-first diff pairing
- `src/ics-parser.ts` — RECURRENCE-ID tz fix, cancelled parsing
- `src/types.ts`, `src/i18n.ts`, `src/style.css`, `index.html` — supporting changes
- `vite.config.ts` (new), `package.json` (0.1.1), `CHANGELOG.md`, `tests/p0-regression.test.ts`, `tests/round2.test.ts`, `docs/e2e-evidence/`
