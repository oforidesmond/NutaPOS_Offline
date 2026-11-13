import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { clearStoredTokens, getStoredAccessToken } from '@/api/client';
import { userRepository } from '@/db/userRepository';
import type { LocalRole, LocalUser } from '@/db/schema';
import { settingsRepository } from '@/db/settingsRepository';
import { clearDeviceBindingFlag } from '@/services/deviceBindingService';
import { licenseService } from '@/services/licenseService';
import {
  clearUserProfile,
  loadUserProfile,
  saveUserProfile,
  subscribeUserProfile,
  type UserProfile,
} from '@/services/userProfileStore';
import { useNotificationStore } from '@/stores/notificationStore';
import type { OrganizationDto } from '@/types/organization';
import type { InitialSyncProgress } from '@/services/initialDataSync';
import type { LicenseStatus } from '@/services/licenseTypes';

export type { UserProfile };

type AuthContextValue = {
  hydrated: boolean;
  user: UserProfile | null;
  localUser: LocalUser | null;
  adminUnlocked: boolean;
  licenseStatus: LicenseStatus | null;
  setupComplete: boolean;
  activated: boolean;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  unlockAdmin: (pin: string) => Promise<void>;
  lockAdmin: () => void;
  refreshLicense: () => Promise<LicenseStatus>;
  /** Kept for PosPage compatibility — always no-ops / already done in offline edition. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  bindingComplete: boolean;
  initialSyncComplete: boolean;
  runBindAndInitialSync: (onProgress: (p: InitialSyncProgress) => void) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ADMIN_IDLE_MS = 5 * 60 * 1000;

function toProfile(user: LocalUser, orgId: string | null): UserProfile {
  return {
    userId: user.id,
    staffId: user.username,
    branchId: 'local',
    organizationId: orgId,
    needsPasswordChange: false,
  };
}

/**
 * Offline edition: clears local session secrets. Catalog/sales stay on device.
 * Kept compatible with staff-pwa logout tests where possible.
 */
export async function logoutSession(): Promise<void> {
  useNotificationStore.getState().reset();
  await clearStoredTokens();
  await clearUserProfile();
  await clearDeviceBindingFlag();
  await settingsRepository.setInitialSyncDone(false);
}

/** Staff-pwa compatibility helper — offline edition has no cloud bind flags to roll back after token loss. */
export async function rollbackSetupIfSignedOut(): Promise<boolean> {
  if (await getStoredAccessToken()) return false;
  await clearDeviceBindingFlag();
  // Do not clear initial_sync_done in offline edition — it marks local shop readiness.
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [localUser, setLocalUser] = useState<LocalUser | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const [activated, setActivated] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshLicense = useCallback(async () => {
    const status = await licenseService.evaluate();
    setLicenseStatus(status);
    return status;
  }, []);

  const lockAdmin = useCallback(() => {
    setAdminUnlocked(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  const bumpAdminIdle = useCallback(() => {
    if (!adminUnlocked) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setAdminUnlocked(false), ADMIN_IDLE_MS);
  }, [adminUnlocked]);

  useEffect(() => {
    if (!adminUnlocked) return;
    const onActivity = () => bumpAdminIdle();
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    bumpAdminIdle();
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [adminUnlocked, bumpAdminIdle]);

  useEffect(() => subscribeUserProfile(setUser), []);

  useEffect(() => {
    void (async () => {
      const hasAdmin = await licenseService.hasSetupUsers();
      const isActivated = await licenseService.isActivated();
      setSetupComplete(hasAdmin);
      setActivated(isActivated);
      await settingsRepository.setInitialSyncDone(hasAdmin && isActivated);

      const profile = await loadUserProfile();
      if (profile) {
        const local = await userRepository.getById(profile.userId);
        if (local && local.is_active === 1) {
          setLocalUser(local);
          setUser(profile);
        } else {
          await clearUserProfile();
        }
      }

      if (isActivated) {
        const status = await licenseService.evaluate();
        setLicenseStatus(status);
        void licenseService.attestIfOnline().then(() => refreshLicense());
      }

      setHydrated(true);
    })();
  }, [refreshLicense]);

  const login = useCallback(async (username: string, pin: string) => {
    const local = await userRepository.authenticate(username, pin);
    const org = await settingsRepository.getJson<OrganizationDto>(settingsRepository.keys.organization);
    const profile = toProfile(local, org?.id ?? null);
    await saveUserProfile(profile);
    setLocalUser(local);
    setUser(profile);
    setAdminUnlocked(local.role === 'ADMIN');
    await refreshLicense();
  }, [refreshLicense]);

  const logout = useCallback(async () => {
    lockAdmin();
    setLocalUser(null);
    await logoutSession();
  }, [lockAdmin]);

  const unlockAdmin = useCallback(async (pin: string) => {
    const admins = (await userRepository.list()).filter((u) => u.role === 'ADMIN' && u.is_active === 1);
    for (const admin of admins) {
      try {
        await userRepository.authenticate(admin.username, pin);
        setAdminUnlocked(true);
        return;
      } catch {
        // try next
      }
    }
    throw new Error('Invalid admin PIN');
  }, []);

  const changePassword = useCallback(async () => {
    throw new Error('Use Admin → Agents to reset PINs');
  }, []);

  const runBindAndInitialSync = useCallback(async (_onProgress: (p: InitialSyncProgress) => void) => {
    // Offline edition: no cloud bind/sync on launch.
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      hydrated,
      user,
      localUser,
      adminUnlocked,
      licenseStatus,
      setupComplete,
      activated,
      login,
      logout,
      unlockAdmin,
      lockAdmin,
      refreshLicense,
      changePassword,
      bindingComplete: activated && setupComplete,
      initialSyncComplete: activated && setupComplete,
      runBindAndInitialSync,
    }),
    [
      hydrated,
      user,
      localUser,
      adminUnlocked,
      licenseStatus,
      setupComplete,
      activated,
      login,
      logout,
      unlockAdmin,
      lockAdmin,
      refreshLicense,
      changePassword,
      runBindAndInitialSync,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}

export function useIsAdminSession(): boolean {
  const { localUser, adminUnlocked } = useAuth();
  return Boolean(localUser && (localUser.role === 'ADMIN' || adminUnlocked));
}

export type { LocalRole };
