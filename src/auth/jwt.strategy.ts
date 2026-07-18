import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AUTH_COOKIE } from '../common/constants';
import { SessionUser } from '../common/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { UserStatusEnum } from '../common/constants';

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  name: string | null;
  status?: string;
};

/** Short-lived in-memory user cache to avoid a DB hit on every authenticated request.
 *  Entries expire after USER_CACHE_TTL_MS milliseconds, so status changes propagate quickly. */
const USER_CACHE_TTL_MS = 10_000; // 10 seconds

type CachedUser = { user: SessionUser; expiresAt: number };
const userCache = new Map<string, CachedUser>();

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.[AUTH_COOKIE] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<SessionUser> {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Yetkisiz erişim');
    }

    // Return cached session user if still valid
    const cached = userCache.get(payload.sub);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    const user = await this.usersRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'email', 'name', 'role', 'status'],
    });
    if (!user) {
      userCache.delete(payload.sub);
      throw new UnauthorizedException('Yetkisiz erişim');
    }
    if (user.status !== UserStatusEnum.APPROVED) {
      userCache.delete(payload.sub);
      throw new UnauthorizedException(
        user.status === UserStatusEnum.PENDING
          ? 'Hesabınız yönetici onayı bekliyor.'
          : user.status === UserStatusEnum.REJECTED
            ? 'Hesabınız reddedildi. Lütfen yönetici ile iletişime geçin.'
            : 'Hesabınız askıya alındı. Lütfen yönetici ile iletişime geçin.',
      );
    }

    const sessionUser: SessionUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      status: user.status,
    };

    // Cache the resolved user for a short TTL to eliminate duplicate DB lookups
    // within the same page-load burst of parallel requests.
    userCache.set(payload.sub, { user: sessionUser, expiresAt: Date.now() + USER_CACHE_TTL_MS });

    return sessionUser;
  }
}
