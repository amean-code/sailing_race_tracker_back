import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Boat } from '../entities/boat.entity';
import { RaceApplication } from '../entities/race-application.entity';
import { BoatsService } from './boats.service';
import { BoatsController } from './boats.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Boat, RaceApplication])],
  controllers: [BoatsController],
  providers: [BoatsService],
  exports: [BoatsService],
})
export class BoatsModule {}
