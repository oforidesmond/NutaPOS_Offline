import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { licenseApi } from '@/api/licenseApi';
import { getSupportPhone } from '@/lib/env';
import { licenseRepository } from '@/db/licenseRepository';
import { licenseService } from '@/services/licenseService';
import { text } from '@/theme';

function needsPaystackOtp(status: string | undefined, flag?: boolean): boolean {
  if (flag) return true;
  return (status ?? '').toLowerCase() === 'send_otp';
}

export function PaywallPage() {
  const { hydrated, licenseStatus, refreshLicense, activated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const renewIntent = searchParams.get('renew') === '1';
  const [phone, setPhone] = useState('');
  const [provider, setProvider] = useState<'mtn' | 'atl' | 'vod'>('mtn');
  const [unlockCode, setUnlockCode] = useState('');
  const [otp, setOtp] = useState('');
  const [payReference, setPayReference] = useState<string | null>(null);
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const blocked = Boolean(licenseStatus && licenseService.isBlocked(licenseStatus));

  useEffect(() => {
    void refreshLicense();
  }, [refreshLicense]);

  if (!hydrated) return null;
  if (!activated) return <Navigate to="/activate" replace />;
  // Valid license used to bounce /paywall → /pos immediately, which made Pay / renew look broken.
  // Allow an explicit renew visit; still leave the forced paywall once unlocked.
  if (licenseStatus && !blocked && !renewIntent) {
    return <Navigate to="/pos" replace />;
  }

  const amount = licenseStatus?.amountGhs ?? 600;

  const finishIfPaid = async (status: Awaited<ReturnType<typeof licenseApi.paymentStatus>>) => {
    if (status.status === 'success' && status.entitlementToken) {
      await licenseService.applyEntitlementToken(status.entitlementToken, status.serverTime);
      await refreshLicense();
      setMessage('Payment confirmed. Unlocking…');
      setAwaitingOtp(false);
      setPayReference(null);
      setOtp('');
      navigate(renewIntent ? '/admin/license' : '/pos', { replace: true });
      return true;
    }
    if (status.status === 'failed') {
      throw new Error(status.displayText || 'Payment failed');
    }
    return false;
  };

  const pollUntilSettled = async (reference: string) => {
    const started = Date.now();
    while (Date.now() - started < 180_000) {
      await new Promise((r) => setTimeout(r, 3000));
      const status = await licenseApi.paymentStatus(reference);
      if (needsPaystackOtp(undefined, status.needsOtp)) {
        setAwaitingOtp(true);
        setPayReference(reference);
        setMessage(status.displayText || 'Enter the OTP sent to your phone to confirm this number');
        setBusy(false);
        return;
      }
      if (await finishIfPaid(status)) return;
      if (status.displayText) setMessage(status.displayText);
    }
    throw new Error('Timed out waiting for MoMo approval. Try again or call support.');
  };

  const pay = async (event: FormEvent) => {
    event.preventDefault();
    if (!online) {
      setError(`Connect briefly to the internet to pay, or call ${getSupportPhone()}.`);
      return;
    }
    const state = await licenseRepository.get();
    if (!state) {
      setError('No license on device');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    setAwaitingOtp(false);
    setOtp('');
    try {
      const init = await licenseApi.initiatePayment({
        customerId: state.customer_id,
        deviceId: state.device_id,
        phone: phone.trim(),
        provider,
      });
      setPayReference(init.reference);
      setMessage(init.displayText || 'Approve the MoMo prompt on your phone…');

      if (needsPaystackOtp(init.status, init.needsOtp)) {
        setAwaitingOtp(true);
        setBusy(false);
        return;
      }

      await pollUntilSettled(init.reference);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed');
      setAwaitingOtp(false);
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (event: FormEvent) => {
    event.preventDefault();
    if (!payReference) {
      setError('Start payment again to receive a new OTP.');
      return;
    }
    if (!otp.trim()) {
      setError('Enter the OTP from your phone');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await licenseApi.submitPaymentOtp(payReference, otp.trim());
      setMessage(result.displayText || 'OTP accepted. Approve the MoMo prompt on your phone…');
      if (needsPaystackOtp(result.status, result.needsOtp)) {
        setAwaitingOtp(true);
        setOtp('');
        setError('That OTP was not accepted, or another code was sent. Try again.');
        return;
      }
      setAwaitingOtp(false);
      setOtp('');
      await pollUntilSettled(result.reference || payReference);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit OTP');
      setAwaitingOtp(true);
    } finally {
      setBusy(false);
    }
  };

  const applyUnlock = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await licenseService.applySupportUnlock(unlockCode);
      await refreshLicense();
      navigate(renewIntent ? '/admin/license' : '/pos', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid unlock code');
    } finally {
      setBusy(false);
    }
  };

  const pullRelease = async () => {
    setBusy(true);
    setError(null);
    try {
      await licenseService.pullIfOnline();
      const status = await refreshLicense();
      if (!licenseService.isBlocked(status)) {
        navigate(renewIntent ? '/admin/license' : '/pos', { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh license');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<GlassHeader title="Subscription" backTo={renewIntent ? '/admin/license' : undefined} />}>
      <div className="hero hero-compact">
        <p style={text.title1}>{blocked ? 'Renew to continue' : 'Pay / renew'}</p>
        <p style={text.callout}>
          {licenseStatus?.message ||
            'Connect briefly to the internet to pay, or call support to renew. The app unlocks after payment is confirmed.'}
        </p>
      </div>

      <div className="stack">
        <FeedbackBanner variant="warning" message={`Amount due: GHS ${amount}`} />
        {!online ? (
          <FeedbackBanner
            variant="error"
            message={`You are offline. Call ${getSupportPhone()} to renew, or connect briefly to pay with MoMo.`}
          />
        ) : null}

        {message ? <FeedbackBanner variant="warning" message={message} /> : null}
        {error ? <FeedbackBanner variant="error" message={error} /> : null}

        {awaitingOtp ? (
          <form className="stack" onSubmit={submitOtp}>
            <p style={text.callout}>
              Paystack sent a one-time code to confirm this MoMo number. Enter it below, then approve the payment prompt
              on your phone.
            </p>
            <TextField
              label="OTP from Paystack / MoMo"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              disabled={!online || busy}
              required
            />
            <Button title={busy ? 'Submitting…' : 'Submit OTP'} type="submit" disabled={!online || busy || !otp.trim()} />
            <Button
              title="Cancel and start over"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setAwaitingOtp(false);
                setPayReference(null);
                setOtp('');
                setMessage(null);
                setError(null);
              }}
            />
          </form>
        ) : (
          <form className="stack" onSubmit={pay}>
            <TextField
              label="MoMo number"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!online || busy}
            />
            <label style={text.caption}>
              Provider
              <select
                value={provider}
                disabled={!online || busy}
                onChange={(e) => setProvider(e.target.value as 'mtn' | 'atl' | 'vod')}
                style={{ display: 'block', width: '100%', marginTop: 6, padding: 10 }}
              >
                <option value="mtn">MTN</option>
                <option value="atl">ATMoney / AirtelTigo</option>
                <option value="vod">Telecel</option>
              </select>
            </label>
            <Button title={busy ? 'Working…' : `Pay GHS ${amount} with MoMo`} type="submit" disabled={!online || busy} />
          </form>
        )}

        <Button title="I already paid — refresh unlock" variant="secondary" onClick={() => void pullRelease()} disabled={!online || busy} />

        <p style={text.callout}>Or call support: {getSupportPhone()}</p>

        <form className="stack" onSubmit={applyUnlock}>
          <TextField
            label="Support unlock code"
            value={unlockCode}
            onChange={(e) => setUnlockCode(e.target.value)}
            disabled={busy}
          />
          <Button title="Apply unlock code" variant="secondary" type="submit" disabled={busy || !unlockCode.trim()} />
        </form>

        <Button title="Export backup" variant="ghost" to="/backups" />
      </div>
    </Screen>
  );
}
