import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RaceApplication } from '../entities/race-application.entity';
import { ApplicationsController } from './applications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RaceApplication])],
  controllers: [ApplicationsController],
})
export class ApplicationsModule {}
