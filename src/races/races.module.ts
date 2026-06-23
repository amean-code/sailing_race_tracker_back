import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Race } from '../entities/race.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { RacesService } from './races.service';
import { RacesController } from './races.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Race, RaceApplication]),
    NotificationsModule,
  ],
  controllers: [RacesController],
  providers: [RacesService],
  exports: [RacesService],
})
export class RacesModule {}
