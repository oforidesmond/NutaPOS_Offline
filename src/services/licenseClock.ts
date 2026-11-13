import { licenseRepository } from '@/db/licenseRepository';

const MAX_ROLLBACK_MS = 5 * 60 * 1000;

/**
 * Advances the offline watermark and detects clock rollback.
 * Returns the trusted "now" to use for license math.
 */
export async function tickLicenseClock(wallNow = Date.now()): Promise<{
  trustedNowMs: number;
  tampered: boolean;
}> {
  const state = await licenseRepository.get();
  if (!state) {
    return { trustedNowMs: wallNow, tampered: false };
  }

  const watermarkMs = Date.parse(state.last_known_good_time);
  const serverMs = state.last_server_time ? Date.parse(state.last_server_time) : NaN;
  const floorMs = Math.max(
    Number.isFinite(watermarkMs) ? watermarkMs : 0,
    Number.isFinite(serverMs) ? serverMs : 0,
  );

  if (wallNow + MAX_ROLLBACK_MS < floorMs) {
    await licenseRepository.updateWatermark(new Date(floorMs).toISOString(), true);
    return { trustedNowMs: floorMs, tampered: true };
  }

  const trustedNowMs = Math.max(wallNow, floorMs);
  if (trustedNowMs > floorMs) {
    await licenseRepository.updateWatermark(new Date(trustedNowMs).toISOString(), false);
  } else if (state.clock_tamper === 1 && wallNow >= floorMs) {
    // Stay tampered until online revalidation clears it.
  }

  return { trustedNowMs, tampered: state.clock_tamper === 1 || wallNow + MAX_ROLLBACK_MS < floorMs };
}

export async function applyServerTime(serverIso: string): Promise<void> {
  const state = await licenseRepository.get();
  if (!state) return;
  const serverMs = Date.parse(serverIso);
  if (!Number.isFinite(serverMs)) return;
  const watermarkMs = Date.parse(state.last_known_good_time);
  const nextWatermark = Math.max(serverMs, Number.isFinite(watermarkMs) ? watermarkMs : 0);
  await licenseRepository.save({
    ...state,
    last_server_time: serverIso,
    last_known_good_time: new Date(nextWatermark).toISOString(),
    clock_tamper: 0,
    updated_at: new Date().toISOString(),
  });
}
