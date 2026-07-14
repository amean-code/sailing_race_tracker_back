import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, InviteRefereeDto, SetupPasswordDto } from './dto/auth.dto';
import { Public, CurrentUser, SessionUser, Roles } from '../common/decorators';
import { AUTH_COOKIE } from '../common/constants';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private setCookie(res: Response, token: string) {
    const isProd = this.config.get('NODE_ENV') === 'production';
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 * 1000,
    });
  }

  private clearCookie(res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Yeni kullanıcı kaydı' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.authService.register(dto);
    this.setCookie(res, token);
    return { user };
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'E-posta ile giriş' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.authService.login(dto);
    this.setCookie(res, token);
    return { user };
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Oturumu kapat' })
  logout(@Res({ passthrough: true }) res: Response) {
    this.clearCookie(res);
    return { ok: true };
  }

  @Get('me')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Oturumdaki kullanıcı' })
  async me(@CurrentUser() session: SessionUser) {
    if (!session?.sub) throw new UnauthorizedException('Yetkisiz erişim');
    const user = await this.authService.getMe(session.sub);
    return { user };
  }

  @Get('referees')
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Tüm hakemleri listele (Sadece Admin)' })
  async getReferees() {
    const referees = await this.authService.getReferees();
    return { referees };
  }

  @Post('invite-referee')
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Yeni hakem davet et (Sadece Admin)' })
  async inviteReferee(@Body() dto: InviteRefereeDto) {
    return this.authService.inviteReferee(dto);
  }

  @Delete('referees/:id')
  @Roles('ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Hakem sil (Sadece Admin)' })
  async deleteReferee(@Param('id') id: string) {
    return this.authService.deleteReferee(id);
  }

  @Public()
  @Post('setup-password')
  @ApiOperation({ summary: 'Davet linki üzerinden şifre belirle ve giriş yap' })
  async setupPassword(@Body() dto: SetupPasswordDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.authService.setupPassword(dto);
    this.setCookie(res, token);
    return { user };
  }
}
