import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { Race } from '../entities/race.entity';
import { CheckpointPass } from '../entities/checkpoint-pass.entity';
import { Boat } from '../entities/boat.entity';
import { SailorService } from './sailor.service';
import { SailorController } from './sailor.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RaceApplication, Race, CheckpointPass, Boat])],
  controllers: [SailorController],
  providers: [SailorService],
})
export class SailorModule {}
