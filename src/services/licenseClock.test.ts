import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { licenseRepository } from '@/db/licenseRepository';
import { tickLicenseClock } from '@/services/licenseClock';

describe('licenseClock', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('flags clock rollback below watermark', async () => {
    const watermark = new Date('2026-11-12T12:00:00.000Z').toISOString();
    await licenseRepository.save({
      entitlement_token: 'tok',
      entitlement_hash: 'hash',
      customer_id: 'c1',
      customer_name: 'Shop',
      device_id: 'd1',
      valid_from: watermark,
      valid_until: '2027-11-12T12:00:00.000Z',
      period_days: 365,
      amount_ghs: 600,
      grace_days: 0,
      last_server_time: watermark,
      last_known_good_time: watermark,
      clock_tamper: 0,
      reminder_flags_json: '{}',
      updated_at: watermark,
    });

    const rolled = Date.parse('2026-11-12T10:00:00.000Z');
    const result = await tickLicenseClock(rolled);
    expect(result.tampered).toBe(true);
    expect(result.trustedNowMs).toBe(Date.parse(watermark));
  });

  it('advances watermark when wall clock moves forward', async () => {
    const watermark = new Date('2026-11-12T12:00:00.000Z').toISOString();
    await licenseRepository.save({
      entitlement_token: 'tok',
      entitlement_hash: 'hash',
      customer_id: 'c1',
      customer_name: 'Shop',
      device_id: 'd1',
      valid_from: watermark,
      valid_until: '2027-11-12T12:00:00.000Z',
      period_days: 365,
      amount_ghs: 600,
      grace_days: 0,
      last_server_time: watermark,
      last_known_good_time: watermark,
      clock_tamper: 0,
      reminder_flags_json: '{}',
      updated_at: watermark,
    });

    const forward = Date.parse('2026-11-12T13:00:00.000Z');
    const result = await tickLicenseClock(forward);
    expect(result.tampered).toBe(false);
    expect(result.trustedNowMs).toBe(forward);
    const saved = await licenseRepository.get();
    expect(saved?.last_known_good_time).toBe(new Date(forward).toISOString());
  });
});
