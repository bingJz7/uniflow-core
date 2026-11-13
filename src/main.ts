/**
 * UniFlow Core — app controller (vanilla TS, no framework).
 * Wires storage + parser + rule engine + sync diff into the UI.
 * Core features perform ZERO network requests.
 */

import { parseICS } from './ics-parser.js';
import { DEMO_ICS } from './demo.js';
import { t, type Lang } from './i18n.js';
import { buildDigest, enrich, eventsOverdue, eventsToday, eventsUpcoming, type EnrichedEvent } from './rules.js';
import {
  addVanished, clearAllData, downloadFile, exportAllData, loadArchived, loadChanges, loadKept, loadMarks,
  loadSettings, loadSources, loadVanished, migrateLegacyMarks, removeKept, resolveVanished,
  saveArchived, saveChanges, saveKept, saveMarks, saveSettings, saveSources, saveVanished, updateMark,
} from './storage.js';
import { diffSnapshots } from './sync.js';
import { countdown, isValidTimeZone } from './timezone.js';
import type { CalendarSource, EventCategory, EventMark, Settings, SourceChange, TaskStatus, VanishedEvent } from './types.js';

// ---------- state ----------

let settings: Settings = loadSettings();
let sources: CalendarSource[] = loadSources();
let marks: Record<string, EventMark> = loadMarks();
let changes: SourceChange[] = loadChanges();
let vanished: Record<string, VanishedEvent> = loadVanished();
let archived: Record<string, VanishedEvent> = loadArchived();
let kept: Record<string, VanishedEvent> = loadKept();

let activeView = 'today';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

/**
 * All parsed events across sources (demo/file/url), plus the student's
 * "kept visible" events (BLOCKER 2): events they explicitly chose to keep
 * after the source stopped listing them. Kept entries whose id is live again
 * are skipped — a re-added event renders once, from its real feed data.
 * P0-03: ids are SOURCE-SCOPED (`sourceId:uid/instance`) so two calendars
 * containing the same UID never overwrite each other's category/status.
 */
function allEvents() {
  const out = [];
  for (const src of sources) {
    try {
      const parsed = parseICS(src.icsText, settings.timezone);
      out.push(...parsed.events.map((e) => ({ ...e, id: `${src.id}:${e.id}` })));
    } catch {
      // a broken source must not break the whole app; sync UI shows its state
    }
  }
  const liveIds = new Set(out.map((e) => e.id));
  for (const item of Object.values(kept)) {
    if (!liveIds.has(item.id)) {
      out.push({ ...item.event, id: item.id, unconfirmed: true });
    }
  }
  return out;
}

/**
 * Per-source live rest-ids (`uid/instanceKey`, NO source prefix) — the exact
 * key format `migrateLegacyMarks()` matches legacy v0.1.0 ids against.
 * BLOCKER 1 fix: the previous version handed migration source-prefixed ids,
 * which no legacy key could ever match, so v0.1.0 marks were silently not
 * migrated.
 */
function liveRestIdsBySource(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const src of sources) {
    const set = new Set<string>();
    try {
      const parsed = parseICS(src.icsText, settings.timezone);
      for (const e of parsed.events) set.add(e.id);
    } catch {
      // broken source contributes nothing
    }
    map.set(src.id, set);
  }
  return map;
}

// ---------- boot ----------

function init(): void {
  // P0-03 migration: carry v0.1.0 mark keys into the source-scoped scheme.
  marks = migrateLegacyMarks(marks, liveRestIdsBySource());
  saveMarks(marks);
  bindStaticUI();
  bindImport();
  bindSettings();
  bindDigest();
  renderAll();
  setInterval(() => { if (activeView === 'today' || activeView === 'upcoming' || activeView === 'overdue') renderEventLists(); }, 60000);
}

function bindStaticUI(): void {
  $('#langToggle').addEventListener('click', () => {
    settings.language = settings.language === 'en' ? 'zh-CN' : 'en';
    saveSettings(settings);
    renderAll();
  });

  for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
    tab.addEventListener('click', () => {
      activeView = tab.dataset.view!;
      renderTabs();
      renderViews();
    });
  }

  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) closeModal(); });
}

// ---------- i18n / render all ----------

