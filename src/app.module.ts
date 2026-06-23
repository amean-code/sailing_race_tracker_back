import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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
} from './entities';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { CoursesModule } from './courses/courses.module';
import { RacesModule } from './races/races.module';
import { BoatsModule } from './boats/boats.module';
import { TrackPointsModule } from './track-points/track-points.module';
import { ApplicationsModule } from './applications/applications.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SailorModule } from './sailor/sailor.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

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
        ],
        synchronize: false,
        migrations: ['dist/database/migrations/*.js'],
        migrationsRun: false,
      }),
    }),
    AuthModule,
    HealthModule,
    CoursesModule,
    RacesModule,
    BoatsModule,
    TrackPointsModule,
    ApplicationsModule,
    NotificationsModule,
    SailorModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
