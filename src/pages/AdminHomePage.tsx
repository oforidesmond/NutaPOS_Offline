import { Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { RequireAdmin } from '@/components/RequireAuth';
import { useAuth } from '@/context/AuthContext';
import { text } from '@/theme';

function AdminHomeInner() {
  const { lockAdmin, licenseStatus } = useAuth();

  return (
    <Screen header={<GlassHeader title="Admin" backTo="/pos" />}>
      <div className="stack">
        <p style={text.callout}>
          {licenseStatus?.message || 'Manage this shop on-device. Changes apply immediately offline.'}
        </p>
        <Link className="list-row" to="/admin/products" style={text.body}>
          Products & stock
        </Link>
        <Link className="list-row" to="/admin/agents" style={text.body}>
          Agents & PINs
        </Link>
        <Link className="list-row" to="/admin/shop" style={text.body}>
          Shop & tax settings
        </Link>
        <Link className="list-row" to="/admin/license" style={text.body}>
          License & subscription
        </Link>
        <Link className="list-row" to="/backups" style={text.body}>
          Backups
        </Link>
        <Link className="list-row" to="/sales-history" style={text.body}>
          All sales
        </Link>
        <Button
          title="Lock admin"
          variant="secondary"
          onClick={() => {
            lockAdmin();
          }}
        />
      </div>
    </Screen>
  );
}

export function AdminHomePage() {
  return (
    <RequireAdmin>
      <AdminHomeInner />
    </RequireAdmin>
  );
}
