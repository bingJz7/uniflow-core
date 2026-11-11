/**
 * Storage tests — persistence with a mocked localStorage, data ownership
 * (export & clear), and mark lifecycle.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal localStorage mock (vitest runs in node env).
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

import {
  clearAllData, exportAllData, loadMarks, loadSettings, loadSources,
  pruneMarks, saveSources, updateMark,
} from '../src/storage.js';
import { DEFAULT_SETTINGS } from '../src/types.js';
import type { CalendarSource } from '../src/types.js';

beforeEach(() => store.clear());

describe('sources', () => {
  it('saves and reloads sources', () => {
    const src: CalendarSource = { id: 's1', name: 'demo', sourceType: 'demo', icsText: 'BEGIN:VCALENDAR\nEND:VCALENDAR' };
    saveSources([src]);
    expect(loadSources()).toEqual([src]);
  });
});

describe('marks', () => {
  it('updateMark merges and persists status/category', () => {
    let marks = loadMarks();
    marks = updateMark(marks, 'evt-1/single', { status: 'in_progress' });
    expect(marks['evt-1/single']).toEqual({ category: 'other', status: 'in_progress' });
    marks = updateMark(marks, 'evt-1/single', { category: 'assignment' });
    expect(marks['evt-1/single']).toEqual({ category: 'assignment', status: 'in_progress' });
    expect(loadMarks()['evt-1/single'].category).toBe('assignment');
  });

  it('pruneMarks drops marks for dead top-level ids, keeps live ones', () => {
    const marks = {
      'live/single': { category: 'quiz' as const, status: 'in_progress' as const },
      'dead/single': { category: 'other' as const, status: 'not_started' as const },
    };
    const pruned = pruneMarks(marks, new Set(['live/single']));
    expect(Object.keys(pruned)).toEqual(['live/single']);
  });
});

describe('settings', () => {
  it('merges saved settings over defaults', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    store.set('uniflow.settings.v1', JSON.stringify({ timezone: 'Asia/Shanghai' }));
    expect(loadSettings().timezone).toBe('Asia/Shanghai');
    expect(loadSettings().urgentHours).toBe(DEFAULT_SETTINGS.urgentHours);
  });
});

describe('data ownership', () => {
  it('exportAllData returns a full JSON dump', () => {
    saveSources([{ id: 's1', name: 'x', sourceType: 'file', icsText: 'data' }]);
    const dump = JSON.parse(exportAllData());
    expect(dump.app).toBe('UniFlow Core');
    expect(dump.sources).toHaveLength(1);
    expect(dump.settings).toBeDefined();
  });

  it('clearAllData wipes everything', () => {
    saveSources([{ id: 's1', name: 'x', sourceType: 'file', icsText: 'data' }]);
    clearAllData();
    expect(loadSources()).toHaveLength(0);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadMarks()).toEqual({});
  });
});
