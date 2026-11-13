import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { RequireAdmin } from '@/components/RequireAuth';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { getSupportPhone } from '@/lib/env';
import { getDeviceIdentity } from '@/services/deviceIdentity';
import { licenseService } from '@/services/licenseService';
import { text } from '@/theme';

function AdminLicenseInner() {
  const { licenseStatus, refreshLicense } = useAuth();
  const [deviceId, setDeviceId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void getDeviceIdentity().then((id) => setDeviceId(id.deviceId));
    void refreshLicense();
  }, [refreshLicense]);

  return (
    <Screen header={<GlassHeader title="License" backTo="/admin" />}>
      <div className="stack">
        <p style={text.body}>{licenseStatus?.message}</p>
        <p style={text.caption}>Customer: {licenseStatus?.customerName || '—'}</p>
        <p style={text.caption}>Valid until: {licenseStatus?.validUntil ? new Date(licenseStatus.validUntil).toLocaleString() : '—'}</p>
        <p style={text.caption}>Amount: GHS {licenseStatus?.amountGhs ?? '—'}</p>
        <p style={text.caption}>Device ID: {deviceId}</p>
        <p style={text.caption}>Support: {getSupportPhone()}</p>
        <FeedbackBanner message={msg} variant="warning" />
        <Button
          title="Refresh from server"
          onClick={() => {
            void licenseService.pullIfOnline().then(async () => {
              await refreshLicense();
              setMsg('Checked with server (or stayed offline).');
            });
          }}
        />
        <Button title="Pay / renew" variant="secondary" to="/paywall" />
      </div>
    </Screen>
  );
}

export function AdminLicensePage() {
  return (
    <RequireAdmin>
      <AdminLicenseInner />
    </RequireAdmin>
  );
}
