import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Race } from '../entities/race.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { Boat } from '../entities/boat.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { RacesService } from './races.service';
import { RaceFleetService } from './race-fleet.service';
import { RacesController } from './races.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackPointsModule } from '../track-points/track-points.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Race, RaceApplication, Boat, CheckpointPass]),
    NotificationsModule,
    TrackPointsModule,
  ],
  controllers: [RacesController],
  providers: [RacesService, RaceFleetService],
  exports: [RacesService, RaceFleetService],
})
export class RacesModule {}
