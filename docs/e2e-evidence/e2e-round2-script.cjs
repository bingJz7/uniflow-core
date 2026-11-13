/**
 * UniFlow Core v0.1.1 — final-gate real-browser E2E (Chrome for Testing).
 *
 * Repeatable & self-contained (final-gate fix 4):
 *  - NO personal absolute paths: Chrome path, app URL, output dir and profile
 *    dir are all configurable via environment variables (see below).
 *  - All ICS fixtures are derived at RUNTIME from examples/sample-calendar.ics
 *    (100% fictional data) — nothing is read from outside the repo.
 *  - STRICT assertions (exact counts/values, no `>=` soft passes).
 *  - Exit code 1 if ANY check fails; 0 only when all pass.
 *  - Fresh Chrome profile per run + in-page localStorage.clear() → safe to
 *    run repeatedly; consecutive runs produce identical results.
 *
 * Environment variables:
 *   UNIFLOW_CHROME      (required) path to a Chrome for Testing binary
 *   UNIFLOW_E2E_BASE    (default http://127.0.0.1:8765/)  app URL
 *   UNIFLOW_E2E_OUT     (default <os tmpdir>/uniflow-e2e-out-<ts>) output dir
 *   UNIFLOW_E2E_PROFILE (default fresh temp dir per run)  Chrome user-data dir
 *
 * Covers: legacy v0.1.0 migration, kept-visible lifecycle (keep → refresh →
 * archive via UI), STATUS:CANCELLED visibility, transaction-safe import,
 * re-add dedupe, export JSON, clear-all. Run steps: see CONTRIBUTING.md.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.UNIFLOW_CHROME;
const BASE = process.env.UNIFLOW_E2E_BASE || 'http://127.0.0.1:8765/';
const OUT = process.env.UNIFLOW_E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'uniflow-e2e-out-'));
const PROFILE = process.env.UNIFLOW_E2E_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'uniflow-e2e-profile-'));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SAMPLE_SRC = path.join(REPO_ROOT, 'examples', 'sample-calendar.ics');
const LEGACY_UID = 'demo-cs101-assignment1@riverbend.demo'; // single (non-recurring) event
const WORKSHOP = 'Library: Referencing Workshop (optional)';

if (!CHROME || !fs.existsSync(CHROME)) {
  console.error('ERROR: set UNIFLOW_CHROME to the path of a Chrome for Testing binary.');
  console.error('Install one with: npx @puppeteer/browsers install chrome@stable');
  process.exit(2);
}

// ---------- runtime ICS fixtures (all fictional, derived from the sample) ----------
const sampleText = fs.readFileSync(SAMPLE_SRC, 'utf8');
const icsDirs = {};
function fixtureIcs(dirName, text) {
  // Same basename `sample-calendar.ics` → re-import matches the same source name.
  const dir = path.join(OUT, dirName);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'sample-calendar.ics');
  fs.writeFileSync(file, text);
  icsDirs[dirName] = file;
  return file;
}
// v2: the sample minus the Referencing Workshop event (→ workshop vanishes).
// Line-based removal of exactly one VEVENT block — keeps END:VCALENDAR intact.
const lines = sampleText.split(/\r?\n/);
const uidLine = lines.findIndex((l) => l.trim() === 'UID:demo-library-workshop@riverbend.demo');
if (uidLine === -1) { console.error('ERROR: workshop UID not found in sample calendar'); process.exit(2); }
let blockStart = uidLine; while (blockStart > 0 && lines[blockStart].trim() !== 'BEGIN:VEVENT') blockStart--;
let blockEnd = uidLine; while (blockEnd < lines.length - 1 && lines[blockEnd].trim() !== 'END:VEVENT') blockEnd++;
const V2_TEXT = lines.filter((_, i) => i < blockStart || i > blockEnd).join('\n');
const V2 = fixtureIcs('ics-v2', V2_TEXT);
const INVALID = fixtureIcs('ics-invalid', 'this is definitely not an iCalendar file');
const EMPTY = fixtureIcs('ics-empty', 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR');
// cancelled: separate source name, past-dated deadline, STATUS:CANCELLED
const CANCELLED_DIR = path.join(OUT, 'ics-cancelled');
fs.mkdirSync(CANCELLED_DIR, { recursive: true });
const CANCELLED = path.join(CANCELLED_DIR, 'cancelled-demo.ics');
fs.writeFileSync(CANCELLED, `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//UniFlow Demo//Cancelled (fictional)//EN
BEGIN:VEVENT
UID:cancelled-office-hours@riverbend.demo
DTSTAMP:20261101T000000Z
SUMMARY:Cancelled Quiz — Office Hours (fictional)
DTSTART;TZID=Australia/Adelaide:20261110T140000
DTEND;TZID=Australia/Adelaide:20261110T150000
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`);
// v0.1.0 legacy source: ONE single event (keeps duplicate-counting unambiguous —
// the legacy calendar must not contain the workshop used by the kept-visible tests)
const LEGACY_TEXT = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//UniFlow Demo//Legacy v0.1.0 (fictional)//EN
BEGIN:VEVENT
UID:${LEGACY_UID}
DTSTAMP:20261001T000000Z
SUMMARY:CS101 Assignment 1 — Python Basics
DTSTART;TZID=Australia/Adelaide:20261112T170000
DTEND;TZID=Australia/Adelaide:20261112T170500
DESCRIPTION:Submit via the course portal. Worth 15%.
END:VEVENT
END:VCALENDAR`;

const log = [];
const step = (name, ok, detail = '') => {
  log.push({ name, ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME, headless: true,
    // direct:// avoids the macOS scproxy system-proxy resolver hang; the
    // explicit no-proxy flags keep localhost reachable on any setup.
    args: ['--no-first-run', '--proxy-server=direct://', '--proxy-bypass-list=*', '--no-proxy-server'],
  });
  const page = browser.pages()[0] ?? (await browser.newPage());
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // auto-dismiss native dialogs; tests that need control use a flag
  let dialogMode = 'accept'; // 'accept' | 'dismiss'
  page.on('dialog', async (d) => { if (dialogMode === 'accept') await d.accept(); else await d.dismiss(); });

  const closeModals = async () => {
    while (await page.locator('#modal:not(.hidden)').count()) {
      await page.click('#modalClose');
      await page.waitForTimeout(150);
    }
  };
  // macOS headless Chrome can intermittently stall its first navigation
  // (scproxy/system resolver) — retry instead of failing the run.
  const gotoWithRetry = async (url, tries = 3) => {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try { return await page.goto(url, { waitUntil: 'load', timeout: 20000 }); }
      catch (e) { lastErr = e; await page.waitForTimeout(500); }
    }
    throw lastErr;
  };
  const allCount = () => page.locator('#list-all .event-item').count();
  const unconfirmedCount = () => page.locator('#list-all .event-flag.unconfirmed').count();
  const getStore = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), key);

  // ============ FIX 3 setup / BLOCKER 1: v0.1.0 legacy migration ============
  await gotoWithRetry(BASE);
  await page.evaluate(() => localStorage.clear());
  const legacySources = JSON.stringify([{
    id: 'src-legacy1', name: 'Legacy Course Calendar', sourceType: 'file',
    icsText: LEGACY_TEXT, lastSyncedAt: '2026-11-01T00:00:00Z',
  }]);
  const legacyMarks = JSON.stringify({
    [`${LEGACY_UID}/single`]: { category: 'assignment', status: 'in_progress' },
  });
  await page.evaluate(([src, mk]) => {
    localStorage.clear();
    localStorage.setItem('uniflow.sources.v1', src);
    localStorage.setItem('uniflow.marks.v1', mk);
  }, [legacySources, legacyMarks]);
  await page.reload({ waitUntil: 'load' }); // "refresh" — boot runs the migration
  await page.waitForTimeout(400);
  await page.click('.tab[data-view="all"]');
  await page.waitForTimeout(300);
  const migratedMarks = await getStore('uniflow.marks.v1');
  const migratedEntry = migratedMarks[`src-legacy1:${LEGACY_UID}/single`];
  step('FIX 3/B1: legacy mark migrated to the EXACT source-scoped key', JSON.stringify(migratedEntry) === '{"category":"assignment","status":"in_progress"}', JSON.stringify(migratedEntry ?? null));
  // UI: exactly one "Assignment 1" row exists (only the legacy source is loaded)
  const cs101Rows = page.locator('#list-all .event-item', { hasText: 'Assignment 1' });
  step('FIX 3/B1: exactly one Assignment 1 row rendered', (await cs101Rows.count()) === 1, `${await cs101Rows.count()} rows`);
  const migratedCat = await cs101Rows.first().locator('select').inputValue();
  step('FIX 3/B1: migrated category is STRICTLY assignment in the UI', migratedCat === 'assignment', `cat=${migratedCat}`);
  const migratedStatus = await cs101Rows.first().locator('.status-btn.active').textContent();
  step('FIX 3/B1: migrated status is STRICTLY In progress in the UI', migratedStatus?.trim() === 'In progress', `status=${migratedStatus?.trim()}`);
  const legacyLeftover = Object.keys(migratedMarks).filter((k) => !k.includes(':'));
  step('FIX 3/B1: no legacy (unprefixed) keys remain in the marks store', legacyLeftover.length === 0, JSON.stringify(legacyLeftover));
  await page.screenshot({ path: path.join(OUT, 'f3-migration.png') });

  // ============ prepare: import the sample calendar as its own source ============
  await page.setInputFiles('#fileInput', SAMPLE_SRC);
  await page.waitForTimeout(500);
  await closeModals();
  const N_SAMPLE = await allCount();
  step('setup: sample calendar imported', N_SAMPLE > 0, `${N_SAMPLE} events (2 sources)`);

  // ============ BLOCKER 3a: invalid ICS refused, source untouched ============
  const beforeInvalid = await allCount();
  await page.setInputFiles('#fileInput', INVALID); // same basename → re-import path
  await page.waitForTimeout(500);
  const errModal = await page.locator('#modal').textContent().catch(() => '');
  step('B3a: invalid ICS refused with clear error', /Could not parse|not a valid/i.test(errModal ?? ''), (errModal ?? '').slice(0, 60));
  await closeModals();
  const afterInvalid = await allCount();
  step('B3a: event count STRICTLY unchanged after invalid import', afterInvalid === beforeInvalid, `${beforeInvalid} → ${afterInvalid}`);

  // ============ FIX 1 / BLOCKER 2: keep visible → refresh → ARCHIVE via UI ============
  await page.setInputFiles('#fileInput', V2); // workshop vanishes
  await page.waitForTimeout(500);
  await closeModals();
  await page.click('.tab[data-view="changes"]');
  await page.waitForTimeout(300);
  const pendingItems = page.locator('.vanished-heading ~ .event-item');
  step('B2: exactly 1 vanished event pending before keep-visible', (await pendingItems.count()) === 1, `${await pendingItems.count()} pending`);
  await page.locator('.vanished-heading ~ .event-item .status-btn').nth(2).click(); // Keep visible
  await page.waitForTimeout(300);
  step('B2: keep-visible clears pending list', (await page.locator('.vanished-heading').count()) === 0);
  await page.click('.tab[data-view="all"]');
  await page.waitForTimeout(300);
  step('B2: kept event visible in All with unconfirmed flag', (await unconfirmedCount()) === 1, `${await unconfirmedCount()} flagged`);
  const keptRow = page.locator('#list-all .event-item').filter({ has: page.locator('.event-flag.unconfirmed') }).first();
  await keptRow.locator('select').selectOption('assignment');
  await page.waitForTimeout(200);
  // ---- FIX 1 part A: refresh → kept event (and its management buttons) survive
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('.tab[data-view="all"]');
  await page.waitForTimeout(300);
  const keptRowAfter = page.locator('#list-all .event-item').filter({ has: page.locator('.event-flag.unconfirmed') }).first();
  const flagsAfterRefresh = await unconfirmedCount();
  const catAfterReload = await keptRowAfter.locator('select').inputValue().catch(() => 'n/a');
  step('FIX 1/B2: kept event survives refresh with category', flagsAfterRefresh === 1 && catAfterReload === 'assignment', `flags=${flagsAfterRefresh}, cat=${catAfterReload}`);
  const archiveBtnCount = await keptRowAfter.locator('.status-btn', { hasText: 'Archive' }).count();
  step('FIX 1: kept event exposes an Archive action after refresh', archiveBtnCount === 1, `${archiveBtnCount} archive button(s)`);
  await keptRowAfter.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'f1-kept-manageable.png') });
  await keptRowAfter.screenshot({ path: path.join(OUT, 'f1-kept-row.png') });
  // ---- FIX 1 part B: archive via UI → gone from views, data preserved in archived store
  await keptRowAfter.locator('.status-btn', { hasText: 'Archive' }).click(); // confirm auto-accepted
  await page.waitForTimeout(300);
  step('FIX 1: after Archive, no unconfirmed flags remain in All', (await unconfirmedCount()) === 0, `${await unconfirmedCount()} flagged`);
  const keptStore = await getStore('uniflow.kept.v1');
  step('FIX 1: kept store is empty after archiving', Object.keys(keptStore).length === 0, JSON.stringify(keptStore));
  const archivedStore = await getStore('uniflow.archived.v1');
  const archivedEntries = Object.values(archivedStore);
  step('FIX 1: archived store holds the snapshot with mark preserved (no data loss)',
    archivedEntries.length === 1 && archivedEntries[0].resolution === 'archived'
      && archivedEntries[0].mark.category === 'assignment' && archivedEntries[0].event.summary.includes('Referencing Workshop'),
    JSON.stringify(archivedEntries.map((e) => ({ r: e.resolution, m: e.mark }))));

  // ============ BLOCKER 2: source re-adds event → no duplicate ============
  // Re-establish a kept-visible record first: the source currently holds the
  // V2 text (workshop already removed), so re-import SAMPLE (event returns)
  // and then V2 (event vanishes again) to create a fresh pending snapshot.
  await page.setInputFiles('#fileInput', SAMPLE_SRC);
  await page.waitForTimeout(500);
  await closeModals();
  await page.setInputFiles('#fileInput', V2); // workshop vanishes again
  await page.waitForTimeout(500);
  await closeModals();
  await page.click('.tab[data-view="changes"]');
  await page.waitForTimeout(300);
  const pendingAgain = await page.locator('.vanished-heading ~ .event-item').count();
  step('B2: vanished snapshot re-created for the repeat disappearance', pendingAgain === 1, `${pendingAgain} pending`);
  await page.locator('.vanished-heading ~ .event-item .status-btn').nth(2).click(); // Keep visible
  await page.waitForTimeout(300);
  step('B2: kept record re-established', (await unconfirmedCount()) === 1, `${await unconfirmedCount()} flagged`);
  await page.setInputFiles('#fileInput', SAMPLE_SRC); // full calendar again (event back)
  await page.waitForTimeout(500);
  await closeModals();
  await page.click('.tab[data-view="all"]');
  await page.waitForTimeout(300);
  const workshopCount = await page.locator('#list-all .event-item', { hasText: WORKSHOP }).count();
  const flagsAfterReadd = await unconfirmedCount();
  step('B2: re-added event renders EXACTLY once (no duplicate)', workshopCount === 1 && flagsAfterReadd === 0, `${workshopCount} item(s), ${flagsAfterReadd} flagged`);

  // ============ FIX 2: STATUS:CANCELLED visibility ============
  const overdueBadgeBefore = await page.locator('.tab[data-view="overdue"] .badge').count();
  await page.setInputFiles('#fileInput', CANCELLED); // separate source, past-dated cancelled deadline
  await page.waitForTimeout(500);
  await closeModals();
  await page.click('.tab[data-view="all"]');
  await page.waitForTimeout(300);
  const cancelledRow = page.locator('#list-all .event-item', { hasText: 'Cancelled Quiz — Office Hours' });
  step('FIX 2: cancelled event IS visible in All', (await cancelledRow.count()) === 1, `${await cancelledRow.count()} row(s)`);
  step('FIX 2: cancelled event shows the CANCELLED flag', (await cancelledRow.locator('.event-flag.cancelled').count()) === 1);
  step('FIX 2: cancelled card is de-emphasised (.cancelled class)', (await cancelledRow.evaluate((el) => el.classList.contains('cancelled'))), 'class check');
  step('FIX 2: cancelled card shows NO overdue countdown', (await cancelledRow.locator('.countdown').count()) === 0, `${await cancelledRow.locator('.countdown').count()} countdown(s)`);
  await cancelledRow.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await cancelledRow.screenshot({ path: path.join(OUT, 'f2-cancelled-row.png') });
  // categorise it as a DEADLINE (assignment) — it must STILL not become overdue DDL
  await cancelledRow.first().locator('select').selectOption('assignment');
  await page.waitForTimeout(200);
  await page.click('.tab[data-view="overdue"]');
  await page.waitForTimeout(300);
  const overdueText = await page.locator('#list-overdue').textContent();
  step('FIX 2: cancelled deadline NOT listed as overdue despite being past-due', !overdueText.includes('Cancelled Quiz — Office Hours'), overdueText.slice(0, 50));
  const overdueBadgeAfter = await page.locator('.tab[data-view="overdue"] .badge').count();
  step('FIX 2: overdue badge not created by cancelled event', overdueBadgeAfter === overdueBadgeBefore, `${overdueBadgeBefore} → ${overdueBadgeAfter}`);
  // but the migrated legacy Assignment 1 (category=assignment, past-due) DOES appear (control)
  const overdueReal = await page.locator('#list-overdue .event-item', { hasText: 'Assignment 1' }).count();
  step('FIX 2: control — real past-due deadline still shows in Overdue (exactly the migrated one)', overdueReal === 1, `${overdueReal}`);
  await page.screenshot({ path: path.join(OUT, 'f2-cancelled-visible.png') });

  // ============ BLOCKER 3b: empty calendar re-import (strict dynamic counts) ============
  const beforeDecline = await allCount();
  dialogMode = 'dismiss'; // student DECLINES the empty-calendar confirmation
  await page.setInputFiles('#fileInput', EMPTY);
  await page.waitForTimeout(500);
  dialogMode = 'accept';
  const afterDecline = await allCount();
  step('B3b: declining empty re-import keeps event count EXACTLY unchanged', afterDecline === beforeDecline, `${beforeDecline} → ${afterDecline}`);
  dialogMode = 'dismiss';
  await page.setInputFiles('#fileInput', EMPTY);
  await page.waitForTimeout(500);
  dialogMode = 'accept';
  step('B3b: second decline still EXACTLY unchanged', (await allCount()) === beforeDecline, `${await allCount()}`);
  // now accept → the source's previous events become vanished snapshots (nothing deleted)
  await page.setInputFiles('#fileInput', EMPTY);
  await page.waitForTimeout(500);
  await closeModals();
  await page.click('.tab[data-view="all"]');
  await page.waitForTimeout(300);
  const afterEmpty = await allCount();
  await page.click('.tab[data-view="changes"]');
  await page.waitForTimeout(300);
  const vanishedSnapshots = await page.locator('.change-item.event-item').count();
  step('B3b: accepting empty re-import preserves EXACTLY the vanished events as snapshots', vanishedSnapshots === beforeDecline - afterEmpty && afterEmpty > 0, `before=${beforeDecline}, after=${afterEmpty}, snapshots=${vanishedSnapshots}`);
  await page.screenshot({ path: path.join(OUT, 'r2-04-empty-reimport.png') });

  // ============ Export JSON verification (strict) ============
  const downloadPromise = page.waitForEvent('download');
  await page.click('.tab[data-view="settings"]');
  await page.click('#exportBtn');
  const download = await downloadPromise;
  const dlPath = path.join(OUT, 'export-verify.json');
  await download.saveAs(dlPath);
  const exported = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
  const exportOk = exported.app === 'UniFlow Core'
    && exported.sources.length === 3 // legacy + sample (empty) + cancelled
    && Object.keys(exported.marks).length > 0
    && 'vanished' in exported && 'kept' in exported
    && Object.keys(exported.archived).length === 1
    && Object.values(exported.archived)[0].resolution === 'archived';
  step('Export JSON: sources+marks+vanished+kept+archived(all 1, resolution=archived)', exportOk, `sources=${exported.sources?.length}, archived=${Object.keys(exported.archived || {}).length}`);
  await page.screenshot({ path: path.join(OUT, 'r2-05-export.png') });

  // ============ Clear all data (double confirm), verify empty after refresh ============
  await page.click('#clearBtn'); // both confirms auto-accepted by dialog handler
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  const onboardingVisible = await page.locator('#onboarding').isVisible().catch(() => false);
  const storageEmpty = await page.evaluate(() => localStorage.getItem('uniflow.sources.v1') === null);
  step('Clear all data: double-confirm → onboarding shown after refresh', onboardingVisible && storageEmpty, `storage empty=${storageEmpty}`);
  await page.screenshot({ path: path.join(OUT, 'r2-06-cleared.png') });

  step('no console/page errors in whole session', errors.length === 0, errors.join('; ').slice(0, 300));

  fs.writeFileSync(path.join(OUT, 'e2e-round2-log.json'), JSON.stringify(log, null, 2));
  const failed = log.filter((l) => !l.ok);
  console.log(`\n=== FINAL-GATE E2E RESULT: ${log.length - failed.length}/${log.length} passed ===`);
  console.log(`output dir: ${OUT}`);
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((err) => {
  console.error('E2E crashed:', err);
  process.exit(1);
});
