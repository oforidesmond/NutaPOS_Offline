import { describe, expect, it } from 'vitest';
import { hashPin, randomSalt, verifyPin } from '@/lib/pinHash';

describe('pinHash', () => {
  it('verifies matching PIN', async () => {
    const salt = randomSalt();
    const hash = await hashPin('1234', salt);
    expect(await verifyPin('1234', salt, hash)).toBe(true);
    expect(await verifyPin('0000', salt, hash)).toBe(false);
  });
});
