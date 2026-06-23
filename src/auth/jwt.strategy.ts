import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AUTH_COOKIE } from '../common/constants';
import { SessionUser } from '../common/decorators/current-user.decorator';

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  name: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.[AUTH_COOKIE] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): SessionUser {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Yetkisiz erişim');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name ?? null,
    };
  }
}
