/**
 * UniFlow Core — persistence layer.
 * All user data lives in localStorage on the student's own device.
 * Nothing here ever touches the network.
 */

import { DEFAULT_SETTINGS } from './types.js';
import type { CalendarSource, EventMark, Settings, SourceChange } from './types.js';

const KEY_SOURCES = 'uniflow.sources.v1';
const KEY_MARKS = 'uniflow.marks.v1';
const KEY_SETTINGS = 'uniflow.settings.v1';
const KEY_CHANGES = 'uniflow.changes.v1';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // localStorage full or blocked — surface, don't silently lose data.
    throw new Error(
      `Could not save data locally (${(err as Error).message}). Your browser storage may be full or restricted.`,
    );
  }
}

// ---------- sources ----------

export function loadSources(): CalendarSource[] {
  return readJSON<CalendarSource[]>(KEY_SOURCES, []);
}

export function saveSources(sources: CalendarSource[]): void {
  writeJSON(KEY_SOURCES, sources);
}

// ---------- per-event marks (category + status) ----------

export function loadMarks(): Record<string, EventMark> {
  return readJSON<Record<string, EventMark>>(KEY_MARKS, {});
}

export function saveMarks(marks: Record<string, EventMark>): void {
  writeJSON(KEY_MARKS, marks);
}

export function getMark(marks: Record<string, EventMark>, eventId: string): EventMark | undefined {
  return marks[eventId];
}

/** Merge updater: set (or clear) a field of one mark and persist. */
export function updateMark(
  marks: Record<string, EventMark>,
  eventId: string,
  patch: Partial<EventMark>,
): Record<string, EventMark> {
  const existing = marks[eventId] ?? { category: 'other' as const, status: 'not_started' as const };
  marks[eventId] = { ...existing, ...patch };
  saveMarks(marks);
  return marks;
}

/** Marks for events that no longer exist anywhere are pruned on import/sync. */
export function pruneMarks(marks: Record<string, EventMark>, liveEventIds: Set<string>): Record<string, EventMark> {
  let changed = false;
  const next: Record<string, EventMark> = {};
  for (const [id, mark] of Object.entries(marks)) {
    if (liveEventIds.has(id)) {
      next[id] = mark;
    } else {
      changed = true;
    }
  }
  return changed ? next : marks;
}

// ---------- settings ----------

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...readJSON<Partial<Settings>>(KEY_SETTINGS, {}) };
}

export function saveSettings(settings: Settings): void {
  writeJSON(KEY_SETTINGS, settings);
}

// ---------- detected changes ----------

export function loadChanges(): SourceChange[] {
  return readJSON<SourceChange[]>(KEY_CHANGES, []);
}

export function saveChanges(changes: SourceChange[]): void {
  writeJSON(KEY_CHANGES, changes.slice(-200)); // keep last 200
}

// ---------- user data ownership: export & clear ----------

/** Full local dump the student can download and keep. */
export function exportAllData(): string {
  return JSON.stringify(
    {
      app: 'UniFlow Core',
      version: 1,
      exportedAt: new Date().toISOString(),
      sources: loadSources(),
      marks: loadMarks(),
      settings: loadSettings(),
      changes: loadChanges(),
    },
    null,
    2,
  );
}

/** Remove ALL UniFlow data from this device. Irreversible — the UI must confirm twice. */
export function clearAllData(): void {
  for (const key of [KEY_SOURCES, KEY_MARKS, KEY_SETTINGS, KEY_CHANGES]) {
    localStorage.removeItem(key);
  }
}

/** JSON file download (no server involved). */
export function downloadFile(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