function applyStaticTexts(): void {
  const lang = settings.language;
  document.documentElement.lang = lang;
  $('#tagline').textContent = t(lang, 'tagline');
  $('#onbTitle').textContent = t(lang, 'onboardingTitle');
  $('#onbStep1').textContent = t(lang, 'onboardingStep1');
  $('#onbStep2').textContent = t(lang, 'onboardingStep2');
  $('#onbStep3').textContent = t(lang, 'onboardingStep3');
  $('#dropLabel').textContent = t(lang, 'dropHere');
  $('#demoBtn').textContent = t(lang, 'tryDemo');
  $('#importMoreBtn').textContent = t(lang, 'importMore');
  $('#digestTitle').textContent = t(lang, 'digestTitle');
  $('#digestBtn').textContent = t(lang, 'generateDigest');
  $('#digestNote').textContent = t(lang, 'digestNote');
  $('#modalClose').textContent = t(lang, 'close');
  $('#settingsHeading').textContent = t(lang, 'settings');
  $('#lblTimezone').textContent = t(lang, 'timezoneLabel');
  $('#lblLanguage').textContent = t(lang, 'languageLabel');
  $('#lblUrgentHours').textContent = t(lang, 'urgentHoursLabel');
  $('#lblHighHours').textContent = t(lang, 'highHoursLabel');
  $('#lblSoonDays').textContent = t(lang, 'soonDaysLabel');
  $('#exportBtn').textContent = t(lang, 'exportData');
  $('#clearBtn').textContent = t(lang, 'clearData');
  $('#privacyNote').textContent = t(lang, 'confirmedDeadlinesNote');
  $('#noAutoSyncNote').textContent = t(lang, 'noAutoSyncNote');
  $('#footerNote').textContent =
    lang === 'zh-CN'
      ? 'UniFlow Core — 开源 (MIT) · 无 AI · 数据只保存在你的设备上'
      : 'UniFlow Core — open source (MIT) · no AI · your data never leaves this device';

  const tabKeys = ['today', 'upcoming', 'all', 'overdue', 'changes', 'settings'];
  document.querySelectorAll('.tab').forEach((tab, i) => {
    const count = i === 3 ? eventsOverdue(enrich(allEvents(), marks, settings, Date.now()), Date.now()).length : 0;
    tab.textContent = t(lang, tabKeys[i]) + (count ? '' : '');
    if (i === 3 && count) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(count);
      tab.appendChild(badge);
    }
  });

  // timezone datalist
  $('#tzList').innerHTML = [
    'Australia/Adelaide', 'Australia/Sydney', 'Australia/Perth', 'Australia/Brisbane',
    'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Kolkata',
    'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'UTC',
    'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Pacific/Auckland',
  ].map((z) => `<option value="${z}"></option>`).join('');
}

function renderTabs(): void {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', (tab as HTMLElement).dataset.view === activeView);
  });
}

