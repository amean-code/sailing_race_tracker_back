import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { Race } from '../entities/race.entity';
import { SailorService } from './sailor.service';
import { SailorController } from './sailor.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RaceApplication, Race])],
  controllers: [SailorController],
  providers: [SailorService],
})
export class SailorModule {}
