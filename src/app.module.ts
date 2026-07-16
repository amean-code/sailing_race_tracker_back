import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { syncSuperAdmins } from './common/utils/super-admin-bootstrap';

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
        synchronize: false, logging: true,
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
      await syncSuperAdmins(this.usersRepo, this.logger);
    } catch (err) {
      this.logger.error('Super Admin bootstrap failed', err);
    }
  }
}
