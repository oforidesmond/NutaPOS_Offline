import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { RequireAdmin } from '@/components/RequireAuth';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { settingsRepository } from '@/db/settingsRepository';
import type { OrganizationDto } from '@/types/organization';
import { text } from '@/theme';

function AdminShopInner() {
  const [shopName, setShopName] = useState('');
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState('0');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const org = await settingsRepository.getJson<OrganizationDto>(settingsRepository.keys.organization);
      setShopName(org?.name ?? '');
      const tax = await settingsRepository.getJson<{ enabled?: boolean; rate?: number }>(
        settingsRepository.keys.taxSettings,
      );
      setTaxEnabled(Boolean(tax?.enabled));
      setTaxRate(String(tax?.rate ?? 0));
    })();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const org = await settingsRepository.getJson<OrganizationDto>(settingsRepository.keys.organization);
    await settingsRepository.setJson(settingsRepository.keys.organization, {
      ...(org ?? { id: crypto.randomUUID(), planType: 'PAID', planStatus: 'ACTIVE' }),
      name: shopName.trim() || 'My Shop',
    } satisfies OrganizationDto);
    await settingsRepository.setJson(settingsRepository.keys.taxSettings, {
      enabled: taxEnabled,
      rate: Number(taxRate) || 0,
    });
    setSaved(true);
  };

  return (
    <Screen header={<GlassHeader title="Business settings" backTo="/admin" />}>
      <form className="stack" onSubmit={onSubmit}>
        <TextField label="Business name" value={shopName} onChange={(e) => setShopName(e.target.value)} />
        <label style={text.body}>
          <input type="checkbox" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} /> Tax enabled
        </label>
        <TextField label="Tax rate %" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        {saved ? <FeedbackBanner message="Saved" variant="warning" /> : null}
        <Button title="Save" type="submit" />
      </form>
    </Screen>
  );
}

export function AdminShopPage() {
  return (
    <RequireAdmin>
      <AdminShopInner />
    </RequireAdmin>
  );
}
