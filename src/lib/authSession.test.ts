import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  clearAuthSession,
  isAuthSessionActive,
  markAuthSessionActive,
} from '@/lib/authSession';

beforeAll(() => {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, String(value));
      },
      removeItem: (key: string) => {
        mem.delete(key);
      },
    },
  });
});

describe('authSession', () => {
  afterEach(() => {
    clearAuthSession();
  });

  it('is inactive by default', () => {
    clearAuthSession();
    expect(isAuthSessionActive()).toBe(false);
  });

  it('becomes active after mark and inactive after clear', () => {
    markAuthSessionActive();
    expect(isAuthSessionActive()).toBe(true);
    clearAuthSession();
    expect(isAuthSessionActive()).toBe(false);
  });
});
