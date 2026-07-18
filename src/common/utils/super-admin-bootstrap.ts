import * as bcrypt from 'bcryptjs';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { UserRoleEnum, UserStatusEnum } from '../constants';

const SUPER_ADMIN_SEEDS = [
  {
    email: 'amean@hesaplar.com',
    password: 'Amean1415',
    name: 'Amean',
  },
  {
    email: 'bayk@superadmin.org',
    password: 'bayk2026!',
    name: 'bayk',
  },
] as const;

type LogLike = Pick<Logger, 'log' | 'warn'> | Pick<Console, 'log' | 'warn'>;

export async function syncSuperAdmins(userRepo: Repository<User>, logger: LogLike) {
  const keepEmails = new Set<string>(SUPER_ADMIN_SEEDS.map((seed) => seed.email));
  const existingSuperAdmins = await userRepo.find({ where: { role: UserRoleEnum.SUPER_ADMIN } });

  for (const user of existingSuperAdmins) {
    if (!keepEmails.has(user.email)) {
      await userRepo.remove(user);
      logger.log?.(`Removed legacy super admin ${user.email}`);
    }
  }

  for (const seed of SUPER_ADMIN_SEEDS) {
    const existing = await userRepo.findOne({ where: { email: seed.email } });

    if (existing) {
      // User already exists — skip all updates. No password re-hash, no UPDATE query.
      continue;
    }

    const passwordHash = await bcrypt.hash(seed.password, 12);
    await userRepo.save(
      userRepo.create({
        email: seed.email,
        passwordHash,
        name: seed.name,
        role: UserRoleEnum.SUPER_ADMIN,
        status: UserStatusEnum.APPROVED,
      }),
    );
    logger.log?.(`Seeded super admin ${seed.email}`);
  }
}