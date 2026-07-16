import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../entities/user.entity';
import { UserRoleEnum, UserStatusEnum, NotificationEventEnum } from '../common/constants';
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
import { NotificationsService } from '../notifications/notifications.service';
import { SessionUser } from '../common/decorators/current-user.decorator';

const SALT_ROUNDS = 12;

function getBlockedAccountMessage(status: UserStatusEnum) {
  if (status === UserStatusEnum.PENDING) return 'Hesabınız yönetici onayı bekliyor.';
  if (status === UserStatusEnum.REJECTED) return 'Hesabınız reddedildi. Lütfen yönetici ile iletişime geçin.';
  return 'Hesabınız askıya alındı. Lütfen yönetici ile iletişime geçin.';
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
  ) {}

  createToken(user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'status'>) {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      status: user.status,
    });
  }

  toPublicUser(user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'status' | 'createdAt' | 'photoUrl'>) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      photoUrl: user.photoUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private toAdminRecord(user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'status' | 'phone' | 'createdAt' | 'updatedAt' | 'lastLoginAt' | 'inviteToken' | 'photoUrl'>) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: user.status,
      inviteToken: user.inviteToken,
      photoUrl: user.photoUrl,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  }

  private canManageUser(actor: Pick<SessionUser, 'role' | 'sub'>, target: User) {
    if (actor.role === UserRoleEnum.SUPER_ADMIN) return true;
    if (target.role === UserRoleEnum.SUPER_ADMIN) return false;
    if (target.role === UserRoleEnum.ADMIN) return false;
    return actor.role === UserRoleEnum.ADMIN;
  }

  private assertUserCanAccess(user: User) {
    if (user.status !== UserStatusEnum.APPROVED) {
      throw new UnauthorizedException(getBlockedAccountMessage(user.status));
    }
  }

  private toAdminUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      inviteTokenExpires: user.inviteTokenExpires ? user.inviteTokenExpires.toISOString() : null,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Bu e-posta zaten kayıtlı');
    }

    const user = this.usersRepo.create({
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
      name: dto.name ?? null,
      role: (dto.role as UserRoleEnum) ?? UserRoleEnum.SAILOR,
      status:
        dto.role === UserRoleEnum.ADMIN || dto.role === UserRoleEnum.SUPER_ADMIN
          ? UserStatusEnum.APPROVED
          : UserStatusEnum.PENDING,
    });
    const saved = await this.usersRepo.save(user);
    this.notificationsService.dispatchAsync(NotificationEventEnum.USER_REGISTERED, {
      userName: saved.name ?? undefined,
      userEmail: saved.email,
    });
    return { user: this.toPublicUser(saved), token: saved.status === UserStatusEnum.APPROVED ? this.createToken(saved) : undefined };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('E-posta veya şifre hatalı');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('E-posta veya şifre hatalı');
    }
    this.assertUserCanAccess(user);
    user.lastLoginAt = new Date();
    await this.usersRepo.save(user);
    return { user: this.toPublicUser(user), token: this.createToken(user) };
  }

  async getMe(userId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: ['id', 'email', 'name', 'role', 'status', 'createdAt'],
    });
    if (!user) {
      throw new UnauthorizedException('Yetkisiz erişim');
    }
    return this.toPublicUser(user);
  }

  async listUsers() {
    const users = await this.usersRepo.find({
      select: ['id', 'email', 'name', 'phone', 'role', 'status', 'createdAt', 'updatedAt', 'inviteTokenExpires', 'lastLoginAt'],
      order: { createdAt: 'DESC' },
    });
    return users.map((user) => this.toAdminUser(user));
  }

  async listAdmins() {
    const admins = await this.usersRepo.find({
      where: { role: UserRoleEnum.ADMIN },
      select: ['id', 'email', 'name', 'phone', 'role', 'status', 'createdAt', 'updatedAt', 'lastLoginAt', 'inviteToken'],
      order: { createdAt: 'DESC' },
    });
    return admins.map((admin) => this.toAdminRecord(admin));
  }

  async getAdmin(id: string) {
    const admin = await this.usersRepo.findOne({
      where: { id, role: UserRoleEnum.ADMIN },
      select: ['id', 'email', 'name', 'phone', 'role', 'status', 'createdAt', 'updatedAt', 'lastLoginAt', 'inviteToken'],
    });
    if (!admin) {
      throw new NotFoundException('Yönetici bulunamadı.');
    }
    return this.toAdminRecord(admin);
  }

  async createAdmin(dto: CreateAdminDto) {
    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Bu e-posta zaten kayıtlı');
    }

    const admin = this.usersRepo.create({
      email: dto.email,
      passwordHash: '',
      name: dto.name,
      phone: dto.phone?.trim() || null,
      role: UserRoleEnum.ADMIN,
      status: UserStatusEnum.PENDING,
      inviteToken: uuidv4(),
      inviteTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      lastLoginAt: null,
    });

    const saved = await this.usersRepo.save(admin);
    return this.toAdminRecord(saved);
  }

  async updateAdmin(id: string, dto: UpdateAdminDto) {
    const admin = await this.usersRepo.findOne({
      where: { id, role: UserRoleEnum.ADMIN },
      select: ['id', 'email', 'name', 'phone', 'role', 'status', 'createdAt', 'updatedAt', 'lastLoginAt', 'passwordHash', 'inviteToken'],
    });
    if (!admin) {
      throw new NotFoundException('Yönetici bulunamadı.');
    }

    if (dto.email && dto.email !== admin.email) {
      const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
      if (existing && existing.id !== admin.id) {
        throw new ConflictException('Bu e-posta zaten kayıtlı');
      }
      admin.email = dto.email;
    }

    if (typeof dto.name === 'string') {
      admin.name = dto.name.trim();
    }

    if (dto.phone !== undefined) {
      admin.phone = dto.phone?.trim() || null;
    }

    const saved = await this.usersRepo.save(admin);
    return this.toAdminRecord(saved);
  }

  async updateAdminStatus(actor: Pick<SessionUser, 'role' | 'sub'>, id: string, dto: UpdateUserStatusDto) {
    if (![UserStatusEnum.APPROVED, UserStatusEnum.SUSPENDED].includes(dto.status)) {
      throw new BadRequestException('Yönetici durumu yalnızca aktif veya pasif olabilir.');
    }

    const admin = await this.usersRepo.findOne({
      where: { id, role: UserRoleEnum.ADMIN },
      select: ['id', 'email', 'name', 'phone', 'role', 'status', 'createdAt', 'updatedAt', 'lastLoginAt'],
    });
    if (!admin) {
      throw new NotFoundException('Yönetici bulunamadı.');
    }

    if (actor.sub === admin.id && dto.status === UserStatusEnum.SUSPENDED) {
      throw new BadRequestException('Kendi hesabınızı pasife alamazsınız.');
    }

    admin.status = dto.status;
    const saved = await this.usersRepo.save(admin);
    return this.toAdminRecord(saved);
  }

  async deleteAdmin(actor: Pick<SessionUser, 'role' | 'sub'>, id: string) {
    const admin = await this.usersRepo.findOne({
      where: { id, role: UserRoleEnum.ADMIN },
      select: ['id', 'email', 'name', 'phone', 'role', 'status', 'createdAt', 'updatedAt', 'lastLoginAt'],
    });
    if (!admin) {
      throw new NotFoundException('Yönetici bulunamadı.');
    }

    if (actor.sub === admin.id) {
      throw new BadRequestException('Kendi hesabınızı silemezsiniz.');
    }

    if (admin.status === UserStatusEnum.APPROVED) {
      throw new BadRequestException('Önce yöneticiyi pasif hale getirin.');
    }

    await this.usersRepo.remove(admin);
    return { success: true };
  }

  async updateUserStatus(actor: Pick<SessionUser, 'role' | 'sub'>, id: string, dto: UpdateUserStatusDto) {
    const user = await this.usersRepo.findOne({
      where: { id },
      select: ['id', 'email', 'name', 'phone', 'role', 'status', 'createdAt', 'updatedAt', 'inviteToken', 'inviteTokenExpires', 'passwordHash'],
    });
    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }
    if (!this.canManageUser(actor, user)) {
      throw new ForbiddenException('Bu kullanıcı için işlem yapmaya yetkiniz yok');
    }

    user.status = dto.status;
    if (dto.status !== UserStatusEnum.PENDING) {
      user.inviteToken = null;
      user.inviteTokenExpires = null;
    }

    const saved = await this.usersRepo.save(user);
    return this.toAdminUser(saved);
  }

  async getReferees() {
    const users = await this.usersRepo.find({
      where: { role: UserRoleEnum.COMMITTEE },
      select: ['id', 'email', 'name', 'createdAt', 'inviteToken', 'inviteTokenExpires', 'passwordHash', 'status'],
      order: { createdAt: 'DESC' },
    });
    return users.map((user) => {
      const isPending = user.status !== UserStatusEnum.APPROVED || !user.name || !!user.inviteToken || !user.passwordHash;
      return {
        id: user.id,
        email: user.email,
        name: user.name || '',
        status: isPending ? 'PENDING' : 'ACTIVE',
        inviteToken: user.inviteToken,
        createdAt: user.createdAt,
      };
    });
  }

  async inviteReferee(dto: InviteRefereeDto) {
    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      if (existing.role !== UserRoleEnum.COMMITTEE) {
        throw new BadRequestException('Bu e-posta adresi farklı bir role sahip.');
      }
      if (existing.inviteToken || !existing.passwordHash || existing.status !== UserStatusEnum.APPROVED) {
        existing.inviteToken = uuidv4();
        existing.inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        existing.status = UserStatusEnum.PENDING;
        if (dto.name) {
          existing.name = dto.name;
        }
        await this.usersRepo.save(existing);
        return {
          id: existing.id,
          email: existing.email,
          inviteToken: existing.inviteToken,
        };
      }
      throw new BadRequestException('Bu hakem zaten kayıtlı ve şifresini belirlemiş.');
    }

    const newUser = this.usersRepo.create({
      email: dto.email,
      name: dto.name || '',
      role: UserRoleEnum.COMMITTEE,
      passwordHash: '',
      status: UserStatusEnum.PENDING,
      inviteToken: uuidv4(),
      inviteTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    await this.usersRepo.save(newUser);
    return {
      id: newUser.id,
      email: newUser.email,
      inviteToken: newUser.inviteToken,
    };
  }

  async deleteReferee(id: string) {
    const user = await this.usersRepo.findOne({ where: { id, role: UserRoleEnum.COMMITTEE } });
    if (!user) {
      throw new NotFoundException('Hakem bulunamadı.');
    }
    await this.usersRepo.remove(user);
    return { success: true };
  }

  async getInviteInfo(token: string) {
    const user = await this.usersRepo.findOne({
      where: { inviteToken: token },
    });
    if (!user) {
      throw new BadRequestException('Geçersiz davet linki.');
    }
    return {
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async setupPassword(dto: SetupPasswordDto) {
    const user = await this.usersRepo.findOne({
      where: { inviteToken: dto.token },
    });

    if (!user) throw new BadRequestException('Geçersiz davet linki');

    user.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    if (dto.name) user.name = dto.name;
    user.status = UserStatusEnum.APPROVED;
    user.inviteToken = null;
    user.inviteTokenExpires = null;

    const saved = await this.usersRepo.save(user);

    return {
      user: this.toPublicUser(saved),
      token: this.createToken(saved),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.photoUrl !== undefined) user.photoUrl = dto.photoUrl;
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    }

    const saved = await this.usersRepo.save(user);
    return this.toPublicUser(saved);
  }
}
