import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { text } from '@/theme';

export function AdminUnlockPage() {
  const { hydrated, user, adminUnlocked, localUser, unlockAdmin } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!hydrated) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (localUser?.role === 'ADMIN' || adminUnlocked) return <Navigate to="/admin" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await unlockAdmin(pin);
      navigate('/admin', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unlock failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header={<GlassHeader title="Admin unlock" backTo="/pos" />}>
      <div className="hero hero-compact">
        <p style={text.title1}>Admin area</p>
        <p style={text.callout}>Enter the shop admin PIN to manage products, stock, and agents.</p>
      </div>
      <form className="stack" onSubmit={onSubmit}>
        <TextField
          label="Admin PIN"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
        />
        {error ? <FeedbackBanner variant="error" message={error} /> : null}
        <Button title={loading ? 'Checking…' : 'Unlock'} type="submit" disabled={loading} />
        <Button title="Back to POS" variant="ghost" to="/pos" />
      </form>
    </Screen>
  );
}
