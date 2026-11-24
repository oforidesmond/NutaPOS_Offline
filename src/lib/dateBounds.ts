/** Preset ranges shared by Sales history and Admin Reports. */
export type DateRangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom';

export type IsoBounds = { dateFrom?: string; dateTo?: string };

/** Calendar day key YYYY-MM-DD in UTC (Ghana GMT = UTC). */
export function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive UTC day bounds for a YYYY-MM-DD key. */
export function dayBounds(dayKey: string): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: `${dayKey}T00:00:00.000Z`,
    dateTo: `${dayKey}T23:59:59.999Z`,
  };
}

/** Shift a YYYY-MM-DD key by `delta` days (UTC). */
export function shiftDayKey(dayKey: string, delta: number): string {
  const d = new Date(`${dayKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return utcDayKey(d);
}

/**
 * Resolve ISO bounds for a preset. `customDay` is required when preset is `custom`.
 * Matches Sales history lexicographic compare on `sold_at`.
 */
export function dateBounds(preset: DateRangePreset, now = new Date(), customDay?: string): IsoBounds {
  if (preset === 'today') {
    return dayBounds(utcDayKey(now));
  }
  if (preset === 'yesterday') {
    return dayBounds(shiftDayKey(utcDayKey(now), -1));
  }
  if (preset === 'custom') {
    const key = customDay?.trim() || utcDayKey(now);
    return dayBounds(key);
  }
  if (preset === 'week') {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 7);
    return { dateFrom: start.toISOString() };
  }
  if (preset === 'month') {
    const start = new Date(now);
    start.setUTCMonth(start.getUTCMonth() - 1);
    return { dateFrom: start.toISOString() };
  }
  return {};
}

/** Prior equal-length window for comparison (same duration ending just before `dateFrom`). */
export function priorPeriodBounds(current: IsoBounds, now = new Date()): IsoBounds {
  if (!current.dateFrom) return {};
  const from = new Date(current.dateFrom).getTime();
  const to = current.dateTo ? new Date(current.dateTo).getTime() : now.getTime();
  const span = Math.max(0, to - from);
  const prevTo = from - 1;
  const prevFrom = prevTo - span;
  return {
    dateFrom: new Date(prevFrom).toISOString(),
    dateTo: new Date(prevTo).toISOString(),
  };
}
