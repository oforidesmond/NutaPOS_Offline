import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { text } from '@/theme';

export function LicenseBanner() {
  const { licenseStatus } = useAuth();
  if (!licenseStatus) return null;
  if (licenseStatus.kind !== 'expiring' && licenseStatus.kind !== 'grace') return null;

  return (
    <div className="banner-warning" role="status" style={{ ...text.footnote, padding: '10px 14px' }}>
      <span>{licenseStatus.message} </span>
      <Link to="/paywall">Pay now</Link>
    </div>
  );
}
