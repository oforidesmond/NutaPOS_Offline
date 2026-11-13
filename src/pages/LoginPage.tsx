import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { APP_VERSION } from '@/services/deviceFingerprint';
import { text } from '@/theme';

export function LoginPage() {
  const { hydrated, user, setupComplete, activated, login } = useAuth();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) {
    return (
      <Screen header={<GlassHeader title="Sign in" />}>
        <div className="hero">
          <p style={text.largeTitle}>NutaPOS Offline</p>
        </div>
      </Screen>
    );
  }

  if (!setupComplete) return <Navigate to="/setup" replace />;
  if (!activated) return <Navigate to="/activate" replace />;
  if (user) return <Navigate to="/pos" replace />;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !pin.trim()) {
      setError('Enter username and PIN');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), pin.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header={<GlassHeader title="Sign in" />}>
      <div className="hero hero-compact">
        <img className="hero-mark" src="/icons/icon-192.png" width={80} height={80} alt="" />
        <p style={text.title1}>NutaPOS</p>
        <p style={text.callout}>Offline sign-in</p>
      </div>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <TextField
          label="Username"
          name="username"
          placeholder="admin or agent"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          disabled={loading}
          onChange={(event) => {
            setUsername(event.target.value);
            if (error) setError(null);
          }}
        />
        <TextField
          label="PIN"
          name="pin"
          type="password"
          inputMode="numeric"
          placeholder="4–8 digits"
          autoComplete="current-password"
          value={pin}
          disabled={loading}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, '').slice(0, 8));
            if (error) setError(null);
          }}
        />
        {error ? <FeedbackBanner variant="error" message={error} /> : null}
        <Button title={loading ? 'Signing in…' : 'Sign in'} type="submit" disabled={loading} />
      </form>
      <p style={{ ...text.caption, marginTop: 24, textAlign: 'center', opacity: 0.7 }}>v{APP_VERSION} · offline edition</p>
    </Screen>
  );
}
