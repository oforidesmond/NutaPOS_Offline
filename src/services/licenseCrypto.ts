import { compactVerify, importSPKI, importJWK, type JWK } from 'jose';
import { getLicensePublicKey } from '@/lib/env';
import type { LicenseEntitlementClaims } from '@/services/licenseTypes';

type VerifyKey = CryptoKey | Uint8Array;

let cachedKey: VerifyKey | null = null;

async function loadPublicKey(): Promise<VerifyKey> {
  if (cachedKey) return cachedKey;
  const raw = getLicensePublicKey();
  if (!raw) {
    throw new Error('License public key is not configured (VITE_LICENSE_PUBLIC_KEY)');
  }
  if (raw.startsWith('{')) {
    cachedKey = (await importJWK(JSON.parse(raw) as JWK, 'EdDSA')) as VerifyKey;
    return cachedKey;
  }
  // Assume SPKI PEM or base64-encoded SPKI
  const pem = raw.includes('BEGIN')
    ? raw
    : `-----BEGIN PUBLIC KEY-----\n${raw}\n-----END PUBLIC KEY-----`;
  cachedKey = (await importSPKI(pem, 'EdDSA')) as VerifyKey;
  return cachedKey;
}

export async function hashEntitlementToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyEntitlementToken(token: string): Promise<LicenseEntitlementClaims> {
  const key = await loadPublicKey();
  const { payload } = await compactVerify(token, key);
  const json = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;

  const required = [
    'orgId',
    'customerId',
    'customerName',
    'deviceId',
    'validFrom',
    'validUntil',
    'periodDays',
    'amountGhs',
    'graceDays',
    'licenseVersion',
    'nonce',
  ] as const;

  for (const field of required) {
    if (json[field] == null) throw new Error(`Entitlement missing ${field}`);
  }

  return {
    orgId: String(json.orgId),
    customerId: String(json.customerId),
    customerName: String(json.customerName),
    deviceId: String(json.deviceId),
    validFrom: String(json.validFrom),
    validUntil: String(json.validUntil),
    periodDays: Number(json.periodDays),
    amountGhs: Number(json.amountGhs),
    graceDays: Number(json.graceDays),
    licenseVersion: Number(json.licenseVersion),
    nonce: String(json.nonce),
  };
}

/** Support unlock codes: HMAC-like check using public verification of a short JWT. */
export async function verifySupportUnlockToken(token: string): Promise<LicenseEntitlementClaims> {
  return verifyEntitlementToken(token);
}
