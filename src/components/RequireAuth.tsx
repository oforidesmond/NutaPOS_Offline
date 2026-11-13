import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { licenseService } from '@/services/licenseService';
import { SplashMark } from '@/pages/SplashMark';

export function RequireProfile({ children }: { children: ReactNode }) {
  const { hydrated, user } = useAuth();
  if (!hydrated) return <SplashMark />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function RequireReady({ children }: { children: ReactNode }) {
  const { hydrated, user, setupComplete, activated, licenseStatus } = useAuth();
  if (!hydrated) return <SplashMark />;
  if (!setupComplete) return <Navigate to="/setup" replace />;
  if (!activated) return <Navigate to="/activate" replace />;
  if (!user) return <Navigate to="/login" replace />;
  if (licenseStatus && licenseService.isBlocked(licenseStatus)) {
    return <Navigate to="/paywall" replace />;
  }
  return children;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { hydrated, user, adminUnlocked } = useAuth();
  if (!hydrated) return <SplashMark />;
  if (!user) return <Navigate to="/login" replace />;
  // Even the admin user must unlock (or re-unlock after "Lock admin").
  if (adminUnlocked) return children;
  return <Navigate to="/admin/unlock" replace />;
}
