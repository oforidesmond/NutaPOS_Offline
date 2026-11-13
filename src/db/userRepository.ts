import { db, type LocalRole, type LocalUser } from '@/db/schema';
import { hashPin, randomSalt, verifyPin } from '@/lib/pinHash';

export const userRepository = {
  async list(): Promise<LocalUser[]> {
    return db.users.orderBy('username').toArray();
  },

  async getById(id: string): Promise<LocalUser | undefined> {
    return db.users.get(id);
  },

  async getByUsername(username: string): Promise<LocalUser | undefined> {
    return db.users.where('username').equals(username.trim().toLowerCase()).first();
  },

  async countAdmins(): Promise<number> {
    return db.users.where('role').equals('ADMIN').count();
  },

  async create(input: {
    username: string;
    displayName: string;
    role: LocalRole;
    pin: string;
  }): Promise<LocalUser> {
    const username = input.username.trim().toLowerCase();
    if (!username) throw new Error('Username is required');
    if (!/^\d{4,8}$/.test(input.pin)) throw new Error('PIN must be 4–8 digits');
    const existing = await this.getByUsername(username);
    if (existing) throw new Error('Username already exists');

    const salt = randomSalt();
    const pin_hash = await hashPin(input.pin, salt);
    const now = new Date().toISOString();
    const row: LocalUser = {
      id: crypto.randomUUID(),
      username,
      display_name: input.displayName.trim() || username,
      role: input.role,
      pin_hash,
      pin_salt: salt,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };
    await db.users.put(row);
    return row;
  },

  async resetPin(userId: string, pin: string): Promise<void> {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4–8 digits');
    const user = await this.getById(userId);
    if (!user) throw new Error('User not found');
    const salt = randomSalt();
    const pin_hash = await hashPin(pin, salt);
    await db.users.update(userId, {
      pin_hash,
      pin_salt: salt,
      updated_at: new Date().toISOString(),
    });
  },

  async setActive(userId: string, active: boolean): Promise<void> {
    await db.users.update(userId, {
      is_active: active ? 1 : 0,
      updated_at: new Date().toISOString(),
    });
  },

  async authenticate(username: string, pin: string): Promise<LocalUser> {
    const user = await this.getByUsername(username);
    if (!user || user.is_active !== 1) throw new Error('Invalid username or PIN');
    const ok = await verifyPin(pin, user.pin_salt, user.pin_hash);
    if (!ok) throw new Error('Invalid username or PIN');
    return user;
  },
};
