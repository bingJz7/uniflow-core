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
  clearAllData, downloadFile, exportAllData, loadChanges, loadMarks, loadSettings, loadSources,
  pruneMarks, saveChanges, saveMarks, saveSettings, saveSources, updateMark,
} from './storage.js';
import { diffSnapshots } from './sync.js';
import { countdown, isValidTimeZone } from './timezone.js';
import type { CalendarSource, EventCategory, EventMark, Settings, SourceChange, TaskStatus } from './types.js';

// ---------- state ----------

let settings: Settings = loadSettings();
let sources: CalendarSource[] = loadSources();
let marks: Record<string, EventMark> = loadMarks();
let changes: SourceChange[] = loadChanges();

let activeView = 'today';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

/** All parsed events across sources (demo/file/url). */
function allEvents() {
  const out = [];
  for (const src of sources) {
    try {
      const parsed = parseICS(src.icsText, settings.timezone);
      out.push(...parsed.events);
    } catch {
      // a broken source must not break the whole app; sync UI shows its state
    }
  }
  return out;
}

// ---------- boot ----------

function init(): void {
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
  $('#lblDigestHour').textContent = t(lang, 'digestHourLabel');
  $('#lblUrgentHours').textContent = t(lang, 'urgentHoursLabel');
  $('#lblHighHours').textContent = t(lang, 'highHoursLabel');
  $('#lblSoonDays').textContent = t(lang, 'soonDaysLabel');
  $('#exportBtn').textContent = t(lang, 'exportData');
  $('#clearBtn').textContent = t(lang, 'clearData');
  $('#privacyNote').textContent = t(lang, 'confirmedDeadlinesNote');
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
  renderList('#list-today', eventsToday(enriched, settings.timezone, nowMs), nowMs);
  renderList('#list-upcoming', eventsUpcoming(enriched, settings.timezone, nowMs, settings.soonDays), nowMs);
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
  return div;
}

// ---------- changes view ----------

function renderChanges(): void {
  const container = $('#list-changes');
  container.innerHTML = '';
  if (changes.length === 0) {
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
      sources = sources.filter((s) => s.id !== src.id);
      saveSources(sources);
      changes.push({
        kind: 'removed', uid: '-', summary: src.name,
        detail: 'calendar removed by user', detectedAt: new Date().toISOString(),
      });
      saveChanges(changes);
      marks = pruneMarks(marks, new Set(allEvents().map((e) => e.id)));
      saveMarks(marks);
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
 */
function importIcsText(icsText: string, name: string, sourceType: 'file' | 'demo'): void {
  const lang = settings.language;
  let parsed;
  try {
    parsed = parseICS(icsText, settings.timezone);
  } catch (err) {
    showError(t(lang, 'importFailed', { msg: (err as Error).message }));
    return;
  }

  // Re-import of an existing source (same name) = sync: diff old vs new.
  const existingIdx = sources.findIndex((s) => s.name === name && s.sourceType === sourceType);
  const nowIso = new Date().toISOString();
  if (existingIdx >= 0) {
    const prev = parseICS(sources[existingIdx].icsText, settings.timezone);
    const diff = diffSnapshots(prev.events, parsed.events, nowIso);
    if (diff.changes.length) {
      changes.push(...diff.changes);
      saveChanges(changes);
    }
    sources[existingIdx] = {
      ...sources[existingIdx],
      icsText,
      lastSyncedAt: nowIso,
      stale: false,
      lastError: undefined,
    };
  } else {
    sources.push({ id: genId(), name, sourceType, icsText, lastSyncedAt: nowIso });
  }
  saveSources(sources);

  // prune marks pointing at events that no longer exist
  const liveIds = new Set(parsed.events.map((e) => e.id));
  marks = pruneMarks(marks, liveIds);
  saveMarks(marks);

  $('#onboarding').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderAll();
  activeView = 'today';
  renderTabs();
  renderViews();

  if (parsed.events.length === 0) {
    showError(`${t(lang, 'importFailed', { msg: parsed.warnings[0] ?? 'no events found' })}`);
    return;
  }
  let msg = t(lang, 'importSuccess', { n: parsed.events.length, name });
  if (parsed.warnings.length) msg += '\n\n' + t(lang, 'importWarnings') + '\n• ' + parsed.warnings.join('\n• ');
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
  num('#setDigestHour').value = String(settings.digestHour);
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
  $('#setDigestHour').addEventListener('change', () => {
    const n = numVal('#setDigestHour');
    apply({ digestHour: n }, () => (Number.isInteger(n) && n >= 0 && n <= 23 ? null : '0–23'));
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
