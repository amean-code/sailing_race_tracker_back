import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RaceEngineService } from './race-engine.service';
import { Race } from '../entities/race.entity';
import { Course } from '../entities/course.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { TrackPoint } from '../entities/track-point.entity';
import { RacesModule } from '../races/races.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Race, Course, RaceApplication, CheckpointPass, TrackPoint]),
    RacesModule,
  ],
  providers: [RaceEngineService]
})
export class RaceEngineModule {}
