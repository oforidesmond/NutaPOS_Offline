import {
  buildDeviceFingerprint,
  getOrCreateInstallationId,
  hashFingerprintCanonical,
} from '@/services/deviceFingerprint';

export async function getDeviceIdentity(): Promise<{
  installationId: string;
  fingerprintHash: string;
  deviceId: string;
}> {
  const installationId = await getOrCreateInstallationId();
  const fingerprint = await buildDeviceFingerprint();
  const fingerprintHash = await hashFingerprintCanonical(fingerprint);
  const deviceId = `${installationId}:${fingerprintHash.slice(0, 16)}`;
  return { installationId, fingerprintHash, deviceId };
}