function renderViews(): void {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${activeView}`).classList.remove('hidden');
  renderEventLists();
  if (activeView === 'settings') fillSettingsForm();
}

function renderEventLists(): void {
  const nowMs = Date.now();
  const enriched = enrich(allEvents(), marks, settings, nowMs);
  // Kept-visible ("source unconfirmed") events belong in All / Overdue / the
  // digest — where the student explicitly manages them — but not in the
  // regular Today / Upcoming planning views.
  const confirmed = enriched.filter((e) => !e.event.unconfirmed);
  renderList('#list-today', eventsToday(confirmed, settings.timezone, nowMs), nowMs);
  renderList('#list-upcoming', eventsUpcoming(confirmed, settings.timezone, nowMs, settings.soonDays), nowMs);
  renderList('#list-all', enriched, nowMs);
  renderList('#list-overdue', eventsOverdue(enriched, nowMs), nowMs);
  renderChanges();
  renderSources();
}

function renderAll(): void {
  applyStaticTexts();
  $('#onboarding').classList.toggle('hidden', sources.length > 0);
  $('#app').classList.toggle('hidden', sources.length === 0);
  renderTabs();
  renderViews();
}

// ---------- event list rendering ----------

function renderList(sel: string, items: EnrichedEvent[], nowMs: number): void {
  const container = $(sel);
  container.innerHTML = '';
  if (items.length === 0) {
    const emptyKeys: Record<string, string> = {
      '#list-today': 'emptyToday', '#list-upcoming': 'emptyUpcoming',
      '#list-all': 'emptyAll', '#list-overdue': 'emptyOverdue',
    };
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = t(settings.language, emptyKeys[sel] ?? 'emptyAll');
    container.appendChild(p);
    return;
  }
  for (const item of items) container.appendChild(renderEventItem(item, nowMs));
}

function renderEventItem(item: EnrichedEvent, nowMs: number): HTMLElement {
  const lang = settings.language;
  const div = document.createElement('div');
  div.className = `card event-item priority-${item.priority ?? 'later'}` + (item.status === 'completed' ? ' completed' : '');

  const head = document.createElement('div');
  head.className = 'head';
  const h4 = document.createElement('h4');
  h4.textContent = item.event.summary;
  head.appendChild(h4);
  if (item.priority) {
    const pill = document.createElement('span');
    pill.className = `pill ${item.priority}`;
    pill.textContent = t(lang, `pr_${item.priority}`);
    head.appendChild(pill);
  }
  div.appendChild(head);

  const meta = document.createElement('div');
  meta.className = 'event-meta';
  const when = new Intl.DateTimeFormat(lang === 'zh-CN' ? 'zh-CN' : 'en-AU', {
    timeZone: settings.timezone,
    weekday: 'short', month: 'short', day: 'numeric',
    hour: item.event.allDay ? undefined : '2-digit', minute: item.event.allDay ? undefined : '2-digit', hour12: false,
  }).format(new Date(item.event.startMs));
  meta.textContent = `${item.event.allDay ? t(lang, 'allDay') : t(lang, 'starts')} · ${when}`;
  if (!item.event.allDay) {
    const cd = document.createElement('span');
    cd.className = 'countdown ' + (item.event.startMs < nowMs ? 'danger' : item.event.startMs - nowMs < 86400000 ? 'warn' : 'ok');
    cd.textContent = ` · ${countdown(item.event.startMs - nowMs, lang)}`;
    meta.appendChild(cd);
  }
  div.appendChild(meta);

  if (item.event.description) {
    const desc = document.createElement('div');
    desc.className = 'event-desc';
    desc.textContent = item.event.description.length > 220 ? item.event.description.slice(0, 220) + '…' : item.event.description;
    div.appendChild(desc);
  }
  if (item.event.location) {
    const loc = document.createElement('div');
    loc.className = 'event-desc';
    loc.textContent = '📍 ' + item.event.location;
    div.appendChild(loc);
  }

  // controls: category + status
  const controls = document.createElement('div');
  controls.className = 'event-controls';

  const catSel = document.createElement('select');
  catSel.setAttribute('aria-label', t(lang, 'category'));
  for (const c of ['other', 'assignment', 'quiz', 'exam', 'class'] as EventCategory[]) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = t(lang, `cat_${c}`);
    if (item.category === c) opt.selected = true;
    catSel.appendChild(opt);
  }
  catSel.addEventListener('change', () => {
    marks = updateMark(marks, item.event.id, { category: catSel.value as EventCategory });
    renderEventLists();
  });
  controls.appendChild(catSel);

  const btns = document.createElement('div');
  btns.className = 'status-btns';
  for (const s of ['not_started', 'in_progress', 'completed'] as TaskStatus[]) {
    const b = document.createElement('button');
    b.className = 'status-btn' + (item.status === s ? ' active' : '');
    b.textContent = t(lang, `st_${s}`);
    b.addEventListener('click', () => {
      marks = updateMark(marks, item.event.id, { status: s });
      renderEventLists();
    });
    btns.appendChild(b);
  }
  controls.appendChild(btns);
  div.appendChild(controls);

  // flagged: event vanished from its feed (kept, not deleted)
  if (item.event.cancelled) {
    const flag = document.createElement('div');
    flag.className = 'event-flag';
    flag.textContent = lang === 'zh-CN' ? '⚠️ 日历源将其标记为已取消（STATUS:CANCELLED）' : '⚠️ The source calendar marked this CANCELLED';
    div.appendChild(flag);
  }
  if (item.event.unconfirmed) {
    const flag = document.createElement('div');
    flag.className = 'event-flag unconfirmed';
    flag.textContent = t(lang, 'unconfirmedFlag');
    div.appendChild(flag);
  }
  return div;
}

// ---------- changes view ----------

function renderChanges(): void {
  const container = $('#list-changes');
  container.innerHTML = '';

  // P0-02: events vanished from their feed, awaiting the student's confirmation.
  const pending = Object.values(vanished);
  const archivedCount = Object.keys(archived).length;
  if (pending.length > 0) {
    const heading = document.createElement('div');
    heading.className = 'card change-item vanished-heading';
    heading.innerHTML = `<strong>⚠️ ${escapeHtml(t(settings.language, 'vanishedHeading'))} (${pending.length})</strong>
      <div class="muted small">${escapeHtml(t(settings.language, 'vanishedNote'))}</div>`;
    container.appendChild(heading);
    for (const item of pending) {
      const div = document.createElement('div');
      div.className = 'card change-item event-item priority-overdue';
      const title = document.createElement('div');
      const kind = document.createElement('span');
      kind.className = 'change-kind removed';
      kind.textContent = t(settings.language, 'ch_removed');
      title.appendChild(kind);
      title.appendChild(document.createTextNode(item.event.summary));
      div.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'muted small';
      meta.textContent = `${item.sourceName} · ${t(settings.language, 'category')}: ${t(settings.language, `cat_${item.mark.category}`)} · ${t(settings.language, 'status')}: ${t(settings.language, `st_${item.mark.status}`)} · ${t(settings.language, 'vanishedWhen')} ${new Intl.DateTimeFormat(settings.language === 'zh-CN' ? 'zh-CN' : 'en-AU', {
        timeZone: settings.timezone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(item.detectedAt))}`;
      div.appendChild(meta);
      const actions = document.createElement('div');
      actions.className = 'event-controls';
      const mkBtn = (label: string, primary: boolean, fn: () => void) => {
        const b = document.createElement('button');
        b.className = 'status-btn' + (primary ? ' active' : '');
        b.textContent = label;
        b.addEventListener('click', fn);
        return b;
      };
      // Distinguish: source disappearance vs official cancellation vs user deletion.
      actions.appendChild(mkBtn(t(settings.language, 'actMarkCancelled'), true, () => {
        const res = resolveVanished(vanished, item.id, 'cancelled');
        vanished = res.vanished; archived = res.archived;
        saveVanished(vanished); saveArchived(archived);
        renderEventLists();
      }));
      actions.appendChild(mkBtn(t(settings.language, 'actArchive'), false, () => {
        const res = resolveVanished(vanished, item.id, 'archived');
        vanished = res.vanished; archived = res.archived;
        saveVanished(vanished); saveArchived(archived);
        renderEventLists();
      }));
      actions.appendChild(mkBtn(t(settings.language, 'actKeepVisible'), false, () => {
        const res = resolveVanished(vanished, item.id, 'restored');
        vanished = res.vanished; archived = res.archived; kept = res.kept;
        saveVanished(vanished); saveArchived(archived); saveKept(kept);
        renderEventLists();
      }));
      div.appendChild(actions);
      container.appendChild(div);
    }
    if (archivedCount > 0) {
      const note = document.createElement('p');
      note.className = 'muted small';
      note.textContent = t(settings.language, 'archivedNote', { n: archivedCount });
      container.appendChild(note);
    }
  }

  if (changes.length === 0 && pending.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = t(settings.language, 'emptyChanges');
    container.appendChild(p);
    return;
  }
  for (const c of [...changes].reverse().slice(0, 50)) {
    const div = document.createElement('div');
    div.className = 'card change-item';
    const title = document.createElement('div');
    const kind = document.createElement('span');
    kind.className = `change-kind ${c.kind}`;
    kind.textContent = t(settings.language, `ch_${c.kind}`);
    title.appendChild(kind);
    title.appendChild(document.createTextNode(c.summary));
    div.appendChild(title);
    if (c.detail) {
      const detail = document.createElement('div');
      detail.className = 'muted small';
      detail.textContent = c.detail;
      div.appendChild(detail);
    }
    const when = document.createElement('div');
    when.className = 'when';
    when.textContent = new Intl.DateTimeFormat(settings.language === 'zh-CN' ? 'zh-CN' : 'en-AU', {
      timeZone: settings.timezone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(c.detectedAt));
    div.appendChild(when);
    container.appendChild(div);
  }
}

function renderSources(): void {
  const container = $('#sourceList');
  container.innerHTML = '';
  for (const src of sources) {
    const chip = document.createElement('div');
    chip.className = 'source-chip';
    const name = document.createElement('div');
    name.innerHTML = `<strong>${escapeHtml(src.name)}</strong><div class="meta">${
      settings.language === 'zh-CN' ? '上次导入' : 'last synced'
    }: ${src.lastSyncedAt ? new Date(src.lastSyncedAt).toLocaleString(settings.language) : t(settings.language, 'never')}${
      src.stale ? ` · <span class="stale">${t(settings.language, 'stale')}</span>` : ''
    }${src.lastError ? ` · ${escapeHtml(src.lastError)}` : ''}</div>`;
    chip.appendChild(name);
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Remove';
    del.addEventListener('click', () => {
      // P0-01: cleanup is scoped to THIS source only — other calendars'
      // marks are never touched. Data remains exportable until this point.
      sources = sources.filter((s) => s.id !== src.id);
      saveSources(sources);
      changes.push({
        kind: 'removed', uid: '-', summary: src.name,
        detail: 'calendar removed by user', detectedAt: new Date().toISOString(),
      });
      saveChanges(changes);
      const prefix = `${src.id}:`;
      const dropIds = (rec: Record<string, unknown>) => {
        const next: Record<string, unknown> = {};
        let changed = false;
        for (const [k, v] of Object.entries(rec)) {
          if (k.startsWith(prefix)) changed = true;
          else next[k] = v;
        }
        return changed ? next : rec;
      };
      marks = dropIds(marks) as Record<string, EventMark>;
      vanished = dropIds(vanished) as Record<string, VanishedEvent>;
      archived = dropIds(archived) as Record<string, VanishedEvent>;
      kept = dropIds(kept) as Record<string, VanishedEvent>;
      saveMarks(marks);
      saveVanished(vanished);
      saveArchived(archived);
      saveKept(kept);
      renderAll();
    });
    chip.appendChild(del);
    container.appendChild(chip);
  }
}

// ---------- import ----------

function bindImport(): void {
  const dz = $('#dropZone');
  const input = $<HTMLInputElement>('#fileInput');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') input.click(); });
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragover');
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) importFile(file);
  });
  input.addEventListener('change', () => {
    if (input.files?.[0]) importFile(input.files[0]);
    input.value = '';
  });
  $('#demoBtn').addEventListener('click', () => {
    importIcsText(DEMO_ICS, 'Riverbend Uni — Semester 2 (DEMO)', 'demo');
  });
  $('#importMoreBtn').addEventListener('click', () => {
    $('#onboarding').classList.remove('hidden');
    $('#onboarding').scrollIntoView({ behavior: 'smooth' });
  });
}

function importFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => importIcsText(String(reader.result), file.name.replace(/\.ics$/i, ''), 'file');
  reader.onerror = () => showError(t(settings.language, 'importFailed', { msg: 'could not read the file' }));
  reader.readAsText(file);
}

/**
 * Core import path. Parses locally, detects changes vs the previous import of
 * the same source name (re-import = re-sync), persists everything.
 *
 * BLOCKER 3 — transaction safety: the import is validate-then-commit.
 *  1. Parse first; an invalid ICS aborts here and touches NOTHING.
 *  2. A syntactically valid but EMPTY calendar asks for explicit
 *     confirmation before it replaces a non-empty source (or creates one).
 *  3. Only after validation/confirmation does any persisted state change.
 * A failed import therefore never overwrites the last good snapshot and
 * never loses the student's marks, statuses, or vanished/kept records.
 *
 * P0-01: cleanup NEVER touches other calendars' marks — pruning happens only
 * when a source is explicitly removed, and is scoped to that source.
 * P0-02: events that disappeared from the feed are preserved as snapshots
 * (with the student's marks) and queued for confirmation — never deleted.
 * P0-03: marks use source-scoped ids; time-moved instances migrate their mark.
 */
function importIcsText(icsText: string, name: string, sourceType: 'file' | 'demo'): void {
  const lang = settings.language;

  // 1. Validate first — no state has been touched yet.
  const parsed = parseICS(icsText, settings.timezone);

  // BLOCKER 3: a genuinely INVALID file (corrupt / not a VCALENDAR) is
  // refused outright — it is NOT treated as an empty calendar, and the
  // previously imported source keeps its last good snapshot untouched.
  if (parsed.unparseable) {
    showError(`${t(lang, 'importFailed', { msg: parsed.warnings[0] ?? 'not a valid iCalendar file' })}`);
    return;
  }

  // 2. A valid but EMPTY calendar needs explicit confirmation before it
  //    replaces a non-empty source (or creates one).
  const existingIdx = sources.findIndex((s) => s.name === name && s.sourceType === sourceType);
  const isReimport = existingIdx >= 0;
  if (parsed.events.length === 0) {
    const ask = isReimport
      ? t(lang, 'emptyReimportConfirm', { name, n: parseICS(sources[existingIdx!].icsText, settings.timezone).events.length })
      : t(lang, 'emptyImportConfirm');
    if (!window.confirm(ask)) return; // student declined — old data stays exactly as it was
  }

  // 3. Commit — from here on we mutate and persist.
  const nowIso = new Date().toISOString();
  const srcId = existingIdx >= 0 ? sources[existingIdx].id : genId();
  const scope = (e: { id: string }) => `${srcId}:${e.id}`;

  if (isReimport) {
    const prevScoped = parseICS(sources[existingIdx].icsText, settings.timezone)
      .events.map((e) => ({ ...e, id: scope(e) }));
    const newScoped = parsed.events.map((e) => ({ ...e, id: scope(e) }));
    const diff = diffSnapshots(prevScoped, newScoped, nowIso);
    if (diff.changes.length) {
      changes.push(...diff.changes);
      saveChanges(changes);
    }

    // P0-02: vanished events → snapshots with the student's marks, pending confirmation.
    for (const removedEv of diff.removed) {
      const mark = marks[removedEv.id] ?? { category: 'other' as const, status: 'not_started' as const };
      const res = addVanished(vanished, {
        id: removedEv.id,
        sourceId: srcId,
        sourceName: sources[existingIdx].name,
        event: { ...removedEv, id: removedEv.id.slice(srcId.length + 1) },
        mark,
        detectedAt: nowIso,
      });
      vanished = res.store;
    }

    // Time-moved instances: carry the mark to the new instance key.
    let marksChanged = false;
    for (const { from, to } of diff.timeMoved) {
      if (marks[from.id] && from.id !== to.id) {
        marks[to.id] = marks[from.id];
        delete marks[from.id];
        marksChanged = true;
      }
    }
    // Re-appeared events (school re-added it): clear their vanished snapshot
    // AND any kept-visible record, so the real feed event renders exactly once.
    for (const addedEv of diff.added) {
      if (vanished[addedEv.id]) {
        const snap = vanished[addedEv.id];
        const { vanished: nextV } = resolveVanished(vanished, addedEv.id, 'restored');
        vanished = nextV;
        marks[addedEv.id] = snap.mark;
        marksChanged = true;
      }
      if (kept[addedEv.id]) {
        kept = removeKept(kept, addedEv.id);
      }
    }
    if (marksChanged) saveMarks(marks);
    saveVanished(vanished);
    saveKept(kept);

    sources[existingIdx] = {
      ...sources[existingIdx],
      icsText,
      lastSyncedAt: nowIso,
      stale: false,
      lastError: undefined,
    };
  } else {
    sources.push({ id: srcId, name, sourceType, icsText, lastSyncedAt: nowIso });
  }

  try {
    saveSources(sources);
    saveVanished(vanished);
  } catch (err) {
    showError(t(lang, 'importFailed', { msg: (err as Error).message }));
    return;
  }

  $('#onboarding').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderAll();
  activeView = 'today';
  renderTabs();
  renderViews();

  if (parsed.events.length === 0) {
    // Confirmed-empty import. Everything previously in this source lives on
    // as vanished snapshots awaiting confirmation — nothing was destroyed.
    const note = isReimport
      ? t(lang, 'emptyReimportDone', { name })
      : `${t(lang, 'importFailed', { msg: parsed.warnings[0] ?? 'no events found' })}`;
    showModal(t(lang, 'importEmptyTitle'), note);
    return;
  }
  let msg = t(lang, 'importSuccess', { n: parsed.events.length, name });
  if (parsed.warnings.length) msg += '\n\n' + t(lang, 'importWarnings') + '\n• ' + parsed.warnings.join('\n• ');
  const pendingCount = Object.keys(vanished).length + Object.keys(kept).length;
  if (pendingCount > 0) {
    msg += '\n\n' + t(lang, 'vanishedHeading') + ' (' + pendingCount + ') — ' + t(lang, 'changes');
  }
  showModal(t(lang, 'importSuccess', { n: parsed.events.length, name }).split('.')[0], msg);
}

// ---------- digest ----------

function bindDigest(): void {
  $('#digestBtn').addEventListener('click', () => {
    const lang = settings.language;
    const digest = buildDigest(allEvents(), marks, settings, Date.now(), lang);
    const body = $('#modalBody');
    body.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'digest-output';
    pre.textContent = digest.text;
    body.appendChild(pre);
    const copy = document.createElement('button');
    copy.className = 'btn primary small';
    copy.textContent = t(lang, 'copyDigest');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(digest.text);
        copy.textContent = t(lang, 'copied');
        setTimeout(() => (copy.textContent = t(lang, 'copyDigest')), 1500);
      } catch {
        // clipboard blocked — select the text instead
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
    body.appendChild(copy);
    const note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = t(lang, 'digestNote');
    body.appendChild(note);
    showModal(t(lang, 'digestTitle'));
  });
}

// ---------- settings ----------

function fillSettingsForm(): void {
  const tzIn = $<HTMLInputElement>('#setTimezone');
  const langSel = $<HTMLSelectElement>('#setLanguage');
  const num = (sel: string) => $<HTMLInputElement>(sel);
  tzIn.value = settings.timezone;
  langSel.value = settings.language;
  // NOTE: digestHour is NOT shown in the UI in v0.1.x — no scheduler is
  // connected yet, so showing it would imply automated delivery that
  // doesn't exist. The setting stays in storage for v0.2.
  num('#setUrgentHours').value = String(settings.urgentHours);
  num('#setHighHours').value = String(settings.highHours);
  num('#setSoonDays').value = String(settings.soonDays);
}

function bindSettings(): void {
  const numVal = (sel: string) => Number($<HTMLInputElement>(sel).value);
  const tzIn = $<HTMLInputElement>('#setTimezone');
  const langSel = $<HTMLSelectElement>('#setLanguage');
  const apply = (patch: Partial<Settings>, validate?: () => string | null) => {
    if (validate) {
      const err = validate();
      if (err) { showError(err); fillSettingsForm(); return; }
    }
    settings = { ...settings, ...patch };
    saveSettings(settings);
    renderAll();
    fillSettingsForm();
  };
  tzIn.addEventListener('change', () => {
    const v = tzIn.value.trim();
    apply({ timezone: v }, () => (isValidTimeZone(v) ? null : (settings.language === 'zh-CN' ? `无效时区：${v}` : `Not a valid IANA timezone: ${v}`)));
  });
  langSel.addEventListener('change', () => {
    apply({ language: langSel.value as Lang });
  });
  $('#setUrgentHours').addEventListener('change', () => {
    const n = numVal('#setUrgentHours');
    apply({ urgentHours: n }, () => (Number.isInteger(n) && n > 0 && n < settings.highHours ? null : `must be > 0 and < ${settings.highHours}`));
  });
  $('#setHighHours').addEventListener('change', () => {
    const n = numVal('#setHighHours');
    apply({ highHours: n }, () => (Number.isInteger(n) && n > settings.urgentHours ? null : `must be > ${settings.urgentHours}`));
  });
  $('#setSoonDays').addEventListener('change', () => {
    const n = numVal('#setSoonDays');
    apply({ soonDays: n }, () => (Number.isInteger(n) && n >= 1 && n <= 90 ? null : '1–90'));
  });

  $('#exportBtn').addEventListener('click', () => {
    downloadFile(`uniflow-export-${new Date().toISOString().slice(0, 10)}.json`, exportAllData());
  });

  $('#clearBtn').addEventListener('click', () => {
    const lang = settings.language;
    if (!window.confirm(t(lang, 'clearConfirm1'))) return;
    if (!window.confirm(t(lang, 'clearConfirm2'))) return;
    clearAllData();
    settings = loadSettings();
    sources = [];
    marks = {};
    changes = [];
    vanished = {};
    archived = {};
    kept = {};
    renderAll();
    showModal(t(lang, 'cleared'), t(lang, 'cleared'));
  });
}

// ---------- modal helpers ----------

function showModal(title: string, bodyText?: string): void {
  $('#modalTitle').textContent = title;
  if (bodyText !== undefined) {
    const body = $('#modalBody');
    body.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'digest-output';
    pre.textContent = bodyText;
    body.appendChild(pre);
  }
  $('#modal').classList.remove('hidden');
}

function closeModal(): void {
  $('#modal').classList.add('hidden');
  $('#modalBody').innerHTML = '';
}

function showError(msg: string): void {
  showModal(settings.language === 'zh-CN' ? '出错了' : 'Something went wrong', msg);
}

// ---------- utils ----------

function genId(): string {
  return 'src-' + Math.random().toString(36).slice(2, 10);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

init();
