import { compactVerify, importSPKI, importJWK, type JWK } from 'jose';
import { getLicensePublicKey } from '@/lib/env';
import type { LicenseEntitlementClaims } from '@/services/licenseTypes';

type VerifyKey = CryptoKey | Uint8Array;

let cachedKey: VerifyKey | null = null;

/**
 * Peel generate-script / .env encoding until we have PEM or a JWK object string.
 * Broken forms that caused "Expected property name... position 1":
 *   "{\"crv\":...}"   and   {\"crv\":\"Ed25519\",...}
 */
function normalizePemOrJwk(raw: string): string {
  let value = raw.trim();
  for (let i = 0; i < 4; i++) {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value.includes('\\"') || value.includes('\\n')) {
      value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    value = value.trim();
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === 'string') {
        value = parsed.trim();
        continue;
      }
      if (parsed && typeof parsed === 'object') {
        return JSON.stringify(parsed);
      }
    } catch {
      /* not JSON yet */
    }
    break;
  }
  return value.trim();
}

function jwkAlg(jwk: JWK): string {
  if (jwk.crv === 'Ed25519' || jwk.kty === 'OKP') return 'EdDSA';
  if (jwk.crv === 'P-256' || jwk.alg === 'ES256') return 'ES256';
  return 'EdDSA';
}

async function loadPublicKey(): Promise<VerifyKey> {
  if (cachedKey) return cachedKey;
  const raw = getLicensePublicKey();
  if (!raw) {
    throw new Error('License public key is not configured (VITE_LICENSE_PUBLIC_KEY)');
  }
  const normalized = normalizePemOrJwk(raw);
  try {
    if (normalized.startsWith('{')) {
      const jwk = JSON.parse(normalized) as JWK;
      cachedKey = (await importJWK(jwk, jwkAlg(jwk))) as VerifyKey;
      return cachedKey;
    }
    const pem = normalized.includes('BEGIN')
      ? normalized
      : `-----BEGIN PUBLIC KEY-----\n${normalized}\n-----END PUBLIC KEY-----`;
    cachedKey = (await importSPKI(pem, 'EdDSA')) as VerifyKey;
    return cachedKey;
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'unknown error';
    throw new Error(`License public key is invalid (${detail})`);
  }
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
