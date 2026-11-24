import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { databaseBackupService } from '@/services/databaseBackupService';
import { bootstrapShop } from '@/services/shopSetupService';
import { text } from '@/theme';

export function SetupPage() {
  const { hydrated, setupComplete } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [shopName, setShopName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPin, setAdminPin] = useState('');
  const [adminPin2, setAdminPin2] = useState('');
  const [agentUsername, setAgentUsername] = useState('agent');
  const [agentPin, setAgentPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return null;
  if (setupComplete) return <Navigate to="/" replace />;

  const goActivate = () => {
    navigate('/activate', { replace: true });
    window.location.reload();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (adminPin !== adminPin2) {
      setError('Admin PINs do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await bootstrapShop({
        shopName,
        adminUsername,
        adminDisplayName: 'Shop Admin',
        adminPin,
        agentUsername: agentUsername || undefined,
        agentDisplayName: 'Sales Agent',
        agentPin: agentPin || undefined,
      });
      goActivate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  const onRestoreFile = async (file: File | null) => {
    if (!file) return;
    setRestoring(true);
    setError(null);
    try {
      await databaseBackupService.restoreFromFileContents(await file.text());
      goActivate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
      setRestoring(false);
    }
  };

  const busy = loading || restoring;

  return (
    <Screen header={<GlassHeader title="Business setup" />}>
      <div className="hero hero-compact">
        <p style={text.title1}>Set up this device</p>
        <p style={text.callout}>Create an admin PIN and optional sales agent. Works fully offline after activation.</p>
      </div>

      <div className="stack" style={{ marginBottom: 16 }}>
        <p style={text.headline}>Already have this shop elsewhere?</p>
        <p className="hint">
          Restore a backup JSON file to bring over products, sales, and users. You will still need an activation code
          for this device.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Backup file"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = '';
            void onRestoreFile(file);
          }}
        />
        <Button
          title={restoring ? 'Restoring…' : 'Restore from backup file'}
          variant="secondary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        />
      </div>

      <form className="stack" onSubmit={onSubmit}>
        <TextField label="Business name" value={shopName} onChange={(e) => setShopName(e.target.value)} required />
        <TextField label="Admin username" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} required />
        <TextField
          label="Admin PIN"
          type="password"
          inputMode="numeric"
          value={adminPin}
          onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          required
        />
        <TextField
          label="Confirm admin PIN"
          type="password"
          inputMode="numeric"
          value={adminPin2}
          onChange={(e) => setAdminPin2(e.target.value.replace(/\D/g, '').slice(0, 8))}
          required
        />
        <TextField label="Agent username (optional)" value={agentUsername} onChange={(e) => setAgentUsername(e.target.value)} />
        <TextField
          label="Agent PIN (optional)"
          type="password"
          inputMode="numeric"
          value={agentPin}
          onChange={(e) => setAgentPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
        />
        {error ? <FeedbackBanner variant="error" message={error} /> : null}
        <Button title={loading ? 'Saving…' : 'Continue'} type="submit" disabled={busy} />
      </form>
    </Screen>
  );
}
