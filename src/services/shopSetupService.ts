import { userRepository } from '@/db/userRepository';
import { settingsRepository } from '@/db/settingsRepository';
import { trialRepository } from '@/db/trialRepository';
import type { OrganizationDto } from '@/types/organization';

export async function bootstrapShop(input: {
  shopName: string;
  adminUsername: string;
  adminDisplayName: string;
  adminPin: string;
  agentUsername?: string;
  agentDisplayName?: string;
  agentPin?: string;
  taxEnabled?: boolean;
  taxRate?: number;
}): Promise<void> {
  const existingAdmins = await userRepository.countAdmins();
  if (existingAdmins > 0) {
    throw new Error('Shop already set up on this device');
  }

  await userRepository.create({
    username: input.adminUsername,
    displayName: input.adminDisplayName,
    role: 'ADMIN',
    pin: input.adminPin,
  });

  if (input.agentUsername && input.agentPin) {
    await userRepository.create({
      username: input.agentUsername,
      displayName: input.agentDisplayName || input.agentUsername,
      role: 'AGENT',
      pin: input.agentPin,
    });
  }

  const orgId = crypto.randomUUID();
  await settingsRepository.setJson(settingsRepository.keys.organization, {
    id: orgId,
    name: input.shopName.trim() || 'My Shop',
    planType: 'PAID',
    planStatus: 'ACTIVE',
  } satisfies OrganizationDto);

  await settingsRepository.setJson(settingsRepository.keys.taxSettings, {
    enabled: Boolean(input.taxEnabled),
    rate: Number(input.taxRate) || 0,
  });

  await settingsRepository.setJson(settingsRepository.keys.categories, []);

  // Unlimited local sales — license gate is calendar-based.
  await trialRepository.ensureRow('offline', 999999999);
}
