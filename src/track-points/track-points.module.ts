import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackPoint } from '../entities/track-point.entity';
import { TrackPointsService } from './track-points.service';
import { TrackPointsController } from './track-points.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TrackPoint])],
  controllers: [TrackPointsController],
  providers: [TrackPointsService],
  exports: [TrackPointsService],
})
export class TrackPointsModule {}
