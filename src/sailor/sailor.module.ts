import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { Race } from '../entities/race.entity';
import { RaceResult } from '../entities/race-result.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { Boat } from '../entities/boat.entity';
import { TrackPointsModule } from '../track-points/track-points.module';
import { SailorService } from './sailor.service';
import { SailorController } from './sailor.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([RaceApplication, Race, RaceResult, CheckpointPass, Boat]),
    TrackPointsModule,
  ],
  controllers: [SailorController],
  providers: [SailorService],
})
export class SailorModule {}
