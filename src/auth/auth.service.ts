import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserRoleEnum, NotificationEventEnum } from '../common/constants';
import { LoginDto, RegisterDto } from './dto/auth.dto';
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
}
