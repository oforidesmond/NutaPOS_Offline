import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { bootstrapShop } from '@/services/shopSetupService';
import { text } from '@/theme';

export function SetupPage() {
  const { hydrated, setupComplete } = useAuth();
  const navigate = useNavigate();
  const [shopName, setShopName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPin, setAdminPin] = useState('');
  const [adminPin2, setAdminPin2] = useState('');
  const [agentUsername, setAgentUsername] = useState('agent');
  const [agentPin, setAgentPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return null;
  if (setupComplete) return <Navigate to="/" replace />;

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
      navigate('/activate', { replace: true });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header={<GlassHeader title="Shop setup" />}>
      <div className="hero hero-compact">
        <p style={text.title1}>Set up this device</p>
        <p style={text.callout}>Create an admin PIN and optional sales agent. Works fully offline after activation.</p>
      </div>
      <form className="stack" onSubmit={onSubmit}>
        <TextField label="Shop name" value={shopName} onChange={(e) => setShopName(e.target.value)} required />
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
        <Button title={loading ? 'Saving…' : 'Continue'} type="submit" disabled={loading} />
      </form>
    </Screen>
  );
}
