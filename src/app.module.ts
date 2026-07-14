import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  User,
  Course,
  Boat,
  TrackPoint,
  Race,
  RaceApplication,
  NotificationIntegration,
  NotificationRule,
  NotificationLog,
  SignalFlagCatalogEntity,
  CheckpointPass,
} from './entities';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { CoursesModule } from './courses/courses.module';
import { RacesModule } from './races/races.module';
import { BoatsModule } from './boats/boats.module';
import { TrackPointsModule } from './track-points/track-points.module';
import { ApplicationsModule } from './applications/applications.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SignalFlagsModule } from './signal-flags/signal-flags.module';
import { SailorModule } from './sailor/sailor.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UserRoleEnum } from './common/constants';

const SUPER_ADMIN_EMAIL = 'emredgli07@gmail.com';
const SUPER_ADMIN_PASSWORD = '11120617Hed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [
          User,
          Course,
          Boat,
          TrackPoint,
          Race,
          RaceApplication,
          NotificationIntegration,
          NotificationRule,
          NotificationLog,
          SignalFlagCatalogEntity,
          CheckpointPass,
        ],
        synchronize: true,
        migrations: ['dist/database/migrations/*.js'],
        migrationsRun: false,
      }),
    }),
    TypeOrmModule.forFeature([User]),
    AuthModule,
    HealthModule,
    CoursesModule,
    RacesModule,
    BoatsModule,
    TrackPointsModule,
    ApplicationsModule,
    NotificationsModule,
    SignalFlagsModule,
    SailorModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements OnApplicationBootstrap {
  private readonly logger = new Logger('AppModule');

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async onApplicationBootstrap() {
    try {
      const existing = await this.usersRepo.findOne({ where: { email: SUPER_ADMIN_EMAIL } });
      if (!existing) {
        const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
        await this.usersRepo.save(
          this.usersRepo.create({
            email: SUPER_ADMIN_EMAIL,
            passwordHash,
            name: 'Super Admin',
            role: UserRoleEnum.SUPER_ADMIN,
          }),
        );
        this.logger.log(`Super Admin created: ${SUPER_ADMIN_EMAIL}`);
      } else if (existing.role !== UserRoleEnum.SUPER_ADMIN) {
        existing.role = UserRoleEnum.SUPER_ADMIN;
        await this.usersRepo.save(existing);
        this.logger.log(`Super Admin role upgraded: ${SUPER_ADMIN_EMAIL}`);
      }
    } catch (err) {
      this.logger.error('Super Admin bootstrap failed', err);
    }
  }
}
