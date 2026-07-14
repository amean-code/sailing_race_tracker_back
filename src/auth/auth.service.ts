import {
  ConflictException,
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
import { UserRoleEnum, NotificationEventEnum } from '../common/constants';
import { LoginDto, RegisterDto, InviteRefereeDto, SetupPasswordDto } from './dto/auth.dto';
import { NotificationsService } from '../notifications/notifications.service';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
  ) {}

  createToken(user: Pick<User, 'id' | 'email' | 'name' | 'role'>) {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
  }

  toPublicUser(user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'createdAt'>) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
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
    });
    const saved = await this.usersRepo.save(user);
    this.notificationsService.dispatchAsync(NotificationEventEnum.USER_REGISTERED, {
      userName: saved.name ?? undefined,
      userEmail: saved.email,
    });
    return { user: this.toPublicUser(saved), token: this.createToken(saved) };
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
    return { user: this.toPublicUser(user), token: this.createToken(user) };
  }

  async getMe(userId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: ['id', 'email', 'name', 'role', 'createdAt'],
    });
    if (!user) {
      throw new UnauthorizedException('Yetkisiz erişim');
    }
    return this.toPublicUser(user);
  }

  async getReferees() {
    const users = await this.usersRepo.find({
      where: { role: UserRoleEnum.COMMITTEE },
      select: ['id', 'email', 'name', 'createdAt', 'inviteToken', 'inviteTokenExpires', 'passwordHash'],
      order: { createdAt: 'DESC' },
    });
    return users.map((user) => {
      const isPending = !user.name || !!user.inviteToken || !user.passwordHash;
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
      if (existing.inviteToken || !existing.passwordHash) {
        existing.inviteToken = uuidv4();
        existing.inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
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
      role: UserRoleEnum.COMMITTEE,
      passwordHash: '',
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

  async setupPassword(dto: SetupPasswordDto) {
    const user = await this.usersRepo.findOne({
      where: { inviteToken: dto.token },
    });
    if (!user) {
      throw new BadRequestException('Geçersiz veya süresi dolmuş davet linki.');
    }
    if (user.inviteTokenExpires && user.inviteTokenExpires < new Date()) {
      throw new BadRequestException('Davet linkinin süresi dolmuş.');
    }

    user.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    user.name = dto.name || 'Hakem';
    user.inviteToken = null;
    user.inviteTokenExpires = null;

    await this.usersRepo.save(user);
    return { user: this.toPublicUser(user), token: this.createToken(user) };
  }
}
