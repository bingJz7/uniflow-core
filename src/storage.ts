/**
 * UniFlow Core — persistence layer.
 * All user data lives in localStorage on the student's own device.
 * Nothing here ever touches the network.
 *
 * Event identity (v0.1.1): event ids are SOURCE-SCOPED —
 *   `${sourceId}:${uid}/${instanceKey}`
 * Two calendars can safely contain the same UID (e.g. universities reuse
 * uid@local) without overwriting each other's category/status marks.
 * Legacy v0.1.0 ids (`uid/instanceKey`) are migrated on load.
 */

import { DEFAULT_SETTINGS } from './types.js';
import type { CalendarSource, EventMark, Settings, SourceChange, VanishedEvent } from './types.js';

const KEY_SOURCES = 'uniflow.sources.v1';
const KEY_MARKS = 'uniflow.marks.v1';
const KEY_SETTINGS = 'uniflow.settings.v1';
const KEY_CHANGES = 'uniflow.changes.v1';
const KEY_VANISHED = 'uniflow.vanished.v1';
const KEY_ARCHIVED = 'uniflow.archived.v1';
const KEY_KEPT = 'uniflow.kept.v1';

/** Build the stable, source-scoped id for an event instance. */
export function scopedEventId(sourceId: string, uid: string, instanceKey: string): string {
  return `${sourceId}:${uid}/${instanceKey}`;
}

/** Parse a scoped id into {sourceId, rest}. Legacy (v0.1.0) ids have no prefix. */
export function parseScopedEventId(id: string): { sourceId: string | null; rest: string } {
  const idx = id.indexOf(':');
  if (idx <= 0) return { sourceId: null, rest: id };
  return { sourceId: id.slice(0, idx), rest: id.slice(idx + 1) };
}

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

/**
 * Migrate legacy v0.1.0 mark keys (`uid/instance`) to source-scoped keys.
 * A legacy key is mapped to EVERY source that currently contains that uid
 * (the student's intent — category/status — applies to all of them), then
 * the legacy key is removed. Unresolvable legacy keys are kept: we never
 * destroy user data we cannot confidently map.
 */
export function migrateLegacyMarks(
  marks: Record<string, EventMark>,
  liveBySource: Map<string, Set<string>>, // sourceId -> set of `uid/instanceKey` rest-ids
): Record<string, EventMark> {
  let changed = false;
  const next: Record<string, EventMark> = {};
  for (const [id, mark] of Object.entries(marks)) {
    const { sourceId, rest } = parseScopedEventId(id);
    if (sourceId !== null) {
      next[id] = mark;
      continue;
    }
    // legacy key — find sources that contain this event
    let mapped = false;
    for (const [srcId, restIds] of liveBySource) {
      if (restIds.has(rest)) {
        next[scopedEventId(srcId, rest.split('/')[0], rest.split('/')[1] ?? 'single')] = mark;
        mapped = true;
      }
    }
    if (mapped) changed = true;
    else next[id] = mark; // keep unknown legacy data rather than deleting it
  }
  return changed ? next : marks;
}

/**
 * Prune marks that belong to NOTHING live anymore.
 * CRITICAL (P0-01): `liveEventIds` must be the union across ALL imported
 * calendars — importing course B must never prune course A's marks.
 * Marks preserved elsewhere (vanished snapshots / archived) are also kept.
 */
export function pruneMarks(
  marks: Record<string, EventMark>,
  liveEventIds: Set<string>,
  preservedIds: Set<string> = new Set(),
): Record<string, EventMark> {
  let changed = false;
  const next: Record<string, EventMark> = {};
  for (const [id, mark] of Object.entries(marks)) {
    if (liveEventIds.has(id) || preservedIds.has(id)) {
      next[id] = mark;
    } else {
      changed = true;
    }
  }
  return changed ? next : marks;
}

// ---------- vanished events (disappeared from a feed, pending confirmation) ----------

export function loadVanished(): Record<string, VanishedEvent> {
  return readJSON<Record<string, VanishedEvent>>(KEY_VANISHED, {});
}

export function saveVanished(vanished: Record<string, VanishedEvent>): void {
  writeJSON(KEY_VANISHED, vanished);
}

export function loadArchived(): Record<string, VanishedEvent> {
  return readJSON<Record<string, VanishedEvent>>(KEY_ARCHIVED, {});
}

export function saveArchived(archived: Record<string, VanishedEvent>): void {
  writeJSON(KEY_ARCHIVED, archived);
}

/** Record a vanished event (keeps the student's mark). Returns false if already tracked. */
export function addVanished(vanished: Record<string, VanishedEvent>, item: VanishedEvent): { changed: boolean; store: Record<string, VanishedEvent> } {
  if (vanished[item.id]) return { changed: false, store: vanished };
  const next = { ...vanished, [item.id]: item };
  saveVanished(next);
  return { changed: true, store: next };
}

/** Resolve a vanished event: archive it, mark it cancelled, or restore it. */
export function resolveVanished(
  vanished: Record<string, VanishedEvent>,
  id: string,
  resolution: 'archived' | 'cancelled' | 'restored',
): { vanished: Record<string, VanishedEvent>; archived: Record<string, VanishedEvent>; kept: Record<string, VanishedEvent> } {
  const item = vanished[id];
  const kept = loadKept();
  if (!item) return { vanished, archived: loadArchived(), kept };
  const nextVanished = { ...vanished };
  delete nextVanished[id];
  const archived = loadArchived();
  if (resolution === 'restored') {
    // BLOCKER 2 fix: "Keep visible" must actually keep the task visible while
    // it is still missing from the source. The snapshot moves to the kept
    // store (with its mark) and keeps rendering in All/Overdue/digest with an
    // explicit "source unconfirmed" flag — until the source re-adds it or the
    // student archives it. Nothing is silently dropped.
    const nextKept = { ...kept, [id]: { ...item, resolution: 'restored' as const, restoredAt: new Date().toISOString() } };
    saveVanished(nextVanished);
    saveKept(nextKept);
    return { vanished: nextVanished, archived, kept: nextKept };
  }
  const nextArchived = { ...archived, [id]: { ...item, resolution } };
  saveVanished(nextVanished);
  saveArchived(nextArchived);
  return { vanished: nextVanished, archived: nextArchived, kept };
}

/** Remove an entry from the kept store (e.g. the source re-added the event). */
export function removeKept(kept: Record<string, VanishedEvent>, id: string): Record<string, VanishedEvent> {
  if (!kept[id]) return kept;
  const next = { ...kept };
  delete next[id];
  saveKept(next);
  return next;
}

// ---------- kept events (student chose "keep visible" for a vanished event) ----------

export function loadKept(): Record<string, VanishedEvent> {
  return readJSON<Record<string, VanishedEvent>>(KEY_KEPT, {});
}

export function saveKept(kept: Record<string, VanishedEvent>): void {
  writeJSON(KEY_KEPT, kept);
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
      version: 2,
      exportedAt: new Date().toISOString(),
      sources: loadSources(),
      marks: loadMarks(),
      settings: loadSettings(),
      changes: loadChanges(),
      vanished: loadVanished(),
      archived: loadArchived(),
      kept: loadKept(),
    },
    null,
    2,
  );
}

/** Remove ALL UniFlow data from this device. Irreversible — the UI must confirm twice. */
export function clearAllData(): void {
  for (const key of [KEY_SOURCES, KEY_MARKS, KEY_SETTINGS, KEY_CHANGES, KEY_VANISHED, KEY_ARCHIVED, KEY_KEPT]) {
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
  a.click();
  URL.revokeObjectURL(url);
}
