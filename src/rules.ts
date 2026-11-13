/**
 * UniFlow Core — deterministic rule engine. NO AI.
 *
 * Given the parsed events and the user's settings, this produces the
 * Today / Upcoming / Overdue views, priority labels, and the daily digest.
 * Every output here is reproducible from inputs — same data + same settings
 * always yield the same result. That is the point of No-AI mode.
 */

import { DEADLINE_CATEGORIES } from './types.js';
import type { CalEvent, EventMark, Priority, Settings } from './types.js';
import { dayDiff } from './timezone.js';

export interface EnrichedEvent {
  event: CalEvent;
  category: EventMark['category'];
  status: EventMark['status'];
  /** Only defined for deadline categories (assignment/quiz/exam). */
  priority?: Priority;
}

export function priorityFor(event: CalEvent, mark: EventMark, settings: Settings, nowMs: number): Priority | undefined {
  if (!DEADLINE_CATEGORIES.has(mark.category)) return undefined;
  const diffH = (event.startMs - nowMs) / 3600000;
  if (event.startMs < nowMs) return 'overdue';
  if (diffH <= settings.urgentHours) return 'urgent';
  if (diffH <= settings.highHours) return 'high';
  if (diffH <= settings.soonDays * 24) return 'upcoming';
  return 'later';
}

export function enrich(events: CalEvent[], marks: Record<string, EventMark>, settings: Settings, nowMs: number): EnrichedEvent[] {
  return events
    .filter((e) => !e.cancelled)
    .map((event) => {
      const mark = marks[event.id] ?? { category: 'other' as const, status: 'not_started' as const };
      return {
        event,
        category: mark.category,
        status: mark.status,
        priority: priorityFor(event, mark, settings, nowMs),
      };
    })
    .sort((a, b) => a.event.startMs - b.event.startMs);
}

/** Today = events whose local day (in the user's timezone) equals today's. */
export function eventsToday(enriched: EnrichedEvent[], timezone: string, nowMs: number): EnrichedEvent[] {
  return enriched.filter((e) => dayDiff(timezone, e.event.startMs, nowMs) === 0);
}

/** Next N days (default 7), excluding today, in the user's timezone. */
export function eventsUpcoming(enriched: EnrichedEvent[], timezone: string, nowMs: number, days = 7): EnrichedEvent[] {
  return enriched.filter((e) => {
    const d = dayDiff(timezone, e.event.startMs, nowMs);
    return d > 0 && d <= days;
  });
}

export function eventsOverdue(enriched: EnrichedEvent[], nowMs: number): EnrichedEvent[] {
  return enriched.filter((e) => DEADLINE_CATEGORIES.has(e.category) && e.event.startMs < nowMs && e.status !== 'completed');
}

/** Everything on a specific view, excluding completed items on task views. */
export function pendingOnly(enriched: EnrichedEvent[]): EnrichedEvent[] {
  return enriched.filter((e) => e.status !== 'completed');
}

// ---------- daily digest (in-app, copyable) ----------

export interface Digest {
  generatedAt: string;
  timezone: string;
  lines: string[];
  text: string;
}

/**
 * Deterministic daily summary in the user's language.
 * Includes: overdue deadlines, today's items, next 7 days' deadlines.
 */
