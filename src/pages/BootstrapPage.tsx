import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { licenseService } from '@/services/licenseService';
import { SplashMark } from '@/pages/SplashMark';

export function BootstrapPage() {
  const { hydrated, setupComplete, activated, user, licenseStatus, refreshLicense } = useAuth();

  useEffect(() => {
    if (activated) void refreshLicense();
  }, [activated, refreshLicense]);

  if (!hydrated) return <SplashMark />;
  if (!setupComplete) return <Navigate to="/setup" replace />;
  if (!activated) return <Navigate to="/activate" replace />;
  if (licenseStatus && licenseService.isBlocked(licenseStatus)) {
    return <Navigate to="/paywall" replace />;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/pos" replace />;
}
