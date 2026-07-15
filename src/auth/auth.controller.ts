import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  InviteRefereeDto,
  SetupPasswordDto,
  UpdateUserStatusDto,
  CreateAdminDto,
  UpdateAdminDto,
  UpdateProfileDto,
} from './dto/auth.dto';
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
    if (token) this.setCookie(res, token);
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

  @Patch('me')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Oturumdaki kullanıcının profilini güncelle' })
  async updateProfile(@CurrentUser() session: SessionUser, @Body() dto: UpdateProfileDto) {
    if (!session?.sub) throw new UnauthorizedException('Yetkisiz erişim');
    const user = await this.authService.updateProfile(session.sub, dto);
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

  @Get('users')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Kullanıcı onay listesini getir (Admin/Super Admin)' })
  async getUsers() {
    const users = await this.authService.listUsers();
    return { users };
  }

  @Patch('users/:id/status')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Kullanıcı durumunu güncelle (Admin/Super Admin)' })
  async updateUserStatus(
    @CurrentUser() session: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const user = await this.authService.updateUserStatus(session, id, dto);
    return { user };
  }

  @Get('admins')
  @Roles('SUPER_ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Yöneticileri listele (Sadece Super Admin)' })
  async getAdmins() {
    const admins = await this.authService.listAdmins();
    return { admins };
  }

  @Get('admins/:id')
  @Roles('SUPER_ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Yönetici detayını getir (Sadece Super Admin)' })
  async getAdmin(@Param('id') id: string) {
    const admin = await this.authService.getAdmin(id);
    return { admin };
  }

  @Post('admins')
  @Roles('SUPER_ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Yeni yönetici oluştur (Sadece Super Admin)' })
  async createAdmin(@Body() dto: CreateAdminDto) {
    const admin = await this.authService.createAdmin(dto);
    return { admin };
  }

  @Patch('admins/:id')
  @Roles('SUPER_ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Yönetici bilgilerini güncelle (Sadece Super Admin)' })
  async updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    const admin = await this.authService.updateAdmin(id, dto);
    return { admin };
  }

  @Patch('admins/:id/status')
  @Roles('SUPER_ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Yönetici durumunu güncelle (Sadece Super Admin)' })
  async updateAdminStatus(
    @CurrentUser() session: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const admin = await this.authService.updateAdminStatus(session, id, dto);
    return { admin };
  }

  @Delete('admins/:id')
  @Roles('SUPER_ADMIN')
  @ApiCookieAuth(AUTH_COOKIE)
  @ApiOperation({ summary: 'Yönetici sil (Sadece Super Admin)' })
  async deleteAdmin(@CurrentUser() session: SessionUser, @Param('id') id: string) {
    return this.authService.deleteAdmin(session, id);
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
  @Get('invite-info/:token')
  @ApiOperation({ summary: 'Davet linki bilgilerini getir' })
  async getInviteInfo(@Param('token') token: string) {
    return this.authService.getInviteInfo(token);
  }

  @Public()
  @Post('setup-password')
  @ApiOperation({ summary: 'Davet linki üzerinden şifre belirle ve giriş yap' })
  async setupPassword(@Body() dto: SetupPasswordDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.authService.setupPassword(dto);
    if (token) this.setCookie(res, token);
    return { user };
  }
}
