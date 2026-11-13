import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { getSupportPhone } from '@/lib/env';
import { licenseService } from '@/services/licenseService';
import { text } from '@/theme';

export function ActivatePage() {
  const { hydrated, setupComplete, activated, refreshLicense } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return null;
  if (!setupComplete) return <Navigate to="/setup" replace />;
  if (activated) return <Navigate to="/login" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await licenseService.activateWithCode(code);
      await refreshLicense();
      navigate('/login', { replace: true });
      window.location.reload();
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message}. Connect to the internet, or call ${getSupportPhone()}.`
          : 'Activation failed',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header={<GlassHeader title="Activate" />}>
      <div className="hero hero-compact">
        <p style={text.title1}>Activate this device</p>
        <p style={text.callout}>
          Enter the activation code from Nuta support. Needs a brief internet connection once. After that, the business runs offline.
        </p>
      </div>
      <form className="stack" onSubmit={onSubmit}>
        <TextField
          label="Activation code"
          value={code}
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
        />
        {error ? <FeedbackBanner variant="error" message={error} /> : null}
        <Button title={loading ? 'Activating…' : 'Activate'} type="submit" disabled={loading || !code.trim()} />
      </form>
      <p style={{ ...text.caption, marginTop: 16 }}>Support: {getSupportPhone()}</p>
    </Screen>
  );
}
