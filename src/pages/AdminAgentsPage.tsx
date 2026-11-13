import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { RequireAdmin } from '@/components/RequireAuth';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { userRepository } from '@/db/userRepository';
import type { LocalUser } from '@/db/schema';
import { text } from '@/theme';

function AdminAgentsInner() {
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState('');

  const reload = async () => setUsers(await userRepository.list());

  useEffect(() => {
    void reload();
  }, []);

  const createAgent = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await userRepository.create({
        username,
        displayName: displayName || username,
        role: 'AGENT',
        pin,
      });
      setUsername('');
      setDisplayName('');
      setPin('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create agent');
    }
  };

  return (
    <Screen header={<GlassHeader title="Agents" backTo="/admin" />}>
      <form className="stack" onSubmit={createAgent}>
        <p style={text.headline}>Add sales agent</p>
        <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <TextField label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <TextField
          label="PIN"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          required
        />
        <FeedbackBanner message={error} variant="error" />
        <Button title="Create agent" type="submit" />
      </form>

      <div className="stack" style={{ marginTop: 24 }}>
        {users.map((u) => (
          <div key={u.id} className="list-row" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={text.body}>
              {u.display_name} (@{u.username}) · {u.role}
              {u.is_active !== 1 ? ' · disabled' : ''}
            </div>
            {resetId === u.id ? (
              <>
                <TextField
                  label="New PIN"
                  type="password"
                  inputMode="numeric"
                  value={resetPin}
                  onChange={(e) => setResetPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                />
                <Button
                  title="Save PIN"
                  onClick={() => {
                    void userRepository.resetPin(u.id, resetPin).then(() => {
                      setResetId(null);
                      setResetPin('');
                    });
                  }}
                />
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button title="Reset PIN" variant="secondary" onClick={() => setResetId(u.id)} />
                {u.role !== 'ADMIN' ? (
                  <Button
                    title={u.is_active === 1 ? 'Disable' : 'Enable'}
                    variant="ghost"
                    onClick={() => void userRepository.setActive(u.id, u.is_active !== 1).then(reload)}
                  />
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </Screen>
  );
}

export function AdminAgentsPage() {
  return (
    <RequireAdmin>
      <AdminAgentsInner />
    </RequireAdmin>
  );
}
