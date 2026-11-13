import axios from 'axios';
import { getApiV1BaseURL, buildApiPath } from '@/lib/env';

function client() {
  const baseURL = getApiV1BaseURL();
  if (!baseURL) throw new Error('API URL is not configured');
  return axios.create({ baseURL, timeout: 60_000 });
}

export type ActivateLicenseResponse = {
  entitlementToken: string;
  customerName: string;
  amountGhs: number;
  periodDays: number;
  validUntil: string;
  orgId: string;
  serverTime: string;
};

export type PayInitiateResponse = {
  reference: string;
  displayText: string;
  status: string;
  amountGhs: number;
  /** Paystack sometimes requires an OTP before the MoMo phone prompt. */
  needsOtp?: boolean;
};

export type PayOtpResponse = {
  reference: string;
  status: string;
  displayText: string;
  needsOtp?: boolean;
};

export type PayStatusResponse = {
  status: 'pending' | 'success' | 'failed';
  entitlementToken?: string;
  displayText?: string;
  serverTime?: string;
  needsOtp?: boolean;
};

export type LicensePullResponse = {
  entitlementToken: string | null;
  serverTime: string;
  revoked?: boolean;
};

export const licenseApi = {
  async activate(input: {
    activationCode: string;
    deviceId: string;
    installationId: string;
    fingerprintHash: string;
  }): Promise<ActivateLicenseResponse> {
    const { data } = await client().post(buildApiPath('/offline-license/activate'), input);
    return data as ActivateLicenseResponse;
  },

  async initiatePayment(input: {
    customerId: string;
    deviceId: string;
    phone: string;
    provider: 'mtn' | 'atl' | 'vod';
    email?: string;
  }): Promise<PayInitiateResponse> {
    const { data } = await client().post(buildApiPath('/offline-license/pay/initiate'), input);
    return data as PayInitiateResponse;
  },

  async paymentStatus(reference: string): Promise<PayStatusResponse> {
    const { data } = await client().get(buildApiPath(`/offline-license/pay/${encodeURIComponent(reference)}`));
    return data as PayStatusResponse;
  },

  async submitPaymentOtp(reference: string, otp: string): Promise<PayOtpResponse> {
    const { data } = await client().post(
      buildApiPath(`/offline-license/pay/${encodeURIComponent(reference)}/otp`),
      { otp },
    );
    return data as PayOtpResponse;
  },

  async pullEntitlement(input: {
    customerId: string;
    deviceId: string;
    entitlementHash?: string;
    lastKnownGoodTime?: string;
  }): Promise<LicensePullResponse> {
    const { data } = await client().post(buildApiPath('/offline-license/pull'), input);
    return data as LicensePullResponse;
  },

  async attest(input: {
    customerId: string;
    deviceId: string;
    entitlementHash: string;
    lastKnownGoodTime: string;
    clockTamper: boolean;
  }): Promise<{ ok: boolean; revoked?: boolean; serverTime: string }> {
    const { data } = await client().post(buildApiPath('/offline-license/attest'), input);
    return data as { ok: boolean; revoked?: boolean; serverTime: string };
  },
};
