import { describe, expect, it } from 'vitest';
import { dateBounds, dayBounds, priorPeriodBounds, shiftDayKey, utcDayKey } from '@/lib/dateBounds';

describe('dateBounds', () => {
  const now = new Date('2026-11-24T15:30:00.000Z');

  it('resolves today and yesterday as full UTC days', () => {
    expect(dateBounds('today', now)).toEqual(dayBounds('2026-11-24'));
    expect(dateBounds('yesterday', now)).toEqual(dayBounds('2026-11-23'));
  });

  it('supports custom day and week/month open-ended from', () => {
    expect(dateBounds('custom', now, '2026-11-10')).toEqual(dayBounds('2026-11-10'));
    expect(dateBounds('week', now).dateFrom).toBe('2026-11-17T15:30:00.000Z');
    expect(dateBounds('month', now).dateFrom).toBe('2026-10-24T15:30:00.000Z');
    expect(dateBounds('all', now)).toEqual({});
  });

  it('shifts day keys and builds a prior window', () => {
    expect(shiftDayKey('2026-11-24', -1)).toBe('2026-11-23');
    expect(utcDayKey(now)).toBe('2026-11-24');
    const current = dayBounds('2026-11-24');
    const prior = priorPeriodBounds(current, now);
    expect(prior.dateTo).toBe(new Date(new Date(current.dateFrom).getTime() - 1).toISOString());
    expect(prior.dateFrom).toBeDefined();
  });
});