export function buildDigest(
  events: CalEvent[],
  marks: Record<string, EventMark>,
  settings: Settings,
  nowMs: number,
  lang: 'en' | 'zh-CN',
): Digest {
  const enriched = enrich(events, marks, settings, nowMs);
  const lines: string[] = [];

  if (lang === 'zh-CN') {
    lines.push(`📚 UniFlow 每日学习摘要 — ${formatDate(settings.timezone, nowMs)}`);
    const overdue = eventsOverdue(enriched, nowMs);
    lines.push('');
    lines.push(`⏰ 已逾期 (${overdue.length})`);
    if (overdue.length === 0) lines.push('  无');
    for (const e of overdue.slice(0, 10)) lines.push(`  • ${e.event.summary} — 截止于 ${formatDateTime(settings.timezone, e.event.startMs)}${e.event.allDay ? '（全天）' : ''}${unconf(e, lang)}`);

    const today = eventsToday(enriched, settings.timezone, nowMs);
    lines.push('');
    lines.push(`📌 今天 (${today.length})`);
    if (today.length === 0) lines.push('  今天没有日程，好好休息或提前规划吧。');
    for (const e of today) lines.push(`  • ${categoryLabel(e.category, lang)} ${e.event.summary} — ${formatDateTime(settings.timezone, e.event.startMs)}${e.event.allDay ? '（全天）' : ''}${unconf(e, lang)}`);

    const upcoming = eventsUpcoming(enriched, settings.timezone, nowMs, settings.soonDays).filter((e) => DEADLINE_CATEGORIES.has(e.category));
    lines.push('');
    lines.push(`🗓️ 未来 ${settings.soonDays} 天的截止事项 (${upcoming.length})`);
    if (upcoming.length === 0) lines.push('  无');
    for (const e of upcoming.slice(0, 15)) lines.push(`  • ${e.event.summary} — 截止于 ${formatDateTime(settings.timezone, e.event.startMs)}${e.event.allDay ? '（全天）' : ''}${unconf(e, lang)}`);

    lines.push('');
    lines.push('— 由 UniFlow 规则引擎生成（非 AI，确定性规则）');
  } else {
    lines.push(`📚 UniFlow Daily Digest — ${formatDate(settings.timezone, nowMs)}`);
    const overdue = eventsOverdue(enriched, nowMs);
    lines.push('');
    lines.push(`⏰ Overdue (${overdue.length})`);
    if (overdue.length === 0) lines.push('  none');
    for (const e of overdue.slice(0, 10)) lines.push(`  • ${e.event.summary} — due ${formatDateTime(settings.timezone, e.event.startMs)}${e.event.allDay ? ' (all day)' : ''}${unconf(e, lang)}`);

    const today = eventsToday(enriched, settings.timezone, nowMs);
    lines.push('');
    lines.push(`📌 Today (${today.length})`);
    if (today.length === 0) lines.push('  Nothing scheduled today.');
    for (const e of today) lines.push(`  • ${categoryLabel(e.category, lang)} ${e.event.summary} — ${formatDateTime(settings.timezone, e.event.startMs)}${e.event.allDay ? ' (all day)' : ''}${unconf(e, lang)}`);

    const upcoming = eventsUpcoming(enriched, settings.timezone, nowMs, settings.soonDays).filter((e) => DEADLINE_CATEGORIES.has(e.category));
    lines.push('');
    lines.push(`🗓️ Deadlines in the next ${settings.soonDays} days (${upcoming.length})`);
    if (upcoming.length === 0) lines.push('  none');
    for (const e of upcoming.slice(0, 15)) lines.push(`  • ${e.event.summary} — due ${formatDateTime(settings.timezone, e.event.startMs)}${e.event.allDay ? ' (all day)' : ''}${unconf(e, lang)}`);

    lines.push('');
    lines.push('— Generated by UniFlow rule engine (deterministic, no AI)');
  }

  return { generatedAt: new Date(nowMs).toISOString(), timezone: settings.timezone, lines, text: lines.join('\n') };
}

function categoryLabel(cat: EventMark['category'], lang: 'en' | 'zh-CN'): string {
  const en: Record<string, string> = { assignment: '[Assignment]', quiz: '[Quiz]', exam: '[Exam]', class: '[Class]', other: '' };
  const zh: Record<string, string> = { assignment: '[作业]', quiz: '[测验]', exam: '[考试]', class: '[课程]', other: '' };
  return (lang === 'zh-CN' ? zh : en)[cat] ?? '';
}

/** Marker appended to digest lines for kept-visible events whose source no longer lists them. */
function unconf(e: EnrichedEvent, lang: 'en' | 'zh-CN'): string {
  return e.event.unconfirmed ? (lang === 'zh-CN' ? ' ⚠（来源未确认）' : ' ⚠ (source unconfirmed)') : '';
}

function formatDate(tz: string, ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

function formatDateTime(tz: string, ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}
