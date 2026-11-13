import { licenseRepository } from '@/db/licenseRepository';
import { settingsRepository } from '@/db/settingsRepository';
import { licenseApi } from '@/api/licenseApi';
import { getDeviceIdentity } from '@/services/deviceIdentity';
import { applyServerTime, tickLicenseClock } from '@/services/licenseClock';
import { hashEntitlementToken, verifyEntitlementToken, verifySupportUnlockToken } from '@/services/licenseCrypto';
import {
  REMINDER_THRESHOLDS,
  type LicenseStatus,
  type LicenseEntitlementClaims,
} from '@/services/licenseTypes';
import type { OrganizationDto } from '@/types/organization';

function daysBetween(fromMs: number, toMs: number): number {
  return Math.ceil((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

function bannerForDays(daysRemaining: number): number | null {
  for (const threshold of REMINDER_THRESHOLDS) {
    if (daysRemaining <= threshold) return threshold;
  }
  return null;
}

async function persistClaims(token: string, claims: LicenseEntitlementClaims, serverTime?: string) {
  const hash = await hashEntitlementToken(token);
  const nowIso = new Date().toISOString();
  const serverIso = serverTime ?? nowIso;
  await licenseRepository.save({
    entitlement_token: token,
    entitlement_hash: hash,
    customer_id: claims.customerId,
    customer_name: claims.customerName,
    device_id: claims.deviceId,
    valid_from: claims.validFrom,
    valid_until: claims.validUntil,
    period_days: claims.periodDays,
    amount_ghs: claims.amountGhs,
    grace_days: claims.graceDays,
    last_server_time: serverIso,
    last_known_good_time: serverIso,
    clock_tamper: 0,
    reminder_flags_json: '{}',
    updated_at: nowIso,
  });

  await settingsRepository.setJson(settingsRepository.keys.organization, {
    id: claims.orgId,
    name: claims.customerName,
    planType: 'PAID',
    planStatus: 'ACTIVE',
  } satisfies OrganizationDto);

  await settingsRepository.setInitialSyncDone(true);
}

export const licenseService = {
  async hasSetupUsers(): Promise<boolean> {
    const { userRepository } = await import('@/db/userRepository');
    return (await userRepository.countAdmins()) > 0;
  },

  async isActivated(): Promise<boolean> {
    return (await licenseRepository.get()) != null;
  },

  async activateWithCode(activationCode: string): Promise<void> {
    const identity = await getDeviceIdentity();
    const res = await licenseApi.activate({
      activationCode: activationCode.trim().toUpperCase(),
      deviceId: identity.deviceId,
      installationId: identity.installationId,
      fingerprintHash: identity.fingerprintHash,
    });
    const claims = await verifyEntitlementToken(res.entitlementToken);
    if (claims.deviceId !== identity.deviceId) {
      throw new Error('Entitlement device mismatch');
    }
    await persistClaims(res.entitlementToken, claims, res.serverTime);
  },

  async applyEntitlementToken(token: string, serverTime?: string): Promise<void> {
    const identity = await getDeviceIdentity();
    const claims = await verifyEntitlementToken(token);
    if (claims.deviceId !== identity.deviceId) {
      throw new Error('Entitlement device mismatch');
    }
    await persistClaims(token, claims, serverTime);
  },

  async applySupportUnlock(token: string): Promise<void> {
    const identity = await getDeviceIdentity();
    const claims = await verifySupportUnlockToken(token.trim());
    if (claims.deviceId !== identity.deviceId) {
      throw new Error('Unlock code is for a different device');
    }
    await persistClaims(token.trim(), claims);
  },

  async evaluate(): Promise<LicenseStatus> {
    const state = await licenseRepository.get();
    if (!state) {
      return {
        kind: 'missing',
        daysRemaining: 0,
        validUntil: null,
        amountGhs: 0,
        customerName: '',
        deviceId: '',
        bannerDays: null,
        message: 'This device is not activated.',
      };
    }

    try {
      await verifyEntitlementToken(state.entitlement_token);
    } catch {
      return {
        kind: 'invalid',
        daysRemaining: 0,
        validUntil: state.valid_until,
        amountGhs: state.amount_ghs,
        customerName: state.customer_name,
        deviceId: state.device_id,
        bannerDays: null,
        message: 'License data is invalid. Contact support.',
      };
    }

    const { trustedNowMs, tampered } = await tickLicenseClock();
    if (tampered) {
      return {
        kind: 'tampered_clock',
        daysRemaining: 0,
        validUntil: state.valid_until,
        amountGhs: state.amount_ghs,
        customerName: state.customer_name,
        deviceId: state.device_id,
        bannerDays: null,
        message: 'Device clock appears incorrect. Connect briefly to revalidate, or call support.',
      };
    }

    const validUntilMs = Date.parse(state.valid_until);
    const graceUntilMs = validUntilMs + state.grace_days * 24 * 60 * 60 * 1000;
    const daysRemaining = daysBetween(trustedNowMs, validUntilMs);

    if (trustedNowMs > graceUntilMs) {
      return {
        kind: 'expired',
        daysRemaining: Math.min(0, daysRemaining),
        validUntil: state.valid_until,
        amountGhs: state.amount_ghs,
        customerName: state.customer_name,
        deviceId: state.device_id,
        bannerDays: null,
        message: `Subscription ended. Pay GHS ${state.amount_ghs} via MoMo or call support to renew.`,
      };
    }

    if (trustedNowMs > validUntilMs) {
      return {
        kind: 'grace',
        daysRemaining: 0,
        validUntil: state.valid_until,
        amountGhs: state.amount_ghs,
        customerName: state.customer_name,
        deviceId: state.device_id,
        bannerDays: 1,
        message: 'Subscription expired — grace period active. Renew soon.',
      };
    }

    const bannerDays = bannerForDays(daysRemaining);
    if (bannerDays != null) {
      return {
        kind: 'expiring',
        daysRemaining,
        validUntil: state.valid_until,
        amountGhs: state.amount_ghs,
        customerName: state.customer_name,
        deviceId: state.device_id,
        bannerDays,
        message: `Subscription ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Pay GHS ${state.amount_ghs} via MoMo or call support.`,
      };
    }

    return {
      kind: 'active',
      daysRemaining,
      validUntil: state.valid_until,
      amountGhs: state.amount_ghs,
      customerName: state.customer_name,
      deviceId: state.device_id,
      bannerDays: null,
      message: `Licensed until ${new Date(state.valid_until).toLocaleDateString()}.`,
    };
  },

  isBlocked(status: LicenseStatus): boolean {
    return status.kind === 'missing' || status.kind === 'invalid' || status.kind === 'tampered_clock' || status.kind === 'expired';
  },

  async pullIfOnline(): Promise<LicenseStatus> {
    const state = await licenseRepository.get();
    if (!state) return this.evaluate();
    try {
      const res = await licenseApi.pullEntitlement({
        customerId: state.customer_id,
        deviceId: state.device_id,
        entitlementHash: state.entitlement_hash,
        lastKnownGoodTime: state.last_known_good_time,
      });
      await applyServerTime(res.serverTime);
      if (res.revoked) {
        await licenseRepository.clear();
        return this.evaluate();
      }
      if (res.entitlementToken) {
        await this.applyEntitlementToken(res.entitlementToken, res.serverTime);
      }
    } catch {
      // Stay offline-capable
    }
    return this.evaluate();
  },

  async attestIfOnline(): Promise<void> {
    const state = await licenseRepository.get();
    if (!state) return;
    try {
      const res = await licenseApi.attest({
        customerId: state.customer_id,
        deviceId: state.device_id,
        entitlementHash: state.entitlement_hash,
        lastKnownGoodTime: state.last_known_good_time,
        clockTamper: state.clock_tamper === 1,
      });
      await applyServerTime(res.serverTime);
      if (res.revoked) await licenseRepository.clear();
    } catch {
      // ignore offline
    }
  },
};
