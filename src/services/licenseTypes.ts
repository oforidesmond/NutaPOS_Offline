export type LicenseEntitlementClaims = {
  orgId: string;
  customerId: string;
  customerName: string;
  deviceId: string;
  validFrom: string;
  validUntil: string;
  periodDays: number;
  amountGhs: number;
  graceDays: number;
  licenseVersion: number;
  nonce: string;
};

export type LicenseStatusKind =
  | 'missing'
  | 'invalid'
  | 'tampered_clock'
  | 'active'
  | 'expiring'
  | 'grace'
  | 'expired';

export type LicenseStatus = {
  kind: LicenseStatusKind;
  daysRemaining: number;
  validUntil: string | null;
  amountGhs: number;
  customerName: string;
  deviceId: string;
  bannerDays: number | null;
  message: string;
};

export const REMINDER_THRESHOLDS = [30, 14, 7, 3, 1] as const;
