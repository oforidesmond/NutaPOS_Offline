import type { AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import { licenseRepository } from '@/db/licenseRepository';
import { buildApiPath, getApiV1BaseURL } from '@/lib/env';
import { getDeviceIdentity } from '@/services/deviceIdentity';
import { APP_VERSION } from '@/services/deviceFingerprint';

export type OfflineLicenseBackupMeta = {
  device_id: string;
  app_version: string;
  build_number?: string;
};

export function buildOfflineLicenseBackupForm(
  file: Blob,
  fileName: string,
  meta: OfflineLicenseBackupMeta,
  createdAt: string,
): FormData {
  const form = new FormData();
  form.append('device_id', meta.device_id);
  form.append('app_version', meta.app_version);
  if (meta.build_number) form.append('build_number', meta.build_number);
  form.append('created_at', createdAt);
  form.append('backup', file, fileName);
  return form;
}

function dropJsonContentType(data: unknown, headers: InternalAxiosRequestConfig['headers']): unknown {
  (headers as AxiosHeaders).delete('Content-Type');
  return data;
}

/**
 * Best-effort multipart upload authenticated with the offline entitlement token.
 * Skips when there is no entitlement or API base URL.
 */
export async function postOfflineLicenseBackup(
  file: Blob,
  fileName: string,
  meta?: Partial<OfflineLicenseBackupMeta>,
): Promise<void> {
  const apiRoot = getApiV1BaseURL();
  if (!apiRoot) return;

  const state = await licenseRepository.get();
  const entitlement = state?.entitlement_token?.trim();
  if (!entitlement) return;

  const identity = await getDeviceIdentity().catch(() => null);
  const deviceId = meta?.device_id || identity?.deviceId || state.device_id;
  if (!deviceId) return;

  const form = buildOfflineLicenseBackupForm(
    file,
    fileName,
    {
      device_id: deviceId,
      app_version: meta?.app_version || APP_VERSION,
      build_number: meta?.build_number || 'pwa',
    },
    new Date().toISOString(),
  );

  await axios.post(`${apiRoot.replace(/\/+$/, '')}${buildApiPath('/offline-license/backup')}`, form, {
    timeout: 60_000,
    headers: { Authorization: `Bearer ${entitlement}` },
    transformRequest: [dropJsonContentType],
  });
}
