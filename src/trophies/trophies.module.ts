import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trophy } from '../entities/trophy.entity';
import { Race } from '../entities/race.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { Course } from '../entities/course.entity';
import { User } from '../entities/user.entity';
import { TrophiesService } from './trophies.service';
import { TrophiesController } from './trophies.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trophy, Race, RaceApplication, Course, User]),
    NotificationsModule,
  ],
  controllers: [TrophiesController],
  providers: [TrophiesService],
  exports: [TrophiesService],
})
export class TrophiesModule {}
