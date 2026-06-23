import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Boat } from '../entities/boat.entity';
import { BoatsService } from './boats.service';
import { BoatsController } from './boats.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Boat])],
  controllers: [BoatsController],
  providers: [BoatsService],
  exports: [BoatsService],
})
export class BoatsModule {}
