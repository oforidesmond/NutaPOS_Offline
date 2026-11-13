import { db, type LicenseStateRow } from '@/db/schema';

const LICENSE_ID = 1;

export const licenseRepository = {
  async get(): Promise<LicenseStateRow | null> {
    const primary = await db.license_state.get(LICENSE_ID);
    if (primary) return primary;
    const mirror = await db.license_state_mirror.get(LICENSE_ID);
    if (mirror) {
      await db.license_state.put(mirror);
      return mirror;
    }
    return null;
  },

  async save(row: Omit<LicenseStateRow, 'id'> & { id?: number }): Promise<LicenseStateRow> {
    const next: LicenseStateRow = { ...row, id: LICENSE_ID };
    await db.transaction('rw', db.license_state, db.license_state_mirror, async () => {
      await db.license_state.put(next);
      await db.license_state_mirror.put(next);
    });
    return next;
  },

  async clear(): Promise<void> {
    await db.transaction('rw', db.license_state, db.license_state_mirror, async () => {
      await db.license_state.delete(LICENSE_ID);
      await db.license_state_mirror.delete(LICENSE_ID);
    });
  },

  async updateWatermark(iso: string, clockTamper?: boolean): Promise<void> {
    const current = await this.get();
    if (!current) return;
    await this.save({
      ...current,
      last_known_good_time: iso,
      ...(clockTamper != null ? { clock_tamper: clockTamper ? 1 : 0 } : {}),
      updated_at: new Date().toISOString(),
    });
  },
};
