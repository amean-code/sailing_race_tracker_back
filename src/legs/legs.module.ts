import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Leg } from '../entities/leg.entity';
import { Race } from '../entities/race.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { Trophy } from '../entities/trophy.entity';
import { User } from '../entities/user.entity';
import { LegsService } from './legs.service';
import { LegsController } from './legs.controller';
import { LegsBootstrapService } from './legs-bootstrap.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { RaceResult } from '../entities/race-result.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Leg, Race, RaceApplication, Trophy, User, RaceResult]),
    NotificationsModule,
  ],
  controllers: [LegsController],
  providers: [LegsService, LegsBootstrapService],
  exports: [LegsService],
})
export class LegsModule {}
