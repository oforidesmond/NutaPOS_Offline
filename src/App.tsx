import type { CSSProperties } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PwaUpdateBanner } from '@/components/PwaUpdateBanner';
import { RequireAdmin, RequireReady } from '@/components/RequireAuth';
import { ToastHost } from '@/components/ToastHost';
import { AuthProvider } from '@/context/AuthContext';
import { ActivatePage } from '@/pages/ActivatePage';
import { AdminAgentsPage } from '@/pages/AdminAgentsPage';
import { AdminHomePage } from '@/pages/AdminHomePage';
import { AdminLicensePage } from '@/pages/AdminLicensePage';
import { AdminProductsPage } from '@/pages/AdminProductsPage';
import { AdminReportsPage } from '@/pages/AdminReportsPage';
import { AdminShopPage } from '@/pages/AdminShopPage';
import { AdminUnlockPage } from '@/pages/AdminUnlockPage';
import { BackupsPage } from '@/pages/BackupsPage';
import { BootstrapPage } from '@/pages/BootstrapPage';
import { LoginPage } from '@/pages/LoginPage';
import { PaywallPage } from '@/pages/PaywallPage';
import { PosPage } from '@/pages/PosPage';
import { PrinterSettingsPage } from '@/pages/PrinterSettingsPage';
import { ProductSearchPage } from '@/pages/ProductSearchPage';
import { SalesHistoryPage } from '@/pages/SalesHistoryPage';
import { ScannerPage } from '@/pages/ScannerPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SetupPage } from '@/pages/SetupPage';
import { cssVars } from '@/theme';

export function App() {
  return (
    <div style={cssVars as CSSProperties}>
      <AuthProvider>
        <BrowserRouter>
          <PwaUpdateBanner />
          <Routes>
            <Route path="/" element={<BootstrapPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/activate" element={<ActivatePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/paywall" element={<PaywallPage />} />
            <Route
              path="/pos"
              element={
                <RequireReady>
                  <PosPage />
                </RequireReady>
              }
            />
            <Route
              path="/scanner"
              element={
                <RequireReady>
                  <ScannerPage />
                </RequireReady>
              }
            />
            <Route
              path="/product-search"
              element={
                <RequireReady>
                  <ProductSearchPage />
                </RequireReady>
              }
            />
            <Route
              path="/sales-history"
              element={
                <RequireReady>
                  <SalesHistoryPage />
                </RequireReady>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireReady>
                  <SettingsPage />
                </RequireReady>
              }
            />
            <Route
              path="/backups"
              element={
                <RequireReady>
                  <BackupsPage />
                </RequireReady>
              }
            />
            <Route
              path="/printer-settings"
              element={
                <RequireReady>
                  <PrinterSettingsPage />
                </RequireReady>
              }
            />
            <Route path="/admin/unlock" element={<AdminUnlockPage />} />
            <Route path="/admin" element={<AdminHomePage />} />
            <Route
              path="/admin/reports"
              element={
                <RequireAdmin>
                  <AdminReportsPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/products"
              element={
                <RequireAdmin>
                  <AdminProductsPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/agents"
              element={
                <RequireAdmin>
                  <AdminAgentsPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/shop"
              element={
                <RequireAdmin>
                  <AdminShopPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/license"
              element={
                <RequireAdmin>
                  <AdminLicensePage />
                </RequireAdmin>
              }
            />
          </Routes>
          <ToastHost />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
